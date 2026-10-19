#!/usr/bin/env python3
"""Build Tilak Varma's Hyderabad-team match archive from Cricsheet JSON.

Usage:
  python "Tilak Varma/build_hyderabad_json.py"
  python "Tilak Varma/build_hyderabad_json.py" --zip path/to/all_male_json.zip
  python "Tilak Varma/build_hyderabad_json.py" --source-dir path/to/extracted/json

Cricsheet coverage is incomplete for Indian domestic cricket. This script only
includes matches actually present in the downloaded Cricsheet archive; it does
not invent missing scorecards or assume that every Hyderabad match is covered.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "matches.json"
DEFAULT_ZIP_URL = "https://cricsheet.org/downloads/all_male_json.zip"
PLAYER_ALIASES = {"tilak varma", "tilak varma"}
TEAM_ALIASES = {
    "hyderabad", "hyderabad (india)", "hyderabad cricket team",
    "hyderabad (deccan)"
}

def norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())

def is_target_player(value: Any) -> bool:
    return norm(value) in PLAYER_ALIASES

def is_hyderabad_team(value: Any) -> bool:
    return norm(value) in TEAM_ALIASES

def download_archive(path: Path, url: str) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "TilakVarmaFanClub-data-builder/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response, path.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)

def match_has_player_for_hyderabad(data: dict[str, Any]) -> tuple[bool, str | None]:
    info = data.get("info") or {}
    teams = info.get("teams") or []
    players = info.get("players") or {}
    for team in teams:
        if not is_hyderabad_team(team):
            continue
        squad = players.get(team, [])
        if any(is_target_player(player) for player in squad):
            return True, team
    # Fallback for source files whose roster is absent/incomplete: only accept
    # a player who appears in a Hyderabad batting/bowling/fielding event.
    for innings in data.get("innings") or []:
        for over in innings.get("overs") or []:
            for delivery in over.get("deliveries") or []:
                if is_target_player(delivery.get("batter")) or is_target_player(delivery.get("non_striker")):
                    return True, next((t for t in teams if is_hyderabad_team(t)), None)
                if is_target_player(delivery.get("bowler")):
                    return True, next((t for t in teams if is_hyderabad_team(t)), None)
                for wicket in delivery.get("wickets") or []:
                    for fielder in wicket.get("fielders") or []:
                        if is_target_player(fielder.get("name")):
                            return True, next((t for t in teams if is_hyderabad_team(t)), None)
    return False, None

def player_innings_summary(data: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for innings_no, innings in enumerate(data.get("innings") or [], start=1):
        runs = balls = fours = sixes = 0
        dismissal = None
        player_batted = False
        player_bowled = False
        player_fielded = False
        for over in innings.get("overs") or []:
            for delivery in over.get("deliveries") or []:
                batter = delivery.get("batter")
                if is_target_player(batter):
                    player_batted = True
                    batter_runs = (delivery.get("runs") or {}).get("batter", 0)
                    runs += batter_runs
                    extras = delivery.get("extras") or {}
                    # Legal balls faced excludes wides and no-balls.
                    if "wides" not in extras and "noballs" not in extras:
                        balls += 1
                    if batter_runs == 4:
                        fours += 1
                    elif batter_runs == 6:
                        sixes += 1
                if is_target_player(delivery.get("bowler")):
                    player_bowled = True
                for wicket in delivery.get("wickets") or []:
                    if is_target_player(wicket.get("player_out")):
                        dismissal = {
                            "kind": wicket.get("kind"),
                            "fielders": [f.get("name") for f in wicket.get("fielders") or []],
                        }
                    for fielder in wicket.get("fielders") or []:
                        if is_target_player(fielder.get("name")):
                            player_fielded = True
        if player_batted or player_bowled or player_fielded:
            result.append({
                "innings": innings_no,
                "battingTeam": innings.get("team"),
                "runs": runs if player_batted else None,
                "ballsFaced": balls if player_batted else None,
                "fours": fours if player_batted else None,
                "sixes": sixes if player_batted else None,
                "dismissal": dismissal if player_batted else None,
                "playedBattingRole": player_batted,
                "bowled": player_bowled,
                "fielded": player_fielded,
            })
    return result

def iter_json_from_zip(zip_path: Path):
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            if name.lower().endswith(".json") and not name.endswith("/"):
                try:
                    with archive.open(name) as stream:
                        yield name, json.load(stream)
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    print(f"Skipping invalid JSON {name}: {exc}", file=sys.stderr)

def iter_json_from_dir(source_dir: Path):
    for path in sorted(source_dir.rglob("*.json")):
        try:
            with path.open("r", encoding="utf-8") as stream:
                yield str(path.relative_to(source_dir)), json.load(stream)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            print(f"Skipping invalid JSON {path}: {exc}", file=sys.stderr)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="Use an existing Cricsheet JSON ZIP archive")
    parser.add_argument("--source-dir", type=Path, help="Use extracted Cricsheet JSON files")
    parser.add_argument("--url", default=DEFAULT_ZIP_URL, help="Cricsheet archive URL")
    args = parser.parse_args()

    if args.zip and args.source_dir:
        parser.error("Use either --zip or --source-dir, not both")

    temp_zip = ROOT / ".cricsheet_all_male_json.zip"
    source = args.source_dir
    archive_path = args.zip
    if source is None:
        if archive_path is None:
            print(f"Downloading Cricsheet archive: {args.url}")
            try:
                download_archive(temp_zip, args.url)
            except Exception as exc:
                print(f"Download failed: {exc}", file=sys.stderr)
                print("Download the JSON ZIP from https://cricsheet.org/downloads/ and run with --zip.", file=sys.stderr)
                return 2
            archive_path = temp_zip
        if not archive_path.is_file():
            print(f"ZIP not found: {archive_path}", file=sys.stderr)
            return 2

    iterator = iter_json_from_dir(source) if source else iter_json_from_zip(archive_path)
    matches = []
    scanned = 0
    seen = set()
    for source_name, data in iterator:
        scanned += 1
        has_player, hyderabad_name = match_has_player_for_hyderabad(data)
        if not has_player:
            continue
        info = data.get("info") or {}
        dates = info.get("dates") or []
        date = str(dates[0]) if dates else None
        teams = info.get("teams") or []
        match_id = str(data.get("meta", {}).get("data_version", "")) + ":" + source_name
        if match_id in seen:
            continue
        seen.add(match_id)
        matches.append({
            "source": "Cricsheet",
            "sourceFile": source_name,
            "date": date,
            "season": info.get("season"),
            "matchType": info.get("match_type"),
            "gender": info.get("gender"),
            "competition": (info.get("event") or {}).get("name"),
            "event": info.get("event"),
            "venue": info.get("venue"),
            "city": info.get("city"),
            "teams": teams,
            "hyderabadTeamName": hyderabad_name,
            "outcome": info.get("outcome"),
            "player": "Tilak Varma",
            "playerInnings": player_innings_summary(data),
            "info": info,
            "innings": data.get("innings") or [],
            "meta": data.get("meta") or {},
        })

    matches.sort(key=lambda m: (m.get("date") or "", m.get("competition") or "", m.get("sourceFile") or ""))
    totals = Counter()
    for match in matches:
        totals[str(match.get("matchType") or "unknown")] += 1

    payload = {
        "schemaVersion": 1,
        "title": "Tilak Varma — Hyderabad matches in Cricsheet",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {
            "name": "Cricsheet",
            "url": "https://cricsheet.org/",
            "downloadUrl": args.url if not args.source_dir else None,
            "licence": "Open Data Commons Attribution License (ODC-By)",
            "coverageWarning": "This is only the set of Hyderabad matches found in the selected Cricsheet archive. Cricsheet does not provide complete coverage of all Indian domestic Hyderabad matches; absence here does not mean Tilak did not play.",
        },
        "filter": {
            "player": "Tilak Varma",
            "teamAliases": sorted(TEAM_ALIASES),
            "selectionRule": "Tilak Varma appears in Hyderabad team roster, or appears in a player event in a match listing Hyderabad.",
        },
        "audit": {
            "sourceFilesScanned": scanned,
            "matchesFound": len(matches),
            "matchesByType": dict(sorted(totals.items())),
            "uniqueDates": len({m["date"] for m in matches if m.get("date")}),
        },
        "matches": matches,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Scanned {scanned} source files; saved {len(matches)} Hyderabad/Tilak matches to {OUTPUT}")
    if temp_zip.exists():
        temp_zip.unlink()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
