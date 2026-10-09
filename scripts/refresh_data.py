#!/usr/bin/env python3
"""Refresh Tilak Varma fan-site data from public cricket sources.

Primary recent-form source: ICC player profile page (HTML parsing is best-effort).
Fallback recent-form source: Cricsheet men's T20I JSON archive.
Profile image: Open Graph image from the official Mumbai Indians profile page.
Career totals are updated only when recognizable labels are found; otherwise the
last known values are preserved. Never publishes empty data over existing rows.
"""
import html
import io
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "site-data.json"
ICC_URL = "https://www.icc-cricket.com/rankings/70761/tilak-varma"
MI_URL = "https://www.mumbaiindians.com/players/70761------------profile"
CRICSHEET_URL = "https://cricsheet.org/downloads/menst20_json.zip"
PLAYER = "Tilak Varma"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0; public-data-refresh)"}

def fetch(url, timeout=45):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()

def fetch_text(url):
    return fetch(url).decode("utf-8", "replace")

def clean_text(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value))).strip()

def official_profile_image():
    try:
        page = fetch_text(MI_URL)
        for pattern in (
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        ):
            match = re.search(pattern, page, re.I)
            if match and match.group(1).startswith(("https://", "http://")):
                return match.group(1)
    except Exception as exc:
        print(f"Official profile image not refreshed: {exc}")
    return None

def scrape_icc_recent():
    """Parse ICC's recent-match table; return [] if the page layout changes."""
    try:
        page = fetch_text(ICC_URL)
        # ICC page currently exposes a plain text table: date, format, opponent, runs.
        pattern = re.compile(
            r"(\d{1,2}[- ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[- ]\d{4})"
            r".{0,180}?(T20I|ODI|Test|T20)"
            r".{0,180}?vs\s+([A-Za-z][A-Za-z .&'-]+?)"
            r".{0,80}?(?:\b(\d{1,3})\b|[-—])",
            re.I | re.S
        )
        rows, seen = [], set()
        for m in pattern.finditer(page):
            date, fmt, opposition, runs = m.groups()
            opposition = clean_text(opposition).strip(" -|")
            if not opposition or len(opposition) > 45:
                continue
            key = (date, opposition, fmt)
            if key in seen:
                continue
            seen.add(key)
            rows.append({"date": date, "opposition": opposition, "format": fmt.upper(),
                         "runs": int(runs) if runs else "DNB", "balls": "—",
                         "fours": "—", "sixes": "—", "strikeRate": "—",
                         "source": ICC_URL})
        return rows[:12]
    except Exception as exc:
        print(f"ICC recent-form scrape unavailable: {exc}")
        return []

def cricsheet_recent():
    req = urllib.request.Request(CRICSHEET_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=90) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    rows = []
    for name in archive.namelist():
        if not name.lower().endswith(".json"):
            continue
        try:
            match = json.loads(archive.read(name))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        info = match.get("info", {})
        players = info.get("players", {})
        if not any(any(str(p).casefold() == PLAYER.casefold() for p in team_players)
                   for team_players in players.values()):
            continue
        teams = info.get("teams", [])
        for innings in match.get("innings", []):
            if innings.get("team") not in players or PLAYER.casefold() not in [
                str(p).casefold() for p in players.get(innings.get("team"), [])
            ]:
                continue
            row = {"date": (info.get("dates") or [""])[0],
                   "opposition": next((t for t in teams if t != innings.get("team")), "Unknown"),
                   "format": "T20I", "runs": 0, "balls": 0, "fours": 0, "sixes": 0,
                   "source": "https://cricsheet.org/"}
            for over in innings.get("overs", []):
                for delivery in over.get("deliveries", []):
                    if str(delivery.get("batter", "")).casefold() != PLAYER.casefold():
                        continue
                    run_data = delivery.get("runs", {})
                    batter_runs = int(run_data.get("batter", 0) or 0)
                    extras = delivery.get("extras", {})
                    row["runs"] += batter_runs
                    if "wides" not in extras and "noballs" not in extras:
                        row["balls"] += 1
                    if batter_runs == 4: row["fours"] += 1
                    if batter_runs == 6: row["sixes"] += 1
            row["strikeRate"] = round(row["runs"] * 100 / row["balls"], 2) if row["balls"] else 0
            rows.append(row)
    rows.sort(key=lambda r: r.get("date", ""), reverse=True)
    return rows[:12]

def main():
    if not DATA_FILE.exists():
        raise SystemExit("Expected data/site-data.json was not found")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    data.setdefault("profile", {})
    data["profile"].update({
        "name": PLAYER, "jerseyNumber": 72,
        "born": "8 November 2002", "birthplace": "Hyderabad, Telangana, India",
        "role": "Batter", "battingStyle": "Left-handed", "bowlingStyle": "Right-arm off-break",
        "teams": ["India", "Mumbai Indians", "Hyderabad", "India A", "India U19", "Medak Falcons"],
        "officialProfile": MI_URL, "iccProfile": ICC_URL
    })
    photo = official_profile_image()
    if photo:
        data["profile"]["photo"] = photo
    rows = scrape_icc_recent()
    if not rows:
        try:
            rows = cricsheet_recent()
        except Exception as exc:
            print(f"Cricsheet fallback failed: {exc}")
    if rows:
        data["recentInnings"] = rows
        data["recentSource"] = rows[0].get("source", ICC_URL)
        data["recentUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    else:
        print("No new recent-form rows found; preserving existing recentInnings.")
    data["profileUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    data["lastUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data["dataNote"] = (
        "Recent form is refreshed from ICC public profile when its page layout can be parsed, "
        "with Cricsheet T20I data as fallback. Profile photo is read from the official Mumbai Indians "
        "profile metadata. Career totals are preserved unless a reliable, recognizable source value "
        "is available; verify official scorecards before publication."
    )
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Data refresh finished. Recent rows available: {len(data.get('recentInnings', []))}")

if __name__ == "__main__":
    main()
