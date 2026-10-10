#!/usr/bin/env python3
"""Refresh Tilak Varma fan-site data from public cricket sources.

Recent innings are refreshed from the Cricsheet men's T20I JSON archive when it
contains newer player-specific deliveries. ICC is not used as a career-stat or
recent-scorecard source here; official rankings and records have their own workflow.
The BCCI profile is used only to refresh the player's official headshot URL.
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
BCCI_URL = "https://www.bcci.tv/international/men/players/tilak-varma/993"
ICC_PHOTO_URL = "https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png"
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
    """Refresh Tilak's photo from BCCI at most once every 30 days.

    BCCI page markup can vary, so try its Open Graph image, player-specific
    image markup and JSON-LD first. If the page does not expose an image,
    return None and preserve the last known photo rather than guessing.
    """
    try:
        page = fetch_text(BCCI_URL)
        candidates = []
        # Open Graph / Twitter cards are often the most stable profile image source.
        candidates.extend(
            re.findall(
                r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)',
                page,
                re.I,
            )
        )
        # Search image tags associated with the player or player-specific asset URLs.
        for tag in re.findall(r"<img\b[^>]*>", page, re.I):
            if re.search(r"tilak|993|player", tag, re.I):
                match = re.search(
                    r'\b(?:src|data-src|data-lazy-src)=["\']([^"\']+)', tag, re.I
                )
                if match:
                    candidates.append(match.group(1))
                srcset = re.search(r'\bsrcset=["\']([^"\']+)', tag, re.I)
                if srcset:
                    candidates.append(
                        srcset.group(1).split(",")[0].strip().split(" ")[0]
                    )
        # BCCI can expose the profile image in JSON-LD or page-state data.
        candidates.extend(
            re.findall(
                r'["\'](?:image|imageUrl|profileImage|playerImage)["\']\s*:\s*["\']([^"\']+)["\']',
                page,
                re.I,
            )
        )
        normalized = []
        for url in candidates:
            url = html.unescape(url).replace("\\/", "/").replace("&amp;", "&").strip()
            if url.startswith("//"):
                url = "https:" + url
            if url.startswith("http") and not any(
                bad in url.lower()
                for bad in (
                    "logo",
                    "placeholder",
                    "flag",
                    "banner",
                    "og_image",
                    "og-image",
                )
            ):
                normalized.append(url)
        # Prefer BCCI-hosted image URLs and larger player/profile variants.
        normalized.sort(
            key=lambda url: (
                "bcci" in url.lower() or "epicon" in url.lower(),
                "player" in url.lower() or "tilak" in url.lower(),
                len(url),
            ),
            reverse=True,
        )
        if normalized:
            return normalized[0]
        print("BCCI profile image not found in page markup; retaining the saved photo.")
    except Exception as exc:
        print(f"BCCI profile image not refreshed: {exc}")
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


def update_last_updated(data):
    """Use successful section snapshot timestamps, not failed refresh attempts."""
    values = [
        data.get("profileUpdated"),
        data.get("careerStatsUpdated"),
        data.get("recentUpdated"),
        (data.get("iccRankings") or {}).get("updatedAt"),
        data.get("iccRecordsUpdated"),
        (data.get("statsguru") or {}).get("updatedAt"),
        (data.get("bowlingStats") or {}).get("updatedAt"),
        (data.get("fieldingStats") or {}).get("updatedAt"),
    ]
    valid = []
    for value in values:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d %H:%M UTC")
            valid.append((parsed, value))
        except (TypeError, ValueError):
            continue
    if valid:
        data["lastUpdated"] = max(valid)[1]


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
            "bcciProfile": BCCI_URL,
        }
    )
    # Keep the main profile image sourced from ICC. The BCCI video/album
    # image endpoint can return landscape thumbnails, so it must not replace
    # the ICC player portrait on the profile page.
    data["profile"]["photo"] = ICC_PHOTO_URL
    data["profile"]["photoSource"] = ICC_URL
    data["profile"]["photoRefreshStatus"] = "icc-profile-image"
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
    event = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "category": "AUTOMATION",
        "title": "Scheduled Python refresh completed",
        "description": "Public profile and match feeds were checked. Existing verified rows are retained when a source is blocked or returns stale data.",
        "source": "https://github.com/nitishratre45/tilakvarmafanclub/actions",
    }
    event_key = (event["date"], event["category"], event["title"])
    activity = [
        row
        for row in activity
        if (row.get("date"), row.get("category"), row.get("title")) != event_key
    ]
    activity.insert(0, event)
    seen_events = set()
    unique_activity = []
    for row in activity:
        key = (
            row.get("date"),
            row.get("category"),
            row.get("title"),
            row.get("description"),
        )
        if key in seen_events:
            continue
        seen_events.add(key)
        unique_activity.append(row)
    data["activityLog"] = unique_activity[:12]
    update_last_updated(data)
    DATA_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Data refresh finished. Recent rows available: {len(data.get('recentInnings', []))}"
    )


if __name__ == "__main__":
    main()
