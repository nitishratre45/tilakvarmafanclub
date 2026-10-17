#!/usr/bin/env python3
"""Fetch BCCI fixtures into an isolated JSON artifact.

This diagnostic does not write to production matches/ data.
"""
from __future__ import annotations

import gzip
import json
import os
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "https://stats.bcci.tv/match/fixtures/"
OUTPUT_PATH = os.environ.get("BCCI_FIXTURES_OUTPUT", "bcci-fixtures-test/bcci-fixtures.json")
TIMEOUT_SECONDS = 30
COMP_GIDS = [
    "65d2b784-4a75-41ca-8415-a345042030d6",
    "34154bc1-ebbf-4109-ba78-67cf9cf7aafa",
    "6a64053e-55fc-47ed-9cae-4c58e9b0e551",
    "9a12946b-9277-4b5f-ba94-34d02355bf03",
    "2c9a58d0-365c-4301-839e-b1d2a0803b2b",
    "04d7f468-3b06-4dcc-88de-594afd83c561",
    "52f44249-0afd-41aa-bb88-c6e7778a4f0d",
    "97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2",
    "5cd3ede8-16d7-4914-9d4c-2eb59671fe50",
    "39a2078a-2e87-4f90-86eb-53696579466c",
    "7ca2538b-b8e8-4221-b76f-4705cb75af1f",
    "ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc",
    "13de0d47-83d7-4351-8e6a-57d28a18be48",
    "1cf7ed18-0c14-452c-840b-447aeb5dd020",
    "96f00b0b-c06b-4764-bbc3-7ed388abb24b",
    "dd82f86a-6aa4-477c-b0de-2706a677d0d2",
]
TEAM_GIDS = [
    "71790c66-0e3c-4d0b-96a5-e04526040f94",
    "cf9ec6b2-8d90-41a9-a834-f2f120b37811",
    "83151b98-bbed-42ba-b397-944059ef5830",
    "0f99bbe0-3198-4f82-8520-e18a9e24545f",
    "f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8",
    "4eb0e97b-6e43-47f3-8e46-bedf6de77cea",
    "611a0e16-280f-4fe2-98e8-366ba9719962",
    "01d41b53-68f6-48f8-a8d0-c9ec2f338749",
    "eb81d735-6436-4dac-9a7a-15a7a347d5e6",
    "08dc4ba8-22a1-4e5a-9862-20f8a8643f99",
]
def save_completed_results(matches: list[dict]) -> int:
    """Archive completed matches under bcci-fixtures-test/results, deduplicated by BCCI gid."""
    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    os.makedirs(results_dir, exist_ok=True)
    results_path = os.path.join(results_dir, "results.json")
    existing = {"updatedAt": None, "count": 0, "matches": []}
    try:
        with open(results_path, encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            existing = loaded
    except (OSError, ValueError):
        pass

    by_id = {}
    for match in existing.get("matches", []):
        if isinstance(match, dict):
            key = str(match.get("gid") or match.get("match_id") or "")
            if key:
                by_id[key] = match

    for match in matches:
        if not isinstance(match, dict):
            continue
        status = str(match.get("match_status") or match.get("match_status_name") or "").strip().lower()
        result_text = str(match.get("result_string") or "").strip()
        result_id = str(match.get("result_id") or "").strip()
        live_status = str(match.get("live_status_name") or "").strip().lower()
        completed = (
            status in {"completed", "complete", "finished", "result", "abandoned", "no result", "cancelled"}
            or status.startswith("completed")
            or (bool(result_text) and result_text.lower() not in {
                "teams will be announced at the toss", "match yet to begin", "to be announced", "toss yet to take place"
            } and result_id not in {"", "0", "None"} and live_status not in {"in play", "live"})
        )
        # Status must be explicitly terminal or carry a real result ID/text.
        if not completed:
            continue
        key = str(match.get("gid") or match.get("match_id") or "")
        if key:
            by_id[key] = match

    ordered = sorted(by_id.values(), key=lambda item: str(item.get("start_datetime_utc") or item.get("start_date") or ""), reverse=True)
    payload = {"updatedAt": datetime.now(timezone.utc).isoformat(), "count": len(ordered), "matches": ordered}
    temp = results_path + ".tmp"
    with open(temp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(temp, results_path)
    return len(ordered)

def main() -> int:
    base_params = [
        *(("comp_gid", value) for value in COMP_GIDS),
        ("min_start_date", "2026-01-01"),
        *(("team_gid", value) for value in TEAM_GIDS),
        ("size", "12"),
    ]
    report = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": BASE_URL,
        "pagesRequested": 10,
        "pagesFetched": 0,
        "status": "error",
        "httpStatus": None,
        "contentType": None,
        "data": None,
        "error": None,
        "note": "Isolated diagnostic output only; does not update production matches/ data.",
    }
    all_matches = []
    first_root = None
    try:
        for page in range(1, 11):
            params = [*base_params, ("page", str(page))]
            url = BASE_URL + "?" + urlencode(params)
            request = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; CricZone-BCCI-Fixtures-Test/1.0)",
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.bcci.tv/",
            })
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                raw = response.read()
                report["httpStatus"] = response.status
                report["contentType"] = response.headers.get("Content-Type", "")
                content_encoding = response.headers.get("Content-Encoding", "").lower()
        if content_encoding == "gzip" or raw.startswith(b"\x1f\x8b"):
                raw = gzip.decompress(raw)
            try:
                decoded = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                try:
                    decoded = raw.decode("cp1252")
                except UnicodeDecodeError:
                    decoded = raw.decode("latin-1")
            payload = json.loads(decoded)
            root = payload if isinstance(payload, dict) else {}
            if first_root is None:
                first_root = root
            page_matches = root.get("match") or root.get("matches") or root.get("fixtures") or []
            if not isinstance(page_matches, list):
                raise ValueError(f"Unexpected BCCI fixture list on page {page}")
            all_matches.extend(match for match in page_matches if isinstance(match, dict))
            report["pagesFetched"] = page
            # Stop early only when BCCI explicitly returns an empty page.
            if not page_matches:
                break

        # De-duplicate overlapping pages by BCCI fixture identifier, preserving order.
        unique_matches = []
        seen = set()
        for match in all_matches:
            key = str(match.get("gid") or match.get("match_gid") or match.get("match_id") or match.get("id") or "")
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            unique_matches.append(match)

        merged = dict(first_root or {})
        list_key = "match"
        if "match" not in merged and "matches" in merged:
            list_key = "matches"
        elif "match" not in merged and "fixtures" in merged:
            list_key = "fixtures"
        merged[list_key] = unique_matches
        report["data"] = merged
        report["status"] = "ok"
        report["matchesFetched"] = len(all_matches)
        report["matchesUnique"] = len(unique_matches)
        report["error"] = None
        report["completedResultsCount"] = save_completed_results(unique_matches)
        report["source"] = BASE_URL + " (pages 1-10, size=12)"
    except HTTPError as exc:
        report["httpStatus"] = exc.code
        report["error"] = f"HTTPError: {exc.code} {exc.reason}"
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"
    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({
        "status": report["status"],
        "httpStatus": report["httpStatus"],
        "pagesFetched": report["pagesFetched"],
        "matchesFetched": report.get("matchesFetched"),
        "matchesUnique": report.get("matchesUnique"),
        "output": OUTPUT_PATH,
        "error": report["error"],
    }, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "ok" else 1

if __name__ == "__main__":
    sys.exit(main())
