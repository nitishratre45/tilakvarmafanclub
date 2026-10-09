#!/usr/bin/env python3
"""Refresh a limited recent-innings feed from Cricsheet men's T20I JSON data.

Career summary values are intentionally not overwritten: they are a separately
maintained snapshot and must be verified against official scorecards.
"""
import io, json, re, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "site-data.json"
ARCHIVE_URL = "https://cricsheet.org/downloads/menst20_json.zip"
PLAYER = "Tilak Varma"

def get_json_from_zip():
    req = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "TilakVarmaFanClubDataRefresh/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    matches = []
    for name in archive.namelist():
        if not name.lower().endswith(".json"):
            continue
        try:
            item = json.loads(archive.read(name))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        info = item.get("info", {})
        players = info.get("players", {})
        if not any(PLAYER.casefold() in [str(p).casefold() for p in team_players] for team_players in players.values()):
            continue
        matches.append((name, item))
    return matches

def innings_rows(matches):
    rows = []
    for filename, match in matches:
        info = match.get("info", {})
        date_value = (info.get("dates") or [""])[0]
        teams = info.get("teams") or []
        outcome = info.get("outcome", {})
        for innings in match.get("innings", []):
            team = innings.get("team", "")
            for over in innings.get("overs", []):
                for delivery in over.get("deliveries", []):
                    batter = delivery.get("batter", "")
                    if batter.casefold() != PLAYER.casefold():
                        continue
                    runs = delivery.get("runs", {})
                    batter_runs = int(runs.get("batter", 0) or 0)
                    total_runs = int(runs.get("total", 0) or 0)
                    extras = delivery.get("extras", {})
                    row = next((r for r in rows if r["_key"] == filename + "|" + team), None)
                    if row is None:
                        opponent = next((t for t in teams if t != team), "Unknown")
                        row = {"_key": filename + "|" + team, "date": date_value, "opposition": opponent,
                               "runs": 0, "balls": 0, "fours": 0, "sixes": 0}
                        rows.append(row)
                    row["runs"] += batter_runs
                    if "wides" not in extras and "noballs" not in extras:
                        row["balls"] += 1
                    if batter_runs == 4: row["fours"] += 1
                    if batter_runs == 6: row["sixes"] += 1
    for row in rows:
        row["strikeRate"] = round(row["runs"] * 100 / row["balls"], 2) if row["balls"] else 0
        row.pop("_key", None)
    rows.sort(key=lambda r: r.get("date", ""), reverse=True)
    return rows[:10]

def main():
    if not DATA_FILE.exists():
        raise SystemExit("Expected data/site-data.json was not found")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    matches = get_json_from_zip()
    rows = innings_rows(matches)
    data["recentInnings"] = rows
    data["recentUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    data["dataNote"] = "Recent innings refreshed from Cricsheet where matching data is available. Career summary remains a separately maintained snapshot."
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated recent innings: {len(rows)} rows")
if __name__ == "__main__":
    main()
