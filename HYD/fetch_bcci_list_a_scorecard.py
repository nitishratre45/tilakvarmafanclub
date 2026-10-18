#!/usr/bin/env python3
"""Extract Tilak Varma's List A rows from scorecards downloaded by hyd_scoreboard_builder.py."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYER_ID = "69845"
RAW_DIR = ROOT / "HYD" / "hyd_scoreboards" / "json"
LIST_A_FILE = ROOT / "data" / "list-a.json"

def val(obj, *keys):
    if not isinstance(obj, dict): return None
    for key in keys:
        if obj.get(key) not in (None, ""): return obj[key]
    return None

def integer(value, default=0):
    try: return int(float(value or 0))
    except (TypeError, ValueError): return default

def is_tilak(row):
    for key in ("player_id", "player_gid", "playerId", "batsman_id", "bowler_id", "fielder_id"):
        if str(row.get(key, "")) == PLAYER_ID: return True
    for key in ("player", "batsman", "bowler", "fielder"):
        p = row.get(key)
        if isinstance(p, dict) and str(val(p, "player_id", "player_gid", "id") or "") == PLAYER_ID: return True
    return False

def main():
    batting, bowling, fielding = {}, {}, {}
    readable = 0
    for path in RAW_DIR.glob("*.json"):
        if path.name in {"fetch_report.json", "errors.json"}: continue
        try: payload = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError): continue
        if not isinstance(payload, dict): continue
        match = payload.get("match") or payload.get("match_info") or payload.get("matchInfo") or {}
        innings_list = payload.get("innings") or payload.get("Innings") or []
        if not isinstance(innings_list, list) or not innings_list: continue
        readable += 1
        gid = str(val(match, "gid", "match_gid", "match_id", "matchId") or path.stem)
        date = val(match, "date_string", "start_date", "match_date", "date")
        series = val(match, "comp_name", "competition_name", "series_name", "series") or "List A"
        ground = val(match, "venue_name", "ground_name", "venue", "ground")
        result = val(match, "result", "result_string")
        label = val(match, "title", "match_name", "match_title") or path.stem
        for inn_no, inn in enumerate(innings_list, 1):
            if not isinstance(inn, dict): continue
            for section in ("batting", "batsmen", "bowling", "fielding"):
                rows = inn.get(section) or []
                if not isinstance(rows, list): continue
                for row in rows:
                    if not isinstance(row, dict) or not is_tilak(row): continue
                    key = (gid, inn_no)
                    if section in ("batting", "batsmen"):
                        runs = integer(val(row, "runs", "batsman_runs", "r"))
                        balls = integer(val(row, "balls_faced", "balls", "bf"))
                        dismissal = val(row, "dismissal_str", "dismissal", "how_out")
                        not_out = str(dismissal or "").strip().lower() == "not out" or (not dismissal and not val(row, "dismissal_id", "wicket_type"))
                        batting[key] = {
                            "date": date, "runs": runs, "score": f"{runs}{'*' if not_out else ''}",
                            "balls": balls, "fours": integer(val(row, "fours", "4s")),
                            "sixes": integer(val(row, "sixes", "6s")),
                            "strikeRate": round(runs * 100 / balls, 2) if balls else None,
                            "position": integer(val(row, "batting_position", "position"), None),
                            "dismissal": dismissal, "innings": inn_no,
                            "opposition": val(row, "opposition", "opponent") or "",
                            "ground": ground, "series": series, "result": result,
                            "matchUrl": f"https://stats.bcci.tv/match/{gid}/scorecard",
                            "matchLabel": label, "sourceVerified": True, "matchGid": gid
                        }
                    elif section == "bowling":
                        bowling[key] = {"innings": inn_no, **row, "matchGid": gid, "date": date}
                    else:
                        fielding[key] = {"innings": inn_no, **row, "matchGid": gid, "date": date}
    if not readable: raise SystemExit("No readable scorecard JSONs with innings; data/list-a.json left unchanged.")
    data = json.loads(LIST_A_FILE.read_text(encoding="utf-8"))
    # Use scorecard-extracted rows as the single source of truth. Keeping manual rows here
    # duplicates innings that are now present in BCCI scorecard snapshots.
    data["innings"] = sorted(batting.values(), key=lambda x: (str(x.get("date") or ""), x["matchGid"], x["innings"]))
    data["bowlingInnings"], data["fieldingInnings"] = list(bowling.values()), list(fielding.values())
    rows = data["innings"]
    runs = sum(integer(x.get("runs")) for x in rows)
    balls = sum(integer(x.get("balls")) for x in rows)
    not_outs = sum(str(x.get("score", "")).endswith("*") for x in rows)
    dismissed = len(rows) - not_outs
    scores = [integer(x.get("runs")) for x in rows]
    matches = {x.get("matchGid") or x.get("matchLabel") for x in rows}
    data.setdefault("summary", {}).update({
        "matches": len(matches), "innings": len(rows), "notOuts": not_outs, "runs": runs,
        "highestScore": str(max(scores)) if scores else "0",
        "average": round(runs / dismissed, 2) if dismissed else None,
        "strikeRate": round(runs * 100 / balls, 2) if balls else None,
        "fours": sum(integer(x.get("fours")) for x in rows),
        "sixes": sum(integer(x.get("sixes")) for x in rows), "balls": balls,
        "verifiedMatchCount": len(matches), "source": "BCCI scorecard JSON snapshots"
    })
    data.setdefault("scope", {}).update({"matchesIncluded": len(matches), "breakdownMatchesIncluded": len(matches),
        "completeCareer": False, "scopeLabel": "BCCI scorecards downloaded by HYD pipeline"})
    data["dataNotes"] = [
        "Includes the manually verified pilot innings plus Tilak Varma rows extracted from readable scorecards in HYD/hyd_scoreboards/json.",
        "This is not a complete-career claim; include all List A seasons/competitions before labelling it complete.",
        "Player matching uses BCCI player ID 69845 where that ID is present in the scorecard row."
    ]
    LIST_A_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scorecards_read": readable, "batting_rows": len(batting), "bowling_rows": len(bowling), "fielding_rows": len(fielding), "summary": data["summary"]}, indent=2))

if __name__ == "__main__": main()
