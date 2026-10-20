#!/usr/bin/env python3
"""Build full ball-by-ball Tilak Varma Hyderabad domestic T20 match data.

The death-overs snapshot is used to identify Hyderabad archive match IDs in which
Tilak appeared. Full deliveries are then read from the matching Cricsheet ZIP
entries, because death-overs.json intentionally stores only overs in which Tilak
faced a delivery and cannot by itself reconstruct a complete match.
"""
import io
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_JSON = ROOT / "data" / "death-overs.json"
OUT_JSON = ROOT / "data" / "tilaksmat.json"
DOWNLOADS_URL = "https://cricsheet.org/downloads/"
USER_AGENT = "TilakVarmaFC/1.1"
ALIASES = {"tilakvarma", "tilakverma", "tilakvardhanvarma"}


def norm(value):
    return re.sub(r"[^a-z]", "", str(value).lower())


def is_tilak(value):
    return norm(value) in ALIASES


def request_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def find_hyderabad_zip_url():
    page = request_bytes(DOWNLOADS_URL).decode("utf-8", "replace")
    for row_match in re.finditer(r"<tr\b[^>]*>(.*?)</tr>", page, re.I | re.S):
        row = row_match.group(1)
        row_text = re.sub(r"<[^>]+>", " ", row)
        row_text = re.sub(r"\s+", " ", row_text).strip()
        if "Hyderabad (India)" not in row_text:
            continue
        for href, label in re.findall(
            r"<a\b[^>]*href=([^\s>]+)[^>]*>(.*?)</a>", row, re.I | re.S
        ):
            href = href.strip(chr(34) + chr(39))
            label_text = re.sub(r"<[^>]+>", " ", label).lower()
            if "json" in label_text and ".zip" in href.lower():
                return (
                    href if href.startswith("http") else "https://cricsheet.org" + href
                )
    raise RuntimeError(
        "Could not find Hyderabad (India) JSON ZIP on Cricsheet downloads page."
    )


def get_tilak_hyderabad_ids(snapshot):
    formats = snapshot.get("formats", {})
    hyd = formats.get("hyderabad", {})
    rows = hyd.get("innings", [])
    ids = {
        str(row.get("matchId", "")).strip()
        for row in rows
        if row.get("matchId") and str(row.get("format", "hyderabad")) == "hyderabad"
    }
    if not ids:
        raise RuntimeError(
            "No Hyderabad match IDs found at formats.hyderabad.innings in death-overs.json; "
            "refusing to overwrite tilaksmat.json with empty data."
        )
    return ids, rows


def delivery_record(delivery, over_number, ball_number):
    runs = delivery.get("runs", {}) or {}
    batter_runs = int(runs.get("batter", runs.get("batsman", 0)) or 0)
    extras = delivery.get("extras", {}) or {}
    wickets = delivery.get("wickets", []) or []
    return {
        "over": over_number,
        "ball": ball_number,
        "batter": delivery.get("batter", delivery.get("batsman", "")),
        "bowler": delivery.get("bowler", ""),
        "nonStriker": delivery.get("non_striker", delivery.get("non-striker", "")),
        "batterRuns": batter_runs,
        "extras": {str(k): int(v or 0) for k, v in extras.items()},
        "totalRuns": int(runs.get("total", batter_runs) or 0),
        "wickets": wickets,
        "isTilakDelivery": is_tilak(
            delivery.get("batter", delivery.get("batsman", ""))
        ),
    }


