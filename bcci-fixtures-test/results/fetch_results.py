#!/usr/bin/env python3
"""Fetch completed BCCI match results into the isolated bcci-fixtures-test/results folder."""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "https://stats.bcci.tv/match/results/"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "results.json")
TIMEOUT_SECONDS = 35
PAGE_SIZE = 100
MIN_START_DATE = "2026-01-01"
COMP_GIDS = ["65d2b784-4a75-41ca-8415-a345042030d6","11ba38c8-30d4-438c-8214-0d5ffdc0d9ca","8e82842f-2c4d-4bd5-8712-5c342fa0ac52","23a35541-7b2d-4caf-a215-9cf07da68259","be3673dc-4020-4db0-81f3-2833432f9de3","34154bc1-ebbf-4109-ba78-67cf9cf7aafa","47f70a25-00df-4792-9650-3e2c3642a27b","6a64053e-55fc-47ed-9cae-4c58e9b0e551","9a12946b-9277-4b5f-ba94-34d02355bf03","2fb13b04-0824-4466-9dca-a8558081ca9c","2c9a58d0-365c-4301-839e-b1d2a0803b2b","b0267a1c-8b9b-4e75-b98f-65d37d080565","dafec7a6-ae05-48a1-abf0-3e946f60a856","04d7f468-3b06-4dcc-88de-594afd83c561","d2f2e609-1d15-4630-ba86-c004c4b6ded7","52f44249-0afd-41aa-bb88-c6e7778a4f0d","97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2","5cd3ede8-16d7-4914-9d4c-2eb59671fe50","db99461c-27d2-46ef-8f47-a0eb1d3e1d26","39a2078a-2e87-4f90-86eb-53696579466c","7ca2538b-b8e8-4221-b76f-4705cb75af1f","a88f96d1-b5ab-4327-82bf-6c89e4ae7b1b","aa9d383e-5b90-41d1-80e2-2a75c8e4359d","d5ad0d62-3c4e-44e3-bd52-80721d1edeac","12616d71-d30e-4c6c-b669-8850c160ad8d","ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc","15a5482f-d85a-4cf8-b1bf-aae83716cf2b","b4d4040d-4631-4f31-b224-e9aa54b40797","ad9bff8b-d68e-4c5e-a92d-72b6705134b2","13de0d47-83d7-4351-8e6a-57d28a18be48","1cf7ed18-0c14-452c-840b-447aeb5dd020","96f00b0b-c06b-4764-bbc3-7ed388abb24b","dd82f86a-6aa4-477c-b0de-2706a677d0d2"];
TEAM_GIDS = ["71790c66-0e3c-4d0b-96a5-e04526040f94","cf9ec6b2-8d90-41a9-a834-f2f120b37811","83151b98-bbed-42ba-b397-944059ef5830","0f99bbe0-3198-4f82-8520-e18a9e24545f","f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8","4eb0e97b-6e43-47f3-8e46-bedf6de77cea","611a0e16-280f-4fe2-98e8-366ba9719962","01d41b53-68f6-48f8-a8d0-c9ec2f338749","eb81d735-6436-4dac-9a7a-15a7a347d5e6","08dc4ba8-22a1-4e5a-9862-20f8a8643f99"];

def find_matches(payload):
    if isinstance(payload, list):
        if all(isinstance(item, dict) for item in payload):
            return payload
        return []
    if not isinstance(payload, dict):
        return []
    for key in ("match", "matches", "results", "data", "items", "result"):
        value = payload.get(key)
        if isinstance(value, list) and (not value or isinstance(value[0], dict)):
            return value
        if isinstance(value, dict):
            found = find_matches(value)
            if found:
                return found
    return []

def get_pages(payload):
    if not isinstance(payload, dict):
        return 1
    for obj in (payload, payload.get("pagination"), payload.get("meta"), payload.get("pageInfo")):
        if isinstance(obj, dict):
            for key in ("total_pages", "totalPages", "last_page", "lastPage", "pages"):
                try:
                    if obj.get(key) is not None:
                        return max(1, min(int(obj[key]), 100))
                except (TypeError, ValueError):
                    pass
            total = obj.get("total") or obj.get("total_count") or obj.get("totalCount")
            size = obj.get("size") or obj.get("per_page") or obj.get("perPage") or PAGE_SIZE
            try:
                if total is not None:
                    return max(1, min((int(total) + int(size) - 1) // int(size), 100))
            except (TypeError, ValueError, ZeroDivisionError):
                pass
    return 1

def request_page(page):
    # The BCCI results endpoint supports competition and pagination parameters.
    # Avoid team/date filters here: they can silently return an empty response for
    # otherwise valid completed-result records.
    params = [*((("comp_gid", value) for value in COMP_GIDS),
              ("page", str(page)), ("size", str(PAGE_SIZE))]
    url = BASE_URL + "?" + urlencode(params)
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub-BCCI-Results/1.0)",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.bcci.tv/",
    })
    with urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    return json.loads(raw.decode(charset, errors="replace")), url

def match_key(match):
    return str(match.get("gid") or match.get("match_gid") or match.get("match_id") or match.get("id") or "")

def date_key(match):
    return str(match.get("start_datetime_utc") or match.get("start_date") or match.get("match_date") or match.get("date_string") or "")

def main():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    previous = {"updatedAt": None, "source": BASE_URL, "count": 0, "matches": []}
    try:
        with open(OUTPUT_PATH, encoding="utf-8") as handle:
            previous = json.load(handle)
        if not isinstance(previous, dict):
            previous = {"matches": []}
    except (OSError, ValueError):
        pass

    try:
        first, source_url = request_page(1)
        combined = find_matches(first)
        pages = get_pages(first)
        for page in range(2, pages + 1):
            payload, _ = request_page(page)
            page_matches = find_matches(payload)
            if not page_matches:
                break
            combined.extend(page_matches)
            time.sleep(0.15)

        by_id = {}
        # Keep older saved results if a later BCCI response omits historical entries.
        for item in previous.get("matches", []):
            if isinstance(item, dict) and match_key(item):
                by_id[match_key(item)] = item
        for item in combined:
            if isinstance(item, dict):
                key = match_key(item)
                if key:
                    by_id[key] = item
        ordered = sorted(by_id.values(), key=date_key, reverse=True)
        payload = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "source": BASE_URL,
            "sourceUrl": source_url,
            "minStartDate": MIN_START_DATE,
            "count": len(ordered),
            "pagesFetched": pages,
            "matches": ordered,
            "status": "ok",
        }
        temp = OUTPUT_PATH + ".tmp"
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp, OUTPUT_PATH)
        print(json.dumps({"status":"ok","pagesFetched":pages,"newPageMatches":len(combined),"savedMatches":len(ordered),"output":OUTPUT_PATH},indent=2))
        return 0
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"BCCI results refresh failed; existing archive preserved: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
