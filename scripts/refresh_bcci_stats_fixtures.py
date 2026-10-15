#!/usr/bin/env python3
"""Fetch BCCI Stats fixtures and normalize them into a same-origin JSON snapshot."""
import json, re, sys
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "matches" / "bcci-stats-fixtures.json"
SOURCE_URL = "https://stats.bcci.tv/match/fixtures/?comp_gid=65d2b784-4a75-41ca-8415-a345042030d6&comp_gid=34154bc1-ebbf-4109-ba78-67cf9cf7aafa&comp_gid=6a64053e-55fc-47ed-9cae-4c58e9b0e551&comp_gid=9a12946b-9277-4b5f-ba94-34d02355bf03&comp_gid=2c9a58d0-365c-4301-839e-b1d2a0803b2b&comp_gid=04d7f468-3b06-4dcc-88de-594afd83c561&comp_gid=52f44249-0afd-41aa-bb88-c6e7778a4f0d&comp_gid=97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2&comp_gid=5cd3ede8-16d7-4914-9d4c-2eb59671fe50&comp_gid=39a2078a-2e87-4f90-86eb-53696579466c&comp_gid=7ca2538b-b8e8-4221-b76f-4705cb75af1f&comp_gid=ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc&comp_gid=13de0d47-83d7-4351-8e6a-57d28a18be48&comp_gid=1cf7ed18-0c14-452c-840b-447aeb5dd020&comp_gid=96f00b0b-c06b-4764-bbc3-7ed388abb24b&comp_gid=dd82f86a-6aa4-477c-b0de-2706a677d0d2&min_start_date=2026-01-01&team_gid=71790c66-0e3c-4d0b-96a5-e04526040f94&team_gid=cf9ec6b2-8d90-41a9-a834-f2f120b37811&team_gid=83151b98-bbed-42ba-b397-944059ef5830&team_gid=0f99bbe0-3198-4f82-8520-e18a9e24545f&team_gid=f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8&team_gid=4eb0e97b-6e43-47f3-8e46-bedf6de77cea&team_gid=611a0e16-280f-4fe2-98e8-366ba9719962&team_gid=01d41b53-68f6-48f8-a8d0-c9ec2f338749&team_gid=eb81d735-6436-4dac-9a7a-15a7a347d5e6&team_gid=08dc4ba8-22a1-4e5a-9862-20f8a8643f99&page=1&size=12"
DATE_KEYS = (
    "start_date",
    "startDate",
    "match_date",
    "matchDate",
    "match_start_date",
    "matchStartDate",
    "fixture_date",
    "fixtureDate",
    "date",
    "start_datetime",
    "startDateTime",
    "match_date_time",
    "matchDateTime",
    "start_time",
    "startTime",
)
HOME_KEYS = (
    "team_a_name",
    "teamAName",
    "home_team_name",
    "homeTeamName",
    "team1_name",
    "team1Name",
    "local_team_name",
    "localTeamName",
    "team_a",
    "home_team",
    "homeTeam",
    "team1",
    "team_a_short_name",
    "teamA",
)
AWAY_KEYS = (
    "team_b_name",
    "teamBName",
    "away_team_name",
    "awayTeamName",
    "team2_name",
    "team2Name",
    "visitor_team_name",
    "visitorTeamName",
    "team_b",
    "away_team",
    "awayTeam",
    "team2",
    "team_b_short_name",
    "teamB",
)
MATCH_KEYS = (
    "match_name",
    "matchName",
    "match_number",
    "matchNumber",
    "match",
    "match_type",
    "matchType",
    "round_name",
    "roundName",
    "match_title",
    "matchTitle",
    "format",
    "match_format",
    "matchFormat",
)
VENUE_KEYS = (
    "venue_name",
    "venueName",
    "ground_name",
    "groundName",
    "venue",
    "location",
    "stadium",
)
TIME_KEYS = (
    "start_time_ist",
    "startTimeIST",
    "match_time",
    "matchTime",
    "time",
    "start_time",
    "startTime",
)


def first(row, keys):
    return next((row[k] for k in keys if row.get(k) not in (None, "")), "")


