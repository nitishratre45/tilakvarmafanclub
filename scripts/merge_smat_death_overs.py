#!/usr/bin/env python3
"""Merge missing Hyderabad SMAT death-over innings from tilakvarmasmatall.

Only supplements existing records; never replaces an existing match identified
by date/opposition or source match ID.
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "death-overs.json"
MATCHES = ROOT / "tilakvarmasmatall" / "matches.json"
BALLS = ROOT / "tilakvarmasmatall" / "ball_by_ball.json"
DEATH_START_OVER = 16


def read(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def main():
    data = read(DATA, None)
    matches = read(MATCHES, [])
    balls = read(BALLS, [])
    if not isinstance(data, dict) or not isinstance(data.get("formats"), dict):
        raise SystemExit("death-overs.json missing/invalid; refusing to write")

    meta = {str(m.get("gid")): m for m in matches if m.get("gid")}
    grouped = defaultdict(list)
    for b in balls:
        gid = str(b.get("gid", ""))
        try:
            over_ball = str(b.get("over_ball", ""))
            over = int(over_ball.split(".")[0])
            ball = int(over_ball.split(".")[1])
        except (ValueError, IndexError):
            continue
        if over < DEATH_START_OVER or over > 20:
            continue
        m = meta.get(gid, {})
        if not m:
            continue
        grouped[gid].append((b, over, ball, m))

    added = 0
    for gid, events in grouped.items():
        m = events[0][3]
        date = str(m.get("date", ""))
        teams = m.get("teams") or []
        opposition = next((t for t in teams if t.lower() != "hyderabad"), "")
        if not date or not opposition:
            continue

        # A match already represented in the dataset is never duplicated.
        formats = data["formats"]
        existing_rows = []
        for fmt in formats.values():
            existing_rows.extend(fmt.get("innings", []))
        if any(
            str(r.get("date", "")) == date
            and str(r.get("opposition", "")).lower() == opposition.lower()
            for r in existing_rows
        ):
            continue
        if any(str(r.get("matchId", "")) == gid for r in existing_rows):
            continue

        by_over = defaultdict(list)
        for b, over, ball, _ in events:
            by_over[over].append((b, ball))
        overs = []
        for over_no in sorted(by_over):
            deliveries = []
            runs = balls_faced = fours = sixes = 0
            for b, ball_no in sorted(by_over[over_no], key=lambda x: x[1]):
                scoring = str(b.get("scoring", ""))
                batter_runs = int(b.get("runs", 0) or 0)
                is_wicket = scoring.upper() == "W" or bool(b.get("out_player_id"))
                runs += batter_runs
                balls_faced += 1
                fours += int(batter_runs == 4)
                sixes += int(batter_runs == 6)
                deliveries.append(
                    {
                        "ball": ball_no,
                        "legalBall": ball_no,
                        "displayOver": b.get("over_ball", ""),
                        "batter": "Tilak Varma",
                        "tilak": True,
                        "batterRuns": batter_runs,
                        "totalRuns": batter_runs,
                        "extras": 0,
                        "four": batter_runs == 4,
                        "six": batter_runs == 6,
                        "wicket": is_wicket,
                        "wide": False,
                        "noBall": False,
                        "commentary": b.get("commentary", ""),
                        "scoring": scoring,
                    }
                )
            overs.append(
                {
                    "over": over_no,
                    "runs": runs,
                    "balls": balls_faced,
                    "fours": fours,
                    "sixes": sixes,
                    "deliveries": deliveries,
                    "strikeRate": (
                        round(runs * 100 / balls_faced, 2) if balls_faced else 0
                    ),
                }
            )
        if not overs:
            continue
        row = {
            "date": date,
            "matchId": gid,
            "format": "hyderabad",
            "teams": " vs ".join(teams),
            "opposition": opposition,
            "venue": m.get("ground", ""),
            "innings": 1,
            "battingTeam": "Hyderabad",
            "sourceStatus": "Manual SMAT data from tilakvarmasmatall",
            "overs": overs,
        }
        for key in ("hyderabad", "overall_t20"):
            fmt = formats.get(key)
            if not isinstance(fmt, dict):
                continue
            clone = dict(row)
            clone["format"] = key
            if key == "overall_t20":
                clone["matchId"] = "hyderabad:" + gid
            fmt.setdefault("innings", []).append(clone)
            fmt["innings"].sort(
                key=lambda r: (r.get("date", ""), str(r.get("matchId", ""))),
                reverse=True,
            )
            fmt["inningsFound"] = len(fmt["innings"])
            fmt["matchesFound"] = len(
                {str(r.get("matchId", "")) for r in fmt["innings"]}
            )
            totals = defaultdict(
                lambda: {"runs": 0, "balls": 0, "fours": 0, "sixes": 0}
            )
            for inning in fmt["innings"]:
                for ov in inning.get("overs", []):
                    n = int(ov.get("over", 0) or 0)
                    for metric in ("runs", "balls", "fours", "sixes"):
                        totals[n][metric] += int(ov.get(metric, 0) or 0)
            fmt["overTotals"] = [
                {
                    "over": n,
                    **totals[n],
                    "strikeRate": (
                        round(totals[n]["runs"] * 100 / totals[n]["balls"], 2)
                        if totals[n]["balls"]
                        else 0
                    ),
                }
                for n in range(1, 21)
            ]
        added += 1

    if added:
        DATA.write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    print(
        f"Manual Hyderabad SMAT death-over innings added: {added}; duplicates skipped"
    )
    print(f"Dataset unchanged: {added == 0}")


if __name__ == "__main__":
    main()
