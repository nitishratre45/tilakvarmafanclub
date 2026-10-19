#!/usr/bin/env python3
"""Build a consolidated Tilak Varma SMAT data pack from verified repository data."""
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tilakvarmasmatall"
SCORE_DIR = ROOT / "hyd_scoreboards" / "json"
COMMENTARY_DIR = ROOT / "tilak_varma_commentaries"
PLAYER_ID = "69845"  # verified in source scorecards/commentary for Tilak Varma

def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    matches, innings_rows, ball_events, scorecard_files, commentary_files = [], [], [], [], []
    for path in sorted(SCORE_DIR.glob("*.json")):
        if path.name in {"errors.json", "fetch_report.json"}:
            continue
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        match = data.get("match") or {}
        gid = str(match.get("gid") or path.stem)
        match_meta = {
            "gid": gid,
            "date": match.get("start_date") or match.get("date_string"),
            "match": match.get("name") or match.get("match_short_name"),
            "season": match.get("comp_season") or match.get("season"),
            "competition": match.get("comp_name"),
            "ground": match.get("ground_name"),
            "teams": [x for x in (match.get("team1_name"), match.get("team2_name")) if x],
            "result": match.get("result_string"),
            "source_scorecard": str(path.relative_to(ROOT)),
            "tilak_innings": [],
        }
        for inn in data.get("innings", []):
            for batter in inn.get("batting", []):
                if str(batter.get("player_id")) != PLAYER_ID:
                    continue
                row = {
                    "gid": gid, "date": match_meta["date"], "match": match_meta["match"],
                    "season": match_meta["season"], "innings": inn.get("innings_number"),
                    "batting_team_id": inn.get("batting_team_id"), "player_id": PLAYER_ID,
                    "player": "Tilak Varma", "runs": int(batter.get("runs") or 0),
                    "balls_faced": int(batter.get("balls_faced") or 0),
                    "fours": int(batter.get("fours") or 0), "sixes": int(batter.get("sixes") or 0),
                    "strike_rate": batter.get("strike_rate"), "is_out": batter.get("is_out"),
                    "dismissal": batter.get("dismissal_str") or batter.get("dismissal_name"),
                }
                innings_rows.append(row)
                match_meta["tilak_innings"].append(row)
        matches.append(match_meta)
        scorecard_files.append({"gid": gid, "file": str(path.relative_to(ROOT))})
    for path in sorted(COMMENTARY_DIR.glob("*.json")):
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        commentary_files.append({"file": str(path.relative_to(ROOT)), "gid": path.name.split("_")[0]})
        gid = path.name.split("_")[0]
        for inn_no, inn in enumerate(data.get("innings", []), 1):
            for over in inn.get("bbb", []):
                for ball in over.get("balls", []):
                    if str(ball.get("batting_player_id")) != PLAYER_ID:
                        continue
                    ball_events.append({
                        "gid": gid, "source_commentary": str(path.relative_to(ROOT)),
                        "innings": inn_no, "batting_team": inn.get("batting_team_name"),
                        "over_ball": ball.get("display_overs"), "overs_unique": ball.get("overs_unique"),
                        "player_id": PLAYER_ID, "runs": int(ball.get("runs") or 0),
                        "scoring": ball.get("scoring"),
                        "commentary": (ball.get("commentary") or {}).get("message") or (ball.get("commentary") or {}).get("ball_summary_text"),
                        "out_player_id": ball.get("out_player_id"),
                    })
    total_runs = sum(x["runs"] for x in innings_rows)
    total_balls = sum(x["balls_faced"] for x in innings_rows)
    summary = {
        "player": "Tilak Varma", "player_id": PLAYER_ID,
        "format": "Syed Mushtaq Ali Trophy / domestic T20",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_scorecards_found": len(scorecard_files),
        "source_commentary_files_found": len(commentary_files),
        "matches_with_tilak_in_scorecard": sum(bool(m["tilak_innings"]) for m in matches),
        "innings_found": len(innings_rows), "runs": total_runs, "balls_faced": total_balls,
        "fours": sum(x["fours"] for x in innings_rows), "sixes": sum(x["sixes"] for x in innings_rows),
        "strike_rate": round(total_runs * 100 / total_balls, 2) if total_balls else None,
        "commentary_deliveries_for_tilak": len(ball_events),
        "note": "Coverage is limited to source files present in the repository. Missing seasons/matches are not inferred.",
    }
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "matches.json").write_text(json.dumps(matches, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "batting_innings.json").write_text(json.dumps(innings_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "ball_by_ball.json").write_text(json.dumps(ball_events, ensure_ascii=False, indent=2), encoding="utf-8")
    source_index = {"scorecards": scorecard_files, "commentary": commentary_files}
    (OUT / "source_index.json").write_text(json.dumps(source_index, ensure_ascii=False, indent=2), encoding="utf-8")
    tilak_data = {"player": {"name": "Tilak Varma", "player_id": PLAYER_ID}, "format": "Syed Mushtaq Ali Trophy / domestic T20", "generated_at_utc": summary["generated_at_utc"], "summary": summary, "matches": matches, "batting_innings": innings_rows, "ball_by_ball": ball_events, "source_index": source_index}
    (OUT / "tilak.json").write_text(json.dumps(tilak_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