def parse_full_match(data, filename):
    info = data.get("info", {}) or {}
    players = info.get("players", {}) or {}
    if not any(
        is_tilak(player) for team_players in players.values() for player in team_players
    ):
        return None

    teams = info.get("teams", []) or []
    innings_out = []
    tilak_batting_innings = []
    for innings_number, innings in enumerate(data.get("innings", []) or [], 1):
        team = innings.get("team", "")
        deliveries = []
        tilak_balls = 0
        tilak_runs = 0
        for over in innings.get("overs", []) or []:
            over_number = int(over.get("over", 0)) + 1
            for ball_number, delivery in enumerate(over.get("deliveries", []) or [], 1):
                record = delivery_record(delivery, over_number, ball_number)
                if record["isTilakDelivery"]:
                    tilak_balls += 1
                    tilak_runs += record["batterRuns"]
                deliveries.append(record)
        if not deliveries:
            continue
        innings_out.append(
            {
                "innings": innings_number,
                "battingTeam": team,
                "overs": len(innings.get("overs", []) or []),
                "deliveriesCount": len(deliveries),
                "tilakFacedBalls": tilak_balls,
                "tilakRuns": tilak_runs,
                "deliveries": deliveries,
            }
        )
        if tilak_balls:
            tilak_batting_innings.append(innings_number)

    if not tilak_batting_innings:
        return None
    date_value = (info.get("dates") or [""])[0]
    match_id = Path(filename).stem
    return {
        "matchId": match_id,
        "date": str(date_value),
        "format": "Hyderabad domestic T20",
        "teams": teams,
        "event": info.get("event", {}),
        "venue": info.get("venue", ""),
        "city": info.get("city", ""),
        "gender": info.get("gender", ""),
        "matchType": info.get("match_type", ""),
        "oversLimit": info.get("overs", 20),
        "outcome": info.get("outcome", {}),
        "playerOfMatch": info.get("player_of_match", []),
        "tilak": {
            "name": "Tilak Varma",
            "battingInnings": tilak_batting_innings,
            "runsInMatch": sum(x["tilakRuns"] for x in innings_out),
            "ballsFaced": sum(x["tilakFacedBalls"] for x in innings_out),
        },
        "innings": innings_out,
        "source": "Cricsheet Hyderabad (India) JSON archive",
    }


def main():
    if not SOURCE_JSON.exists():
        raise FileNotFoundError(f"Required source file not found: {SOURCE_JSON}")
    snapshot = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    match_ids, hyd_rows = get_tilak_hyderabad_ids(snapshot)
    archive_url = find_hyderabad_zip_url()
    payload = request_bytes(archive_url)
    if not payload.startswith(b"PK"):
        raise RuntimeError("Cricsheet response was not a ZIP archive.")

    matches = []
    errors = []
    found_ids = set()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for name in archive.namelist():
            if not name.lower().endswith(".json"):
                continue
            match_id = Path(name).stem
            if match_id not in match_ids:
                continue
            try:
                match = parse_full_match(
                    json.loads(archive.read(name).decode("utf-8-sig")), name
                )
                if match:
                    matches.append(match)
                    found_ids.add(match_id)
            except Exception as exc:
                errors.append({"matchId": match_id, "error": str(exc)})

    matches.sort(
        key=lambda match: (match.get("date", ""), match.get("matchId", "")),
        reverse=True,
    )
    missing_ids = sorted(match_ids - found_ids)
    out = {
        "schemaVersion": 1,
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "player": "Tilak Varma",
        "competition": "Hyderabad domestic T20",
        "source": archive_url,
        "sourceSnapshot": "data/death-overs.json (Hyderabad format match IDs)",
        "coverage": {
            "mode": "full match ball-by-ball from matching Cricsheet JSON archive files",
            "matchesIdentifiedInDeathOversSnapshot": len(match_ids),
            "matchesFoundInArchive": len(matches),
            "missingArchiveMatchIds": missing_ids,
            "readErrors": len(errors),
            "note": (
                "Contains every delivery supplied in each matched archive JSON file. "
                "This is limited to Hyderabad matches available in the Cricsheet archive "
                "and identified by the death-overs snapshot; it does not claim complete "
                "SMAT career coverage beyond that source."
            ),
        },
        "matches": matches,
        "readErrors": errors,
    }
    if not matches:
        raise RuntimeError(
            "No matching full match JSON files were found; existing tilaksmat.json was not overwritten."
        )
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Wrote {OUT_JSON.relative_to(ROOT)}: {len(matches)} matches, "
        f"{sum(i['deliveriesCount'] for m in matches for i in m['innings'])} deliveries, "
        f"{len(missing_ids)} archive IDs missing."
    )


if __name__ == "__main__":
    main()
