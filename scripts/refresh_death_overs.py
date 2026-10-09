#!/usr/bin/env python3
"""Build a web-ready Tilak Varma T20I over-by-over dataset from Cricsheet."""

import io
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "data" / "death-overs.json"
SOURCE_URL = "https://cricsheet.org/downloads/t20s_male_json.zip"

PLAYER_ALIASES = {
    "tilakvarma",
    "tilakverma",
    "tilakvardhanvarma",
}


def normalize_name(value):
    """Normalize a player name so common spelling variants can be matched."""
    return re.sub(r"[^a-z]", "", str(value).lower())


def download_archive():
    """Download the source archive and verify that it is a ZIP file."""
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "TilakVarmaFC/1.0"},
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        archive_bytes = response.read()

    if not archive_bytes.startswith(b"PK"):
        raise RuntimeError("The downloaded Cricsheet file is not a valid ZIP archive.")

    return archive_bytes


def is_target_player(player_name):
    return normalize_name(player_name) in PLAYER_ALIASES


def is_supported_match(info):
    """Keep men's international T20 matches represented by this archive."""
    match_type = str(info.get("match_type", "")).lower()
    gender = str(info.get("gender", "")).lower()
    team_type = str(info.get("team_type", "international")).lower()

    supported_types = {"t20", "t20i", "it20", "international t20"}
    supported_genders = {"male", "men", ""}

    return (
        match_type in supported_types
        and gender in supported_genders
        and team_type == "international"
    )


def collect_player_innings(match_data, filename, match_ids, over_totals):
    """Extract Tilak's batting overs and add their totals to the archive summary."""
    info = match_data.get("info", {})

    if not is_supported_match(info):
        return []

    players_by_team = info.get("players", {})
    all_players = [
        player
        for team_players in players_by_team.values()
        for player in team_players
    ]

    if not any(is_target_player(player) for player in all_players):
        return []

    match_id = Path(filename).stem
    match_ids.add(match_id)

    teams = info.get("teams", [])
    match_date = str((info.get("dates") or [""])[0])
    match_venue = info.get("venue", "")
    player_innings = []

    for innings_number, innings_data in enumerate(
        match_data.get("innings", []),
        start=1,
    ):
        batting_team = innings_data.get("team", "")
        batting_players = players_by_team.get(batting_team, [])

        if not any(is_target_player(player) for player in batting_players):
            continue

        runs_by_over = defaultdict(
            lambda: {
                "runs": 0,
                "balls": 0,
                "fours": 0,
                "sixes": 0,
            }
        )

        for over_data in innings_data.get("overs", []):
            over_number = int(over_data.get("over", -1)) + 1

            for delivery in over_data.get("deliveries", []):
                batter = delivery.get("batter", delivery.get("batsman", ""))

                if not is_target_player(batter):
                    continue

                over_stats = runs_by_over[over_number]
                run_data = delivery.get("runs", {})
                batter_runs = int(
                    run_data.get("batter", run_data.get("batsman", 0)) or 0
                )
                extras = delivery.get("extras", {}) or {}

                over_stats["runs"] += batter_runs

                if not int(extras.get("wides", 0) or 0):
                    over_stats["balls"] += 1

                if batter_runs == 4:
                    over_stats["fours"] += 1
                elif batter_runs == 6:
                    over_stats["sixes"] += 1

        if not runs_by_over:
            continue

        opposition = next(
            (team for team in teams if team != batting_team),
            "Unknown",
        )

        overs = []
        for over_number, values in sorted(runs_by_over.items()):
            over_stats = {
                "over": over_number,
                **values,
                "strikeRate": round(values["runs"] * 100 / values["balls"], 2) if values["balls"] else 0,
            }
            overs.append(over_stats)

            for stat_name in ("runs", "balls", "fours", "sixes"):
                over_totals[over_number][stat_name] += values[stat_name]

        player_innings.append(
            {
                "date": match_date,
                "matchId": match_id,
                "teams": " vs ".join(teams),
                "opposition": opposition,
                "venue": match_venue,
                "innings": innings_number,
                "battingTeam": batting_team,
                "overs": overs,
            }
        )

    return player_innings


def build_dataset(archive_bytes):
    """Parse all match files and assemble the public JSON payload."""
    match_ids = set()
    over_totals = defaultdict(lambda: defaultdict(int))
    innings = []
    read_errors = []

    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        json_files = [
            name
            for name in archive.namelist()
            if name.lower().endswith(".json")
        ]

        for filename in json_files:
            try:
                match_data = json.loads(
                    archive.read(filename).decode("utf-8-sig")
                )
                innings.extend(
                    collect_player_innings(
                        match_data,
                        filename,
                        match_ids,
                        over_totals,
                    )
                )
            except Exception as error:  # Keep one malformed match from stopping the refresh.
                read_errors.append(
                    {
                        "file": filename,
                        "error": str(error),
                    }
                )

    innings.sort(
        key=lambda item: (
            item["date"],
            item["matchId"],
            item["innings"],
        ),
        reverse=True,
    )

    over_summary = []
    for over_number in range(1, 21):
        values = over_totals[over_number]
        runs = values["runs"]
        balls = values["balls"]

        over_summary.append(
            {
                "over": over_number,
                "runs": runs,
                "balls": balls,
                "fours": values["fours"],
                "sixes": values["sixes"],
                "strikeRate": round(runs * 100 / balls, 2) if balls else 0,
            }
        )

    return {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": SOURCE_URL,
        "coverageNote": (
            "Only matches present in the archive are included. "
            "Archive coverage may be incomplete."
        ),
        "matchesFound": len(match_ids),
        "inningsFound": len(innings),
        "overTotals": over_summary,
        "innings": innings,
        "readErrors": len(read_errors),
    }


def main():
    archive_bytes = download_archive()
    payload = build_dataset(archive_bytes)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        f"Created {OUTPUT_FILE}: "
        f"{payload['matchesFound']} matches, "
        f"{payload['inningsFound']} innings, "
        f"{payload['readErrors']} read errors"
    )


if __name__ == "__main__":
    main()
