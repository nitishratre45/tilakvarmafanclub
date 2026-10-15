#!/usr/bin/env python3
"""Build full Tilak Varma scorecards from Cricsheet's public JSON archive."""
from __future__ import annotations
import hashlib, io, json, re, sys, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "matches" / "scorecards"
DATA = OUT / "data"
INDEX = OUT / "index.json"
ARCHIVE_URL = "https://cricsheet.org/downloads/all_json.zip"
PLAYER = "Tilak Varma"
PLAYER_KEY = PLAYER.casefold()
NON_BOWLER_WICKETS = {
    "retired hurt",
    "retired out",
    "run out",
    "obstructing the field",
    "handled the ball",
    "hit the ball twice",
}


def num(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def slug(value):
    return (
        re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold()).strip("-") or "unknown"
    )


def legal(ball):
    extras = ball.get("extras") or {}
    return "wides" not in extras and "noballs" not in extras


def overs(balls):
    return f"{balls // 6}.{balls % 6}"


def dismissal(wicket):
    kind = str(wicket.get("kind") or "out").replace("_", " ")
    fielders = [str(f.get("name")) for f in wicket.get("fielders", []) if f.get("name")]
    return kind + (" (" + ", ".join(fielders) + ")" if fielders else "")


def parse_match(match, source_file):
    info = match.get("info") or {}
    players = info.get("players") or {}
    teams = info.get("teams") or list(players)
    team = next(
        (
            t
            for t, names in players.items()
            if any(str(n).casefold() == PLAYER_KEY for n in (names or []))
        ),
        None,
    )
    if not team:
        return None
    # Guard against unrelated players with the same name in unrelated club datasets.
    # Keep the teams Tilak is documented to have represented, including domestic Hyderabad.
    team_key = re.sub(r"[^a-z0-9]+", " ", str(team).casefold()).strip()
    known_team = (
        team_key == "india"
        or "mumbai indians" in team_key
        or "hyderabad" in team_key
        or team_key == "india a"
        or "india under 19" in team_key
        or "india u19" in team_key
        or "medak falcons" in team_key
    )
    if not known_team:
        return None
    raw_type = str(info.get("match_type") or "Unknown")
    team_type = str(info.get("team_type") or "").casefold()
    fmt = {
        "IT20": "T20I",
        "T20": "T20I" if team_type == "international" else "T20",
        "ODI": "ODI",
        "ODM": "List A",
        "Test": "Test",
        "MDM": "First-class",
    }.get(raw_type, raw_type)
    dates = info.get("dates") or []
    date = str(dates[0]) if dates else ""
    opponent = next((t for t in teams if t != team), "Unknown")
    venue = str(info.get("venue") or info.get("city") or "Venue unavailable")
    event = info.get("event") or {}
    event_name = event.get("name") if isinstance(event, dict) else str(event or "")
    suffix = hashlib.sha1(source_file.encode()).hexdigest()[:12]
    mid = f"{slug(date)}-{slug(fmt)}-{slug(team)}-vs-{slug(opponent)}-{suffix}"
    innings_out, player_innings = [], []

    for inn_no, inn in enumerate(match.get("innings") or [], 1):
        batting_team = str(inn.get("team") or "Unknown")
        bowling_team = next((t for t in teams if t != batting_team), "Unknown")
        batters, bowlers, extra_totals = {}, {}, {}
        balls_out, fow = [], []
        runs = wickets = legal_total = 0
        over_runs, over_legal = {}, {}
        for over in inn.get("overs") or []:
            over_no = num(over.get("over")) + 1
            for ball_no, ball in enumerate(over.get("deliveries") or [], 1):
                batter, non_striker, bowler = (
                    str(ball.get(k) or "Unknown")
                    for k in ("batter", "non_striker", "bowler")
                )
                run_data, extras = ball.get("runs") or {}, ball.get("extras") or {}
                batter_runs, total = num(run_data.get("batter")), num(
                    run_data.get("total")
                )
                runs += total
                is_legal = legal(ball)
                if is_legal:
                    legal_total += 1
                    over_legal[over_no] = over_legal.get(over_no, 0) + 1
                bat = batters.setdefault(
                    batter,
                    {
                        "batter": batter,
                        "runs": 0,
                        "balls": 0,
                        "fours": 0,
                        "sixes": 0,
                        "strikeRate": 0.0,
                        "dismissal": "not out",
                        "notOut": True,
                    },
                )
                bat["runs"] += batter_runs
                if "wides" not in extras:
                    bat["balls"] += 1
                if batter_runs == 4:
                    bat["fours"] += 1
                if batter_runs == 6:
                    bat["sixes"] += 1
                bowl = bowlers.setdefault(
                    bowler,
                    {
                        "bowler": bowler,
                        "overs": "0.0",
                        "legalBalls": 0,
                        "maidens": 0,
                        "runs": 0,
                        "wickets": 0,
                        "economy": 0.0,
                    },
                )
                charged = max(
                    0,
                    total
                    - num(extras.get("byes"))
                    - num(extras.get("legbyes"))
                    - num(extras.get("penalty")),
                )
                bowl["runs"] += charged
                over_runs[over_no] = over_runs.get(over_no, 0) + charged
                if is_legal:
                    bowl["legalBalls"] += 1
                for key, value in extras.items():
                    extra_totals[key] = extra_totals.get(key, 0) + num(value)
                wicket_rows = []
                for wicket in ball.get("wickets") or []:
                    dismissed = str(wicket.get("player_out") or "Unknown")
                    kind = str(wicket.get("kind") or "out").replace("_", " ")
                    wicket_rows.append(
                        {
                            "player": dismissed,
                            "kind": kind,
                            "fielders": [
                                str(f.get("name"))
                                for f in wicket.get("fielders", [])
                                if f.get("name")
                            ],
                        }
                    )
                    if kind.casefold() != "retired hurt":
                        wickets += 1
                    if dismissed in batters:
                        batters[dismissed]["dismissal"] = dismissal(wicket)
                        batters[dismissed]["notOut"] = False
                    if (
                        kind.casefold() not in NON_BOWLER_WICKETS
                        and kind.casefold() != "retired hurt"
                    ):
                        bowl["wickets"] += 1
                    fow.append(
                        {
                            "wicket": wickets,
                            "score": runs,
                            "over": f"{over_no-1}.{ball_no}",
                            "batter": dismissed,
                            "kind": kind,
                        }
                    )
                balls_out.append(
                    {
                        "over": over_no,
                        "ball": ball_no,
                        "batter": batter,
                        "nonStriker": non_striker,
                        "bowler": bowler,
                        "batterRuns": batter_runs,
                        "extras": extras,
                        "totalRuns": total,
                        "legal": is_legal,
                        "wickets": wicket_rows,
                    }
                )
        for over_no, legal_count in over_legal.items():
            if legal_count >= 6 and over_runs.get(over_no, 0) == 0:
                for name in {b["bowler"] for b in balls_out if b["over"] == over_no}:
                    if name in bowlers:
                        bowlers[name]["maidens"] += 1
        bat_rows = list(batters.values())
        for row in bat_rows:
            row["strikeRate"] = (
                round(row["runs"] * 100 / row["balls"], 2) if row["balls"] else 0.0
            )
        bowl_rows = list(bowlers.values())
        for row in bowl_rows:
            row["overs"] = overs(row["legalBalls"])
            row["economy"] = (
                round(row["runs"] / (row["legalBalls"] / 6), 2)
                if row["legalBalls"]
                else 0.0
            )
        innings_out.append(
            {
                "number": inn_no,
                "team": batting_team,
                "opposition": bowling_team,
                "runs": runs,
                "wickets": wickets,
                "legalBalls": legal_total,
                "overs": overs(legal_total),
                "extras": sum(extra_totals.values()),
                "extrasBreakdown": extra_totals,
                "batting": bat_rows,
                "bowling": bowl_rows,
                "fallOfWickets": fow,
                "deliveries": balls_out,
            }
        )
        player_bat = next(
            (r for r in bat_rows if r["batter"].casefold() == PLAYER_KEY), None
        )
        player_bowl = next(
            (r for r in bowl_rows if r["bowler"].casefold() == PLAYER_KEY), None
        )
        player_innings.append(
            {
                "innings": inn_no,
                "team": batting_team,
                "batting": player_bat or {"status": "DNB", "runs": None, "balls": None},
                "bowling": player_bowl,
            }
        )

    outcome = info.get("outcome") or {}
    winner, by = outcome.get("winner"), outcome.get("by") or {}
    if winner:
        margin = next((f"{v} {k}" for k, v in by.items() if v is not None), "")
        result = f"{winner} won by {margin}".strip()
    elif outcome.get("result"):
        result = str(outcome["result"]).replace("_", " ").title()
    else:
        result = "Result unavailable"
    return {
        "schemaVersion": 1,
        "matchId": mid,
        "date": date,
        "dates": dates,
        "format": fmt,
        "sourceFormat": raw_type,
        "event": event_name,
        "season": str(info.get("season") or ""),
        "teams": teams,
        "team": team,
        "opposition": opponent,
        "venue": venue,
        "city": str(info.get("city") or ""),
        "gender": str(info.get("gender") or ""),
        "toss": info.get("toss") or {},
        "officials": info.get("officials") or {},
        "playerOfMatch": info.get("player_of_match") or [],
        "result": result,
        "outcome": outcome,
        "player": PLAYER,
        "playerInnings": player_innings,
        "innings": innings_out,
        "source": "https://cricsheet.org/",
        "sourceArchive": ARCHIVE_URL,
        "attribution": "Match data provided by Cricsheet; Open Data Commons Attribution License (ODC-BY).",
        "sourceFile": source_file,
    }


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        ARCHIVE_URL,
        headers={
            "User-Agent": "TilakVarmaFanClub/1.0 (scorecard data; Cricsheet attribution)"
        },
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    rows, written, malformed, removed_stale = [], 0, 0, 0
    for source_file in archive.namelist():
        if not source_file.lower().endswith(".json"):
            continue
        try:
            match = json.loads(archive.read(source_file))
        except (json.JSONDecodeError, UnicodeDecodeError):
            malformed += 1
            continue
        card = parse_match(match, source_file)
        if not card:
            continue
        (DATA / (card["matchId"] + ".json")).write_text(
            json.dumps(card, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        written += 1
        player_runs = sum(
            num(item.get("batting", {}).get("runs"))
            for item in card["playerInnings"]
            if isinstance(item.get("batting"), dict)
        )
        rows.append(
            {
                "matchId": card["matchId"],
                "date": card["date"],
                "format": card["format"],
                "team": card["team"],
                "opposition": card["opposition"],
                "venue": card["venue"],
                "event": card["event"],
                "result": card["result"],
                "playerRuns": player_runs,
                "inningsCount": len(card["innings"]),
                "scorecard": f"/matches/scorecards/data/{card['matchId']}.json",
                "source": card["source"],
            }
        )
    # Cricsheet all_json.zip already includes Syed Mushtaq Ali Trophy; verified SMAT matches are indexed with ball-by-ball deliveries.
    rows.sort(key=lambda row: row.get("date") or "", reverse=True)
    # Remove stale files for unrelated/same-name club entries no longer in the verified index.
    keep_files = {row["matchId"] + ".json" for row in rows}
    for old_file in DATA.glob("*.json"):
        if old_file.name not in keep_files:
            old_file.unlink()
            removed_stale += 1
    index = {
        "schemaVersion": 1,
        "player": PLAYER,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Cricsheet all-match JSON archive",
        "sourceUrl": ARCHIVE_URL,
        "attribution": "Match data provided by Cricsheet; Open Data Commons Attribution License (ODC-BY).",
        "coverageNote": "Only verified matches listing Tilak Varma are included. Cricsheet all_json.zip includes IPL and Syed Mushtaq Ali Trophy ball-by-ball data. Ranji Trophy ball-by-ball is not available in this archive; absent deliveries are not fabricated.",
        "matchCount": len(rows),
        "matches": rows,
    }
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Archive files: {len(archive.namelist())}; scorecards written: {written}; indexed matches: {len(rows)}; stale files removed: {removed_stale}; malformed files skipped: {malformed}"
    )
    if not rows:
        print(
            "::error::No Tilak Varma matches found; refusing to publish an empty index."
        )
        return 1
    for row in rows:
        path = ROOT / row["scorecard"].lstrip("/")
        card = json.loads(path.read_text(encoding="utf-8"))
        if not card.get("innings"):
            raise RuntimeError(f"Scorecard has no innings: {path}")
    print("Scorecard JSON validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
