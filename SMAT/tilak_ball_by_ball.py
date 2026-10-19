#!/usr/bin/env python3
"""Collect Tilak Varma's Syed Mushtaq Ali Trophy scorecards and ball-by-ball data.

The script reads BCCI match-result pages for the supplied competition IDs, fetches
scorecards, keeps matches where Tilak Varma appears, and attempts to save each
match's enhanced commentary. It preserves raw source JSON and writes an audit
report so unavailable commentary is never silently treated as zero data.

Run: python "SMAT/tilak_ball_by_ball.py"
Optional: set BCCI_EDAK in the environment if the commentary endpoint requires it.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parent
RESULTS_DIR = ROOT / "data" / "results"
SCORECARDS_DIR = ROOT / "data" / "scorecards"
COMMENTARY_DIR = ROOT / "data" / "commentary"
TILAK_BALLS_DIR = ROOT / "data" / "tilak_balls"
REPORT_DIR = ROOT / "data" / "reports"

COMPETITIONS = [
    {"name": "SMAT 2024-25", "gid": "123347c2-3f0c-4636-b9de-c4487ed15f9f", "start": "2024-01-01"},
    {"name": "SMAT 2023-24", "gid": "b1c39c31-5bc9-4b26-9d79-5921a0585b40", "start": "2023-01-01"},
    {"name": "SMAT 2022-23", "gid": "9c75fa98-d7b0-4767-b101-5ee418bd14c1", "start": "2022-01-01"},
]
RESULTS_URL = "https://stats.bcci.tv/match/results/"
SCORECARD_URL = "https://stats.bcci.tv/match/{gid}/scorecard"
COMMENTARY_URL = "https://epr.ellipsedata.com/redirect/1/match/{gid}/commentary?type=enhanced"
PAGE_SIZE = 12
MAX_PAGES = 100
PLAYER_NAME = "tilak varma"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.bcci.tv/",
}
COMMENTARY_HEADERS = {
    **HEADERS,
    "Origin": "https://www.bcci.tv",
    "Content-Type": "application/json",
}
if os.getenv("BCCI_EDAK"):
    COMMENTARY_HEADERS["edak"] = os.environ["BCCI_EDAK"]


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def walk_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


def find_records(payload: Any) -> list[dict]:
    candidates = []
    for item in walk_dicts(payload):
        for value in item.values():
            if isinstance(value, list) and value and all(isinstance(x, dict) for x in value):
                score = sum(
                    1 for row in value
                    if any(k in row for k in ("gid", "match_gid", "match_id", "match_start_date", "start_date"))
                )
                if score:
                    candidates.append((score, value))
    if not candidates:
        return []
    return max(candidates, key=lambda pair: pair[0])[1]


def match_gid(record: dict) -> str | None:
    for key in ("gid", "match_gid", "matchGid", "match_uuid"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for parent in walk_dicts(record):
        value = parent.get("gid")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def contains_tilak(scorecard: Any) -> bool:
    for item in walk_dicts(scorecard):
        for key, value in item.items():
            if key.lower() in {"player_name", "playername", "name", "batter_name", "batsman_name", "full_name"}:
                if norm(value) == PLAYER_NAME:
                    return True
    # Some scorecards only carry player IDs in batting rows; use name-based
    # matching first and retain diagnostics if the source omits names.
    return False


def number(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def collect_tilak_batting_rows(scorecard: Any, metadata: dict) -> list[dict]:
    rows = []
    seen = set()
    for item in walk_dicts(scorecard):
        # BCCI scorecard schemas vary. Identify batting rows by player name and
        # typical batting fields, avoiding unrelated player/summary objects.
        name = next((item.get(k) for k in ("player_name", "playerName", "name", "batter_name", "batsman_name", "full_name") if isinstance(item.get(k), str)), "")
        if norm(name) != PLAYER_NAME:
            continue
        has_batting_stats = any(k in item for k in ("runs", "batsman_runs", "balls", "balls_faced", "strike_rate", "sr"))
        if not has_batting_stats:
            continue
        key = (str(metadata.get("gid")), str(item.get("innings_number", item.get("innings", ""))), str(item.get("runs")), str(item.get("balls", item.get("balls_faced", ""))))
        if key in seen:
            continue
        seen.add(key)
        runs = number(item.get("runs", item.get("batsman_runs", 0)))
        balls = number(item.get("balls", item.get("balls_faced", item.get("ball_faced", 0))))
        fours = number(item.get("fours", item.get("four", 0)))
        sixes = number(item.get("sixes", item.get("six", 0)))
        rows.append({
            **metadata,
            "innings": item.get("innings_number", item.get("innings")),
            "player": "Tilak Varma",
            "runs": runs,
            "balls_faced": balls,
            "fours": fours,
            "sixes": sixes,
            "strike_rate": round(runs * 100 / balls, 2) if balls else None,
            "dismissal": item.get("dismissal", item.get("how_out")),
            "source_row": item,
        })
    return rows


def extract_delivery_objects(payload: Any) -> list[dict]:
    """Best-effort flattening of commentary formats; raw payload is always saved."""
    found = []
    seen = set()
    delivery_markers = ("over", "ball", "over_number", "ball_number", "commentary", "text", "event", "batsman")
    for item in walk_dicts(payload):
        keys = {str(k).lower() for k in item}
        if len(keys.intersection(delivery_markers)) >= 2:
            # Skip huge containers and keep likely per-delivery records.
            encoded = json.dumps(item, sort_keys=True, ensure_ascii=False)
            if len(encoded) < 20000 and encoded not in seen:
                seen.add(encoded)
                found.append(item)
    return found


def main() -> None:
    for directory in (RESULTS_DIR, SCORECARDS_DIR, COMMENTARY_DIR, TILAK_BALLS_DIR, REPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)
    all_matches: dict[str, dict] = {}
    result_failures = []
    result_pages = []

    for comp in COMPETITIONS:
        comp_matches = 0
        for page in range(1, MAX_PAGES + 1):
            params = {"comp_gid": comp["gid"], "min_start_date": comp["start"], "page": page, "size": PAGE_SIZE}
            try:
                response = session.get(RESULTS_URL, params=params, timeout=40)
                response.raise_for_status()
                payload = response.json()
                save_json(RESULTS_DIR / f'{comp["gid"]}_page_{page:03d}.json', payload)
                records = find_records(payload)
                result_pages.append({"competition": comp["name"], "page": page, "records": len(records), "url": response.url})
                if not records:
                    break
                for record in records:
                    gid = match_gid(record)
                    if not gid:
                        continue
                    all_matches.setdefault(gid, {"gid": gid, "competition": comp["name"], "competition_gid": comp["gid"], "result_record": record})
                    comp_matches += 1
                if len(records) < PAGE_SIZE:
                    break
            except Exception as exc:
                result_failures.append({"competition": comp["name"], "page": page, "error": str(exc)})
                break
            time.sleep(0.25)
        print(f'{comp["name"]}: collected {comp_matches} result records')

    tilak_matches = []
    scorecard_failures = []
    commentary_failures = []
    summary_rows = []
    for index, (gid, meta) in enumerate(all_matches.items(), 1):
        print(f"[{index}/{len(all_matches)}] Scorecard {gid}")
        try:
            response = session.get(SCORECARD_URL.format(gid=gid), timeout=40)
            response.raise_for_status()
            scorecard = response.json()
        except Exception as exc:
            scorecard_failures.append({"gid": gid, "error": str(exc)})
            continue

        if not contains_tilak(scorecard):
            continue
        save_json(SCORECARDS_DIR / f"{gid}.json", scorecard)

        match_info = meta.get("result_record", {})
        match_obj = scorecard.get("match", {}) if isinstance(scorecard, dict) else {}
        metadata = {
            "gid": gid,
            "competition": meta["competition"],
            "competition_gid": meta["competition_gid"],
            "date": match_info.get("start_date") or match_info.get("match_start_date") or match_obj.get("start_date") or match_obj.get("date_string"),
            "match": match_info.get("name") or match_info.get("match_short_name") or match_obj.get("name") or match_obj.get("match_short_name"),
            "ground": match_obj.get("ground_name") or match_info.get("ground_name"),
            "source": "BCCI scorecard",
        }
        tilak_matches.append(metadata)
        rows = collect_tilak_batting_rows(scorecard, metadata)
        summary_rows.extend(rows)

        try:
            # BCCI match GID is the candidate UUID for the commentary endpoint.
            # Save response as-is even if its schema is new or unexpectedly empty.
            comm_response = session.get(COMMENTARY_URL.format(gid=gid), headers=COMMENTARY_HEADERS, timeout=45)
            comm_response.raise_for_status()
            commentary = comm_response.json()
            save_json(COMMENTARY_DIR / f"{gid}.json", commentary)
            deliveries = extract_delivery_objects(commentary)
            tilak_deliveries = []
            for delivery in deliveries:
                batter = next((delivery.get(k) for k in ("batsman", "batter", "batsman_name", "batter_name", "striker", "player_name") if isinstance(delivery.get(k), str)), "")
                if norm(batter) == PLAYER_NAME:
                    tilak_deliveries.append(delivery)
            save_json(TILAK_BALLS_DIR / f"{gid}.json", {
                "match": metadata,
                "source_commentary_file": f"../commentary/{gid}.json",
                "extraction_note": "Raw enhanced commentary is preserved separately. This list includes only events whose top-level batter field identifies Tilak; validate coverage against source schema.",
                "tilak_ball_events": tilak_deliveries,
                "detected_commentary_events": len(deliveries),
                "tilak_events_detected": len(tilak_deliveries),
            })
        except Exception as exc:
            commentary_failures.append({"gid": gid, "match": metadata.get("match"), "error": str(exc)})
        time.sleep(0.35)

    total_runs = sum(row["runs"] for row in summary_rows)
    total_balls = sum(row["balls_faced"] for row in summary_rows)
    total_fours = sum(row["fours"] for row in summary_rows)
    total_sixes = sum(row["sixes"] for row in summary_rows)
    total_innings = len(summary_rows)
    summary = {
        "player": "Tilak Varma",
        "format": "Men's domestic T20 — Syed Mushtaq Ali Trophy",
        "seasons_requested": [c["name"] for c in COMPETITIONS],
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "matches_with_tilak_in_scorecard": len(tilak_matches),
        "innings_rows_found": total_innings,
        "runs": total_runs,
        "balls_faced": total_balls,
        "fours": total_fours,
        "sixes": total_sixes,
        "strike_rate": round(total_runs * 100 / total_balls, 2) if total_balls else None,
        "average": None,
        "note": "Average is intentionally omitted until dismissals/not-outs are reliably normalized from the source scorecards. Missing scorecards/commentary are listed in the audit; they are not counted as zero.",
        "matches": tilak_matches,
        "batting_innings": summary_rows,
    }
    save_json(REPORT_DIR / "tilak_smat_summary.json", summary)
    save_json(REPORT_DIR / "collection_audit.json", {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "competitions": COMPETITIONS,
        "result_pages": result_pages,
        "unique_matches_seen": len(all_matches),
        "matches_with_tilak_in_scorecard": len(tilak_matches),
        "result_failures": result_failures,
        "scorecard_failures": scorecard_failures,
        "commentary_failures": commentary_failures,
        "coverage_warning": "This report reflects only matches returned by the configured BCCI competition result APIs. Commentary may be unavailable or require a current edak token. Inspect raw files and failures before treating totals as complete."
    })
    print("Finished.")
    print(f"Matches with Tilak: {len(tilak_matches)}")
    print(f"Batting rows detected: {total_innings}; runs={total_runs}; balls={total_balls}; SR={summary['strike_rate']}")
    print(f"Audit: {REPORT_DIR / 'collection_audit.json'}")


if __name__ == "__main__":
    main()
