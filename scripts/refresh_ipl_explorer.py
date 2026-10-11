#!/usr/bin/env python3
"""Build a dedicated Tilak Varma IPL Explore dataset from Cricsheet's IPL archive.

The last valid IPL snapshot is preserved if the source is unavailable or parsing fails.
"""
import io
import json
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "site-data.json"
ARCHIVE_URL = "https://cricsheet.org/downloads/ipl_json.zip"
PLAYER = "Tilak Varma"
SOURCE = "Cricsheet IPL ball-by-ball archive"
SOURCE_URL = "https://cricsheet.org/downloads/ipl_json.zip"
HEADERS = {
    "User-Agent": "TilakVarmaFanClub-data-refresh/1.0 (+https://github.com/nitishratre45/tilakvarmafanclub)"
}


def stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def as_int(value):
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def parse_date(info):
    dates = info.get("dates") or []
    return str(dates[0])[:10] if dates else ""


def extract_match(raw):
    match = json.loads(raw.decode("utf-8"))
    info = match.get("info") or {}
    teams = info.get("teams") or []
    date = parse_date(info)
    season = str(info.get("season") or (date[:4] if date else ""))
    match_id = (
        str(match.get("meta", {}).get("data_version", ""))
        + "|"
        + date
        + "|"
        + "|".join(sorted(teams))
    )
    innings_rows = []
    for innings_number, innings in enumerate(match.get("innings") or [], start=1):
        batting_team = innings.get("team", "")
        deliveries = [
            d for over in innings.get("overs", []) for d in over.get("deliveries", [])
        ]
        if not any(
            str(d.get("batter", "")).casefold() == PLAYER.casefold() for d in deliveries
        ):
            continue
        # Cricsheet has no explicit batting-position field; infer the order from
        # each batter's first appearance in the delivery list.
        batter_order = []
        for delivery in deliveries:
            batter_name = str(delivery.get("batter", "")).strip()
            if batter_name and batter_name not in batter_order:
                batter_order.append(batter_name)
        position = batter_order.index(PLAYER) + 1 if PLAYER in batter_order else None
        runs = balls = fours = sixes = 0
        dismissed = False
        for d in deliveries:
            if str(d.get("batter", "")).casefold() != PLAYER.casefold():
                continue
            br = as_int((d.get("runs") or {}).get("batter"))
            extras = d.get("extras") or {}
            runs += br
            if not as_int(extras.get("wides")):
                balls += 1
            if br == 4:
                fours += 1
            elif br == 6:
                sixes += 1
            if any(
                str(w.get("player_out", "")).casefold() == PLAYER.casefold()
                for w in d.get("wickets", [])
            ):
                dismissed = True
        opposition = next((t for t in teams if t != batting_team), "—")
        total_runs = sum(as_int((d.get("runs") or {}).get("total")) for d in deliveries)
        score = str(runs) + ("" if dismissed else "*")
        innings_rows.append(
            {
                "date": date,
                "format": "IPL",
                "season": season,
                "opposition": "v " + opposition,
                "ground": str(info.get("venue") or "—"),
                "score": score,
                "runs": runs,
                "notOut": not dismissed,
                "minutes": "—",
                "balls": balls,
                "fours": fours,
                "sixes": sixes,
                "strikeRate": round(runs * 100 / balls, 2) if balls else 0,
                "position": position or "—",
                "dismissal": "not out" if not dismissed else "dismissed",
                "innings": str(innings_number),
                "wickets": "—",
                "catches": "—",
                "stumpings": "—",
                "source": SOURCE,
                "matchUrl": "https://cricsheet.org/",
                "matchId": match_id,
                "team": batting_team,
                "matchRuns": total_runs,
            }
        )
    return innings_rows