def team_name(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(
            first(
                value,
                (
                    "name",
                    "team_name",
                    "teamName",
                    "full_name",
                    "fullName",
                    "short_name",
                    "shortName",
                    "display_name",
                    "displayName",
                ),
            )
            or ""
        ).strip()
    return ""


def parse_date(value):
    text = str(value or "").strip()
    match = re.search(r"(20\d{2})[-/](\d{1,2})[-/](\d{1,2})", text)
    if match:
        try:
            day = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            tm = re.search(r"[T ](\d{1,2}):(\d{2})", text)
            time = ""
            if tm and 0 <= int(tm.group(1)) <= 23 and 0 <= int(tm.group(2)) <= 59:
                time = f"{int(tm.group(1)):02d}:{int(tm.group(2)):02d}"
            return day.isoformat(), time
        except ValueError:
            pass
    for fmt in ("%d-%b-%Y", "%d-%b-%y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat(), ""
        except ValueError:
            pass
    if isinstance(value, (int, float)):
        try:
            stamp = value / 1000 if value > 10_000_000_000 else value
            dt = datetime.fromtimestamp(stamp, timezone.utc)
            return dt.date().isoformat(), dt.strftime("%H:%M")
        except (ValueError, OSError, OverflowError):
            pass
    return "", ""


def clean_time(value):
    match = re.search(
        r"\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b", str(value or "").strip(), re.I
    )
    if not match:
        return ""
    hour, minute = int(match.group(1)), int(match.group(2))
    meridiem = (match.group(3) or "").upper()
    if minute > 59 or hour > 23:
        return ""
    if meridiem:
        if not 1 <= hour <= 12:
            return ""
        hour = hour % 12 + (12 if meridiem == "PM" else 0)
    return f"{hour:02d}:{minute:02d}"


def normalize(row):
    raw_date = first(row, DATE_KEYS)
    home, away = team_name(first(row, HOME_KEYS)), team_name(first(row, AWAY_KEYS))
    if not raw_date or not home or not away or home.casefold() == away.casefold():
        return None
    day, embedded_time = parse_date(raw_date)
    if not day:
        return None
    label_date = datetime.strptime(day, "%Y-%m-%d")
    venue_raw = first(row, VENUE_KEYS)
    venue = (
        team_name(venue_raw)
        if isinstance(venue_raw, dict)
        else str(venue_raw or "").strip()
    )
    return {
        "date": day,
        "label": label_date.strftime("%a, %-d %b %Y"),
        "match": str(first(row, MATCH_KEYS) or "Match").strip(),
        "team": home,
        "opponent": away,
        "venue": venue or "Venue TBC",
        "time": clean_time(first(row, TIME_KEYS)) or embedded_time,
        "source": SOURCE_URL,
        "newsUrl": SOURCE_URL,
        "tilakInSquad": False,
    }


def collect(payload):
    rows, seen = [], set()

    def walk(value):
        if isinstance(value, list):
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            item = normalize(value)
            if item:
                key = (
                    item["date"],
                    item["match"].casefold(),
                    item["team"].casefold(),
                    item["opponent"].casefold(),
                )
                if key not in seen:
                    seen.add(key)
                    rows.append(item)
            for child in value.values():
                if isinstance(child, (dict, list)):
                    walk(child)

    walk(payload)
    today = date.today().isoformat()
    return sorted(
        (r for r in rows if r["date"] >= today),
        key=lambda r: (r["date"], r["match"], r["team"]),
    )


def main():
    req = Request(
        SOURCE_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClubFixtures/1.0)",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.bcci.tv/",
        },
    )
    try:
        with urlopen(req, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8-sig"))
    except Exception as exc:
        print(f"ERROR: BCCI Stats fetch/JSON parse failed: {exc}", file=sys.stderr)
        return 1
    fixtures = collect(payload)
    if not fixtures:
        print(
            "ERROR: response had no rows matching known fixture fields; previous snapshot preserved.",
            file=sys.stderr,
        )
        if isinstance(payload, dict):
            print("Top-level keys:", list(payload.keys()), file=sys.stderr)
        return 2
    report = {
        "source": SOURCE_URL,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "status": "updated-from-bcci-stats",
        "fixtureCount": len(fixtures),
        "fixtures": fixtures,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Saved {len(fixtures)} future fixtures to {OUTPUT.relative_to(ROOT)}")
    for f in fixtures[:12]:
        print(
            f'{f["date"]} | {f["match"]} | {f["team"]} vs {f["opponent"]} | {f["venue"]}'
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
