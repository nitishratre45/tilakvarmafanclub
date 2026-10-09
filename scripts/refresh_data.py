#!/usr/bin/env python3
"""Refresh Tilak Varma fan-site data from public cricket sources.

Recent innings are refreshed from the Cricsheet men's T20I JSON archive when it
contains newer player-specific deliveries. ICC is not used as a career-stat or
recent-scorecard source here; official rankings and records have their own workflow.
The ICC profile is used only to refresh the player's official headshot URL.
Career totals are refreshed separately from ESPNcricinfo; saved values are kept
when a public source is unavailable. Never publishes empty data over existing rows.
"""
import html
import io
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "site-data.json"
ICC_URL = "https://www.icc-cricket.com/rankings/70761/tilak-varma"
MI_URL = "https://www.mumbaiindians.com/players/70761------------profile"
CRICSHEET_URL = "https://cricsheet.org/downloads/t20s_male_json.zip"
PLAYER = "Tilak Varma"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0; public-data-refresh)"
}


def fetch(url, timeout=45):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def fetch_text(url):
    return fetch(url).decode("utf-8", "replace")


def official_profile_image():
    """Find Tilak's current India headshot URL from his official ICC profile page."""
    try:
        page = fetch_text(ICC_URL)
        # ICC exposes its player image in page markup; look for the player ID on its CDN.
        candidates = re.findall(
            r"(?:https?:)?//images\.icc-cricket\.com/image/upload/[^\"'<>\s]+",
            page,
            re.I,
        )
        candidates = [html.unescape(url).replace("&amp;", "&") for url in candidates]
        player_images = [
            url
            for url in candidates
            if "70761" in url
            and any(term in url.lower() for term in ("player", "assets/players"))
        ]
        if player_images:
            return next(
                (url for url in player_images if "headshot" in url.lower()),
                player_images[0],
            )
        # ICC can omit the player image from server-rendered HTML.
        # Return None rather than inventing a fallback URL; keep the last saved photo.
    except Exception as exc:
        print(f"ICC profile image not refreshed: {exc}")
    return None


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
        if str(info.get("match_type", "")).lower() not in {"t20", "t20i", "it20"}:
            continue
        if str(info.get("team_type", "international")).lower() != "international":
            continue
        if str(info.get("gender", "male")).lower() not in {"male", "men", ""}:
            continue
        players = info.get("players", {})
        if not any(
            any(str(p).casefold() == PLAYER.casefold() for p in team_players)
            for team_players in players.values()
        ):
            continue
        teams = info.get("teams", [])
        for innings in match.get("innings", []):
            if innings.get("team") not in players or PLAYER.casefold() not in [
                str(p).casefold() for p in players.get(innings.get("team"), [])
            ]:
                continue
            row = {
                "date": (info.get("dates") or [""])[0],
                "opposition": next(
                    (t for t in teams if t != innings.get("team")), "Unknown"
                ),
                "format": "T20I",
                "runs": 0,
                "balls": 0,
                "fours": 0,
                "sixes": 0,
                "source": "https://cricsheet.org/",
            }
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
                    if batter_runs == 4:
                        row["fours"] += 1
                    if batter_runs == 6:
                        row["sixes"] += 1
            row["strikeRate"] = (
                round(row["runs"] * 100 / row["balls"], 2) if row["balls"] else 0
            )
            rows.append(row)
    rows.sort(key=lambda r: r.get("date", ""), reverse=True)
    return rows[:12]


def main():
    if not DATA_FILE.exists():
        raise SystemExit("Expected data/site-data.json was not found")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    data.setdefault("profile", {})
    data["profile"].update(
        {
            "name": PLAYER,
            "jerseyNumber": 72,
            "born": "8 November 2002",
            "birthplace": "Hyderabad, Telangana, India",
            "role": "Batter",
            "battingStyle": "Left-handed",
            "bowlingStyle": "Right-arm off-break",
            "teams": [
                "India",
                "Mumbai Indians",
                "Hyderabad",
                "India A",
                "India U19",
                "Medak Falcons",
            ],
            "officialProfile": MI_URL,
            "iccProfile": ICC_URL,
        }
    )
    photo = official_profile_image()
    if photo:
        data["profile"]["photo"] = photo
    # Keep ICC limited to official rankings/records and profile metadata.
    # Recent scorecard rows must come from match-level delivery data, not a ranking page.
    rows = []
    try:
        rows = cricsheet_recent()
    except Exception as exc:
        print(f"Cricsheet recent-form refresh unavailable: {exc}")
    if rows:
        existing = data.get("recentInnings", [])

        def sortable_date(row):
            value = str(row.get("date", ""))
            for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d %b %Y"):
                try:
                    return datetime.strptime(value, fmt).date()
                except ValueError:
                    pass
            return datetime.min.date()

        # Archive feeds can lag the latest scorecard. Preserve verified newer manual rows.
        newest_existing = max(
            (sortable_date(row) for row in existing), default=datetime.min.date()
        )
        newest_incoming = max(
            (sortable_date(row) for row in rows), default=datetime.min.date()
        )
        if newest_incoming > newest_existing:
            data["recentInnings"] = rows
            data["recentSource"] = rows[0].get("source", ICC_URL)
            data["recentUpdated"] = datetime.now(timezone.utc).strftime(
                "%Y-%m-%d %H:%M UTC"
            )
        else:
            print(
                "Incoming archive is older than current recent scorecards; preserving current rows."
            )
    else:
        print("No new recent-form rows found; preserving existing recentInnings.")
    checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    data["profileUpdated"] = checked_at
    data["lastChecked"] = checked_at
    data["lastRefreshStatus"] = "available" if (rows or photo) else "source-unavailable"
    data["dataNote"] = (
        "Recent innings use Cricsheet match-level delivery data when a newer verified row is available. "
        "The ICC profile is used for official player-image metadata; official rankings and records are refreshed "
        "separately. Career totals are sourced from ESPNcricinfo Statsguru and preserved when unavailable."
    )
    # Public audit trail: show scheduled refreshes on the homepage activity feed.
    activity = data.setdefault("activityLog", [])
    activity.insert(
        0,
        {
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "category": "AUTOMATION",
            "title": "Scheduled Python refresh completed",
            "description": "Public profile and match feeds were checked. Existing verified rows are retained when a source is blocked or returns stale data.",
            "source": "https://github.com/nitishratre45/tilakvarmafanclub/actions",
        },
    )
    data["activityLog"] = activity[:12]
    DATA_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Data refresh finished. Recent rows available: {len(data.get('recentInnings', []))}"
    )


if __name__ == "__main__":
    main()