def make_summary(rows):
    matches = len({r["matchId"] for r in rows})
    innings = len(rows)
    not_outs = sum(bool(r["notOut"]) for r in rows)
    runs = sum(r["runs"] for r in rows)
    balls = sum(r["balls"] for r in rows)
    fours = sum(r["fours"] for r in rows)
    sixes = sum(r["sixes"] for r in rows)
    scores = [r for r in rows if isinstance(r.get("runs"), int)]
    best = max(scores, key=lambda r: (r["runs"], bool(r["notOut"])), default=None)
    return {
        "matches": matches,
        "innings": innings,
        "notOuts": not_outs,
        "runs": runs,
        "highestScore": best["score"] if best else "—",
        "average": (
            round(runs / (innings - not_outs), 2) if innings > not_outs else None
        ),
        "balls": balls,
        "strikeRate": round(runs * 100 / balls, 2) if balls else None,
        "hundreds": sum(r["runs"] >= 100 for r in rows),
        "fifties": sum(50 <= r["runs"] < 100 for r in rows),
        "ducks": sum(r["runs"] == 0 for r in rows),
        "fours": fours,
        "sixes": sixes,
    }


def main():
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    request = urllib.request.Request(ARCHIVE_URL, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        archive = response.read()
    rows = []
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        files = [n for n in zf.namelist() if n.lower().endswith(".json")]
        for name in files:
            try:
                rows.extend(extract_match(zf.read(name)))
            except (ValueError, KeyError, TypeError) as exc:
                print("Skipping unreadable match", name, exc)
    if not rows:
        raise SystemExit(
            "No Tilak Varma IPL innings found; preserving saved IPL snapshot."
        )
    rows.sort(key=lambda r: (r.get("date", ""), r.get("matchId", "")), reverse=True)
    # Guard against a partial/incorrect archive overwriting a larger valid snapshot.
    old = (data.get("statsguru") or {}).get("formats", {}).get("IPL", {})
    old_rows = old.get("innings") or []
    if len(rows) < len(old_rows):
        raise SystemExit(
            f"Incoming IPL innings ({len(rows)}) fewer than saved ({len(old_rows)}); preserving old snapshot."
        )
    by_season = defaultdict(list)
    for row in rows:
        by_season[row.get("season") or row.get("date", "")[:4]].append(row)
    breakdown = []
    for season, season_rows in sorted(by_season.items()):
        breakdown.append(
            {"group": "Season " + str(season), "span": str(season), **make_summary(season_rows)}
        )
    by_opposition = defaultdict(list)
    by_position = defaultdict(list)
    for row in rows:
        by_opposition[row.get("opposition") or "v Unknown"].append(row)
        if isinstance(row.get("position"), int):
            by_position[row["position"]].append(row)
    for opposition, opposition_rows in sorted(by_opposition.items()):
        breakdown.append(
            {"group": opposition, "span": "All seasons", **make_summary(opposition_rows)}
        )
    def ordinal(n):
        return str(n) + ("th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th"))
    for position, position_rows in sorted(by_position.items()):
        breakdown.append(
            {"group": ordinal(position) + " position", "span": "All seasons", **make_summary(position_rows)}
        )
    breakdown.append(
        {"group": "overall", "span": f"{min(by_season)}-{max(by_season)}", **make_summary(rows)}
    )
    formats = data.setdefault("statsguru", {}).setdefault("formats", {})
    formats["IPL"] = {
        "summary": make_summary(rows),
        "careerBreakdown": breakdown,
        "innings": rows,
        "inningsCount": len(rows),
        "source": SOURCE,
        "careerUrl": "https://www.ipl-stats.com/player/Tilak_Varma",
        "inningsUrl": SOURCE_URL,
        "matchListUrl": SOURCE_URL,
        "debut": min((r["date"] for r in rows if r.get("date")), default="—"),
        "lastMatch": max((r["date"] for r in rows if r.get("date")), default="—"),
        "updatedAt": stamp(),
        "coverageNote": "IPL innings derived from available Cricsheet ball-by-ball match files. Batting position is inferred from batter appearance order; matches without a published archive file are not inferred.",
    }
    data["statsguru"]["source"] = "ESPNcricinfo Statsguru + Cricsheet IPL archive"
    data["statsguru"]["iplUpdatedAt"] = stamp()
    data["statsguru"]["iplLastAttemptStatus"] = "success"
    data["statsguru"]["iplLastAttemptError"] = None
    DATA_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("IPL Explore updated:", len(rows), "innings;", make_summary(rows))


if __name__ == "__main__":
    main()
