#!/usr/bin/env python3
"""Standalone diagnostic for the BCCI women's live-score feed.

This test is intentionally separate from refresh_bcci_live_matches.py and does
not modify the production live-match JSON. It requests the BCCI live-scores
endpoint without men's comp/team filters, then records the raw response shape,
status distribution, and any records that look like women's matches.
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SOURCE_URL = os.environ.get(
    "BCCI_WOMEN_LIVE_URL",
    "https://stats.bcci.tv/match/live_scores/",
)
OUTPUT_PATH = "matches/live/bcci-women-live-test.json"
TIMEOUT_SECONDS = 25


def rows_from(payload):
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("matches", "match", "data", "results", "response", "live_scores", "liveScores", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [row for row in value if isinstance(row, dict)]
        if isinstance(value, dict):
            nested = rows_from(value)
            if nested:
                return nested
    # Some endpoints wrap arrays one level deeper under an arbitrary key.
    for value in payload.values():
        if isinstance(value, dict):
            nested = rows_from(value)
            if nested:
                return nested
        elif isinstance(value, list) and value and all(isinstance(item, dict) for item in value):
            return value
    return []


def status_of(row):
    for key in ("match_status_str", "match_status", "status_str", "status", "state", "matchStatus", "match_state", "live_status_name"):
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return "<empty>"


def looks_womens(row):
    text = " ".join(
        str(row.get(key, ""))
        for key in (
            "name", "title", "match_short_name", "comp_name", "competition",
            "series_name", "team1_name", "team2_name", "team1_short_name",
            "team2_short_name", "team_name", "gender", "match_type",
        )
    ).lower()
    return any(token in text for token in ("women", "woman", "womens", "women's", " w v ", " w vs "))


def main():
    checked_at = datetime.now(timezone.utc).isoformat()
    report = {
        "checkedAt": checked_at,
        "test": "bcci-women-live-endpoint",
        "source": SOURCE_URL,
        "httpStatus": None,
        "contentType": None,
        "responseBytes": 0,
        "topLevelType": None,
        "topLevelKeys": [],
        "totalRecords": 0,
        "statusCounts": {},
        "womenCandidateCount": 0,
        "womenCandidates": [],
        "sampleRecordKeys": [],
        "error": None,
        "note": "Diagnostic only; this file does not feed the production live-match page.",
    }
    request = Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0 (compatible; CricZone-BCCI-Live-Test/1.0)", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read()
            report["httpStatus"] = response.status
            report["contentType"] = response.headers.get("Content-Type", "")
            report["responseBytes"] = len(raw)
        payload = json.loads(raw.decode("utf-8-sig"))
        report["topLevelType"] = type(payload).__name__
        if isinstance(payload, dict):
            report["topLevelKeys"] = sorted(payload.keys())[:80]
        rows = rows_from(payload)
        report["totalRecords"] = len(rows)
        report["statusCounts"] = dict(Counter(status_of(row) for row in rows).most_common(50))
        report["sampleRecordKeys"] = [sorted(row.keys())[:80] for row in rows[:3]]
        candidates = [row for row in rows if looks_womens(row)]
        report["womenCandidateCount"] = len(candidates)
        report["womenCandidates"] = candidates[:30]
        report["status"] = "ok" if report["httpStatus"] == 200 else "http-error"
    except HTTPError as exc:
        report["httpStatus"] = exc.code
        report["error"] = f"HTTPError: {exc.code} {exc.reason}"
        report["status"] = "error"
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
        report["status"] = "error"
    except Exception as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
        report["status"] = "error"

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({key: report[key] for key in (
        "status", "httpStatus", "contentType", "responseBytes", "topLevelType",
        "topLevelKeys", "totalRecords", "statusCounts", "womenCandidateCount",
        "error",
    )}, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
