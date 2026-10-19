#!/usr/bin/env python3
"""Extract Tilak Varma's List A rows from scorecards downloaded by hyd_scoreboard_builder.py."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYER_ID = "69845"
RAW_DIRS = [ROOT / "HYD" / "hyd_scoreboards" / "json", ROOT / "HYD" / "hyd  2021-22"]
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
    # Preserve verified metadata if the current BCCI scorecard omits it.
    existing = {}
    if LIST_A_FILE.exists():
        try:
            previous = json.loads(LIST_A_FILE.read_text(encoding="utf-8"))
            for row in previous.get("innings", []):
                gid0 = str(row.get("matchGid") or "")
                if gid0:
                    existing[(gid0, int(row.get("innings") or 1))] = row
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass
    for raw_dir in RAW_DIRS:
        if not raw_dir.exists(): continue
        for path in raw_dir.glob("*.json"):
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
            # Team names are often stored at the scorecard root, not inside match metadata.
            team_names = [
                val(payload, "team1_name", "team1_short_name"),
                val(payload, "team2_name", "team2_short_name"),
                val(match, "team1_name", "team2_name", "home_team_name", "away_team_name"),
            ]
            team_names = [str(name).strip() for name in team_names if name]
            opposition = next(
                (name for name in team_names if name.lower() not in {"hyderabad", "hyd"}),
                ""
            )
            for inn_no, inn in enumerate(innings_list, 1):
                if not isinstance(inn, dict): continue
                # BCCI often nests fielders under each dismissed batter row.
                for batter in (inn.get("batting") or inn.get("batsmen") or []):
                    if not isinstance(batter, dict): continue
                    for fielder in (batter.get("fielding") or []):
                        if not isinstance(fielder, dict) or not is_tilak(fielder): continue
                        fkey = (gid, inn_no, str(batter.get("player_id", "")), str(batter.get("dismissal_str", "")))
                        fielding[fkey] = {
                            "innings": inn_no, "player_id": PLAYER_ID,
                            "fielder": val(fielder, "player_known_as", "player_name_short", "player_name") or "Tilak Varma",
                            "dismissal": val(batter, "dismissal_str", "dismissal_name"),
                            "dismissedBatterId": str(val(batter, "player_id", "player_gid", "id") or ""),
                            "dismissedBatter": val(batter, "player_known_as", "player_name_short", "player_name"),
                            "matchGid": gid, "date": date, "ground": ground, "series": series, "result": result,
                            "matchUrl": f"https://stats.bcci.tv/match/{gid}/scorecard", "sourceVerified": True
                        }
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
                                "opposition": val(row, "opposition", "opponent") or opposition,
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
    # Preserve known opponent/date metadata if a BCCI batting row omits it.
    for key, row in batting.items():
        prior = existing.get(key, {})
        for field in ("date", "opposition", "ground", "series", "result", "matchLabel", "matchUrl"):
            if not row.get(field) and prior.get(field):
                row[field] = prior[field]
        # Fill historical blanks from the verified match title if root team fields are absent.
        if not row.get("opposition"):
            match_title = str(row.get("matchLabel") or "")
            if " v " in match_title.lower():
                sides = [part.strip() for part in match_title.split(" v ", 1)]
                row["opposition"] = next((side for side in sides if side.lower() not in {"hyderabad", "hyd"}), "")
    # Scorecard-extracted rows are the source of truth, with verified metadata retained.
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
    # Regenerate breakdown rows on every workflow run so the UI can show opponents as well as years.
    def make_group(group, group_rows, span):
        group_runs = sum(integer(x.get("runs")) for x in group_rows)
        group_balls = sum(integer(x.get("balls")) for x in group_rows)
        group_not_outs = sum(str(x.get("score", "")).endswith("*") for x in group_rows)
        values = [integer(x.get("runs")) for x in group_rows]
        return {
            "group": group, "span": span,
            "matches": len({x.get("matchGid") or x.get("matchLabel") for x in group_rows}),
            "innings": len(group_rows), "notOuts": group_not_outs, "runs": group_runs,
            "highestScore": max((str(x.get("score") or x.get("runs") or "0") for x in group_rows),
                                key=lambda s: integer(s.replace("*", "")), default="0"),
            "average": round(group_runs / (len(group_rows) - group_not_outs), 2) if len(group_rows) > group_not_outs else None,
            "balls": group_balls, "strikeRate": round(group_runs * 100 / group_balls, 2) if group_balls else None,
            "hundreds": sum(v >= 100 for v in values), "fifties": sum(50 <= v < 100 for v in values),
            "ducks": sum(v == 0 for v in values),
            "fours": sum(integer(x.get("fours")) for x in group_rows),
            "sixes": sum(integer(x.get("sixes")) for x in group_rows)
        }
    years = sorted({str(x.get("date") or "")[-4:] for x in rows if str(x.get("date") or "")[-4:].isdigit()})
    breakdown = [make_group("overall", rows, (years[0] + "-" + years[-1]) if years else "—")]
    for year in years:
        group_rows = [x for x in rows if str(x.get("date") or "").endswith(year)]
        breakdown.append(make_group("year " + year, group_rows, year + "-" + year))
    opponents = sorted({str(x.get("opposition") or "").strip() for x in rows if str(x.get("opposition") or "").strip()})
    for opponent in opponents:
        group_rows = [x for x in rows if str(x.get("opposition") or "").strip().lower() == opponent.lower()]
        dates = [str(x.get("date") or "")[-4:] for x in group_rows if str(x.get("date") or "")[-4:].isdigit()]
        span = (min(dates) + "-" + max(dates)) if dates else "—"
        breakdown.append(make_group("v " + opponent, group_rows, span))
    data["careerBreakdown"] = breakdown
    data.setdefault("scope", {}).update({"matchesIncluded": len(matches), "breakdownMatchesIncluded": len(matches),
        "completeCareer": False, "scopeLabel": "BCCI scorecards downloaded by HYD pipeline"})
    data["dataNotes"] = [
        "Batting rows and overall/year/opposition breakdowns are regenerated from readable BCCI scorecards in HYD/hyd_scoreboards/json.",
        "This is not a complete-career claim; include all List A seasons/competitions before labelling it complete.",
        "Player matching uses BCCI player ID 69845 where that ID is present in the scorecard row."
    ]
    LIST_A_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"scorecards_read": readable, "batting_rows": len(batting), "bowling_rows": len(bowling), "fielding_rows": len(fielding), "summary": data["summary"]}, indent=2))

if __name__ == "__main__": main()
