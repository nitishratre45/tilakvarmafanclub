#!/usr/bin/env python3
"""Build complete international scorecards from Cricsheet archives.

Downloads T20I, ODI and Test ZIPs to a temporary directory, converts each match
into compact innings scorecards, writes year/format JSON bundles plus an index,
and removes every ZIP/temp extraction immediately after successful conversion.
"""
from __future__ import annotations
import json, os, re, shutil, tempfile, urllib.request, zipfile
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
INDEX = ROOT / "archive-index.json"
ARCHIVES = {
    "T20I": "https://cricsheet.org/downloads/t20s_male_json.zip",
    "ODI": "https://cricsheet.org/downloads/odis_male_json.zip",
    "Test": "https://cricsheet.org/downloads/tests_male_json.zip",
}
ATTRIBUTION = "Match data provided by Cricsheet; Open Data Commons Attribution License (ODC-BY)."

def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-") or "unknown"

def date_of(info):
    dates = info.get("dates") or []
    return str(dates[0])[:10] if dates else ""

def overs_text(legal_balls):
    return f"{legal_balls // 6}.{legal_balls % 6}"

def parse_match(path, fmt):
    raw = json.loads(path.read_text(encoding="utf-8"))
    info = raw.get("info") or {}
    teams = list(info.get("teams") or [])
    if len(teams) != 2:
        return None
    date = date_of(info)
    if not date:
        return None
    innings_out = []
    for number, inn in enumerate(raw.get("innings") or [], 1):
        team = inn.get("team") or "Unknown"
        bat = OrderedDict()
        bowl = OrderedDict()
        extras = OrderedDict()
        fow = []
        total = 0
        wickets = 0
        legal_balls = 0
        score_at_ball = 0
        for over in inn.get("overs") or []:
            over_no = int(over.get("over", 0)) + 1
            for ball_no, delivery in enumerate(over.get("deliveries") or [], 1):
                batter = delivery.get("batter") or "Unknown"
                bowler = delivery.get("bowler") or "Unknown"
                runs = delivery.get("runs") or {}
                batter_runs = int(runs.get("batter", 0) or 0)
                extras_runs = int(runs.get("extras", 0) or 0)
                total += int(runs.get("total", batter_runs + extras_runs) or 0)
                score_at_ball = total
                if batter not in bat:
                    bat[batter] = {"batter": batter, "runs": 0, "balls": 0, "fours": 0, "sixes": 0, "dismissal": "not out", "notOut": True}
                bat[batter]["runs"] += batter_runs
                if batter_runs == 4: bat[batter]["fours"] += 1
                if batter_runs == 6: bat[batter]["sixes"] += 1
                ex = delivery.get("extras") or {}
                for name, val in ex.items(): extras[name] = extras.get(name, 0) + int(val or 0)
                legal = not any(k in ex for k in ("wides", "noballs"))
                if "wides" not in ex:
                    bat[batter]["balls"] += 1
                if legal:
                    legal_balls += 1
                if bowler not in bowl:
                    bowl[bowler] = {"bowler": bowler, "legalBalls": 0, "maidens": 0, "runs": 0, "wickets": 0}
                bowl[bowler]["runs"] += int(runs.get("batter", 0) or 0) + int(ex.get("wides", 0) or 0) + int(ex.get("noballs", 0) or 0)
                if legal:
                    bowl[bowler]["legalBalls"] += 1
                for wicket in delivery.get("wickets") or []:
                    wickets += 1
                    player_out = wicket.get("player_out") or batter
                    if player_out in bat:
                        kind = str(wicket.get("kind", "out")).replace("_", " ")
                        fielders = [str(item.get("name", "")).strip() for item in (wicket.get("fielders") or []) if isinstance(item, dict) and item.get("name")]
                        if kind == "caught": detail = "c " + (fielders[0] if fielders else "fielder") + " b " + bowler
                        elif kind == "bowled": detail = "b " + bowler
                        elif kind == "lbw": detail = "lbw b " + bowler
                        elif kind == "caught and bowled": detail = "c & b " + bowler
                        elif kind == "stumped": detail = "st " + (fielders[0] if fielders else "keeper") + " b " + bowler
                        elif kind == "run out": detail = "run out" + (" (" + ", ".join(fielders) + ")" if fielders else "")
                        elif kind == "hit wicket": detail = "hit wicket b " + bowler
                        elif kind in ("retired hurt", "retired out", "obstructing the field", "hit the ball twice", "handled the ball"): detail = kind
                        else: detail = kind + (" b " + bowler if kind not in ("retired hurt", "retired out", "obstructing the field") else "")
                        bat[player_out]["dismissal"] = kind
                        bat[player_out]["dismissalDetails"] = detail
                        bat[player_out]["notOut"] = False
                    kind = str(wicket.get("kind", ""))
                    if kind not in ("run out", "retired hurt", "obstructing the field", "retired out"):
                        bowl[bowler]["wickets"] += 1
                    fow.append({"wicket": wickets, "score": score_at_ball, "over": f"{over_no}.{ball_no}", "batter": player_out, "kind": kind.replace("_", " "), "bowler": bowler, "fielders": [item.get("name") for item in (wicket.get("fielders") or []) if isinstance(item, dict) and item.get("name")]})
        for player in (info.get("players") or {}).get(team, []):
            if player not in bat: bat[player] = {"batter": player, "runs": None, "balls": None, "fours": 0, "sixes": 0, "dismissal": "DNB", "notOut": False}
        for row in bat.values():
            if row["runs"] is not None:
                balls = row["balls"] or 0
                row["strikeRate"] = round(row["runs"] * 100 / balls, 2) if balls else 0
        for row in bowl.values():
            balls = row["legalBalls"]
            row["overs"] = overs_text(balls)
            row["economy"] = round(row["runs"] / (balls / 6), 2) if balls else 0
            row["maidens"] = 0
        innings_out.append({"number": number, "team": team, "opposition": next((t for t in teams if t != team), ""), "runs": total, "wickets": wickets, "legalBalls": legal_balls, "overs": overs_text(legal_balls), "extras": sum(extras.values()), "extrasBreakdown": dict(extras), "batting": list(bat.values()), "bowling": list(bowl.values()), "fallOfWickets": fow})
    outcome = info.get("outcome") or {}
    winner = outcome.get("winner")
    result = ""
    if winner:
        by = outcome.get("by") or {}
        if by.get("runs") is not None: result = f"{winner} won by {by['runs']} runs"
        elif by.get("wickets") is not None: result = f"{winner} won by {by['wickets']} wickets"
        else: result = f"{winner} won"
    elif outcome.get("method"): result = str(outcome["method"])
    elif outcome.get("result"): result = str(outcome["result"])
    elif len(innings_out) < 2: result = "No result / incomplete scorecard"
    elif any(str(x).lower() in ("draw", "tie", "no result") for x in outcome.values()): result = str(outcome.get("result") or "No result")
    elif fmt == "Test" and len(innings_out) < 4: result = "Match result unavailable"
    elif not winner: result = "Result unavailable"
    mid = str(raw.get("meta", {}).get("data_version", ""))
    match_id = f"{date}-{fmt.lower()}-{slug(teams[0])}-vs-{slug(teams[1])}-{path.stem[:10]}"
    return {"schemaVersion": 1, "matchId": match_id, "sourceMatchId": path.stem, "date": date, "format": fmt, "event": str(info.get("event", {}).get("name", "")), "season": str(info.get("season", date[:4])), "teams": teams, "venue": str(info.get("venue", "")), "city": str(info.get("city", "")), "gender": str(info.get("gender", "")), "toss": info.get("toss") or {}, "officials": info.get("officials") or {}, "playerOfMatch": info.get("player_of_match") or [], "result": result, "outcome": outcome, "innings": innings_out, "source": "https://cricsheet.org/", "attribution": ATTRIBUTION, "sourceFile": path.name, "dataVersion": mid}

