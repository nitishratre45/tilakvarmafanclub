#!/usr/bin/env python3
"""Fetch one BCCI List A scorecard and merge Tilak Varma's batting/bowling/fielding
figures into data/list-a.json. The raw BCCI JSON is saved under HYD/hyd_scoreboards/json.
"""
import json
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
PLAYER_ID = "69845"
MATCH_GID = os.getenv("BCCI_MATCH_GID", "8a4ed6c8-2bf2-417f-82d6-bae2012d611d")
SCORECARD_URL = f"https://stats.bcci.tv/match/{MATCH_GID}/scorecard"
RAW_DIR = ROOT / "HYD" / "hyd_scoreboards" / "json"
RAW_FILE = RAW_DIR / f"{MATCH_GID}.json"
LIST_A_FILE = ROOT / "data" / "list-a.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://stats.bcci.tv/",
}

def as_int(value, default=0):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return default

def find_player_rows(payload, section):
    rows = []
    for inn_no, innings in enumerate(payload.get("innings") or [], 1):
        for row in innings.get(section) or []:
            pid = str(row.get("player_id", row.get("batsman_id", row.get("bowler_id", row.get("fielder_id", "")))))
            if pid == PLAYER_ID:
                rows.append((inn_no, innings, row))
    return rows

def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    response = requests.get(SCORECARD_URL, headers=HEADERS, timeout=45)
    response.raise_for_status()
    try:
        payload = response.json()
    except ValueError as exc:
        raise SystemExit(f"BCCI scorecard did not return JSON (content-type={response.headers.get('content-type')}).") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("match"), dict):
        raise SystemExit("Unexpected BCCI scorecard schema; raw response not accepted.")
    if not payload.get("innings"):
        raise SystemExit("BCCI response has no innings; refusing to write empty scorecard.")
    RAW_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    batting, bowling, fielding = [], [], []
    for inn_no, innings in enumerate(payload.get("innings") or [], 1):
        for row in innings.get("batting") or []:
            if str(row.get("player_id", "")) == PLAYER_ID:
                runs = as_int(row.get("runs"))
                balls = as_int(row.get("balls_faced"))
                dismissal = row.get("dismissal_str") or ""
                not_out = not bool(row.get("dismissal_id")) and not dismissal
                batting.append({
                    "date": payload["match"].get("date_string") or payload["match"].get("start_date"),
                    "runs": runs, "score": f"{runs}{'*' if not_out else ''}",
                    "balls": balls, "fours": as_int(row.get("fours")),
                    "sixes": as_int(row.get("sixes")),
                    "strikeRate": round(runs * 100 / balls, 2) if balls else None,
                    "position": as_int(row.get("batting_position"), None),
                    "dismissal": dismissal or None, "innings": inn_no,
                    "opposition": row.get("opposition") or "",
                    "ground": payload["match"].get("venue_name") or payload["match"].get("ground_name"),
                    "series": payload["match"].get("comp_name") or "List A",
                    "result": payload["match"].get("result"),
                    "matchUrl": SCORECARD_URL,
                    "matchLabel": payload["match"].get("title") or payload["match"].get("match_name") or SCORECARD_URL,
                    "sourceVerified": True, "matchGid": MATCH_GID
                })
        for row in innings.get("bowling") or []:
            if str(row.get("player_id", "")) == PLAYER_ID:
                bowling.append({"innings": inn_no, **row, "matchGid": MATCH_GID})
        for row in innings.get("fielding") or []:
            if str(row.get("player_id", "")) == PLAYER_ID:
                fielding.append({"innings": inn_no, **row, "matchGid": MATCH_GID})

    if not batting and not bowling and not fielding:
        raise SystemExit(f"Scorecard saved at {RAW_FILE}, but Tilak Varma (player_id={PLAYER_ID}) was not found in batting/bowling/fielding. list-a.json unchanged.")

    data = json.loads(LIST_A_FILE.read_text(encoding="utf-8"))
    for key, new_rows in (("innings", batting), ("bowlingInnings", bowling), ("fieldingInnings", fielding)):
        existing = data.setdefault(key, [])
        existing[:] = [x for x in existing if x.get("matchGid") != MATCH_GID]
        existing.extend(new_rows)

    # Recalculate batting summary only from the verified innings stored in this pilot.
    rows = data.get("innings", [])
    runs = sum(as_int(x.get("runs")) for x in rows)
    balls = sum(as_int(x.get("balls")) for x in rows)
    not_outs = sum(1 for x in rows if str(x.get("score", "")).endswith("*"))
    outs = len(rows) - not_outs
    scores = [as_int(x.get("runs")) for x in rows]
    data["summary"].update({
        "matches": len({x.get("matchGid") or x.get("matchLabel") for x in rows}),
        "innings": len(rows), "notOuts": not_outs, "runs": runs,
        "highestScore": (str(max(scores)) + ("*" if rows[scores.index(max(scores))].get("score", "").endswith("*") else "")) if scores else "0",
        "average": round(runs / outs, 2) if outs else None,
        "strikeRate": round(runs * 100 / balls, 2) if balls else None,
        "fours": sum(as_int(x.get("fours")) for x in rows),
        "sixes": sum(as_int(x.get("sixes")) for x in rows),
        "balls": balls, "verifiedMatchCount": len({x.get("matchGid") or x.get("matchLabel") for x in rows}),
        "source": "BCCI scorecard JSON snapshots"
    })
    data["scope"]["matchesIncluded"] = data["summary"]["matches"]
    data["scope"]["breakdownMatchesIncluded"] = data["summary"]["matches"]
    data["scope"]["completeCareer"] = False
    data["scope"]["scopeLabel"] = "Verified scorecards only"
    LIST_A_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scorecard_saved": str(RAW_FILE), "list_a_updated": str(LIST_A_FILE),
        "new_batting_innings": len(batting), "new_bowling_rows": len(bowling),
        "new_fielding_rows": len(fielding), "summary": data["summary"]}, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