def main():
    DATA.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="cricsheet-international-") as temp:
        temp = Path(temp)
        grouped = {}
        index_rows = []
        for fmt, url in ARCHIVES.items():
            archive = temp / (fmt.lower() + ".zip")
            req = urllib.request.Request(url, headers={"User-Agent": "TilakVarmaFanClub-DataUpdater/1.0"})
            with urllib.request.urlopen(req, timeout=180) as response, archive.open("wb") as out:
                shutil.copyfileobj(response, out)
            extracted = temp / fmt.lower()
            extracted.mkdir()
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(extracted)
            # Keep the downloaded ZIP only in this temporary workspace until all derived
            # JSON bundles and the archive index have been written successfully.
            for file in extracted.rglob("*.json"):
                try: match = parse_match(file, fmt)
                except (ValueError, KeyError, TypeError) as exc:
                    print(f"Skipping malformed {file.name}: {exc}")
                    continue
                if not match: continue
                year = match["date"][:4]
                bucket_key = (fmt, year)
                grouped.setdefault(bucket_key, []).append(match)
        # Publish year/format buckets first; each file contains complete innings scorecards.
        for (fmt, year), matches in sorted(grouped.items()):
            matches.sort(key=lambda m: (m["date"], m["matchId"]), reverse=True)
            filename = f"{fmt.lower()}-{year}.json"
            payload = {"schemaVersion": 1, "format": fmt, "year": year, "updatedAt": datetime.now(timezone.utc).isoformat(), "source": "https://cricsheet.org/", "attribution": ATTRIBUTION, "matchCount": len(matches), "matches": matches}
            target = DATA / filename
            target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
            for m in matches:
                index_rows.append({k: m.get(k) for k in ("matchId","sourceMatchId","date","format","event","season","teams","venue","city","result","outcome")})
                index_rows[-1]["scores"] = [{"team": inn.get("team"), "runs": inn.get("runs"), "wickets": inn.get("wickets"), "overs": inn.get("overs")} for inn in m.get("innings", [])]
                index_rows[-1]["scorecard"] = f"/bcci-fixtures-test/recent-match/data/{filename}"
        index_rows.sort(key=lambda m: (m.get("date", ""), m.get("matchId", "")), reverse=True)
        index = {"schemaVersion": 1, "updatedAt": datetime.now(timezone.utc).isoformat(), "source": "https://cricsheet.org/", "attribution": ATTRIBUTION, "formats": list(ARCHIVES), "matchCount": len(index_rows), "matches": index_rows}
        INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    # TemporaryDirectory removes extracted source JSON and any residual ZIPs after data saves.
    print(f"Saved {len(index_rows)} international matches across {len(grouped)} format/year bundles.")
    print("Downloaded ZIP archives and extracted source files removed after JSON generation.")

if __name__ == "__main__":
    main()
