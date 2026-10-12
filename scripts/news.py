#!/usr/bin/env python3
"""Fetch Tilak Varma news from multiple sources, sequentially and fault-tolerantly.

Each source is attempted in order. A source failure is recorded and the next
source still runs. The previous raw snapshot is preserved if every source fails.
"""
from __future__ import annotations

import json
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "News" / "raw-news-pages.json"
BCCI_BASE = "https://www.bcci.tv/api/bff/cms/news"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0)",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.bcci.tv/",
}
BCCI_PAGES = range(1, 8)


def read_url(url: str, accept: str | None = None) -> bytes:
    headers = dict(HEADERS)
    if accept:
        headers["Accept"] = accept
    request = Request(url, headers=headers)
    with urlopen(request, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}")
        return response.read(4_000_000)


def fetch_bcci_page(page: int) -> dict:
    params = {"tags": "international", "page": str(page)}
    url = f"{BCCI_BASE}?{urlencode(params)}"
    payload = json.loads(read_url(url, "application/json, text/plain, */*").decode("utf-8-sig"))
    if not isinstance(payload, (dict, list)):
        raise ValueError(f"Unexpected BCCI API response on page {page}")
    return {"page": page, "sourceName": "BCCI News API", "sourceUrl": url, "payload": payload}


def fetch_bcci_pages(errors: list[dict]) -> list[dict]:
    collected = []
    for page in BCCI_PAGES:
        try:
            collected.append(fetch_bcci_page(page))
            print(f"OK source: BCCI News API page {page}", flush=True)
        except Exception as exc:
            errors.append({"source": "BCCI News API", "page": page, "error": str(exc), "failedAt": datetime.now(timezone.utc).isoformat()})
            print(f"WARNING source: BCCI News API page {page} failed: {exc}; continuing to next page", flush=True)
        time.sleep(0.2)
    return collected


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    errors: list[dict] = []
    pages = fetch_bcci_pages(errors)

    if not pages:
        raise RuntimeError("All configured BCCI News API pages failed; preserving the previous raw news snapshot")

    document = {
        "player": "Tilak Varma",
        "source": "BCCI News API only",
        "sourcesConfigured": 1,
        "sourceOrder": ["BCCI News API"],
        "pagesRequested": len(BCCI_PAGES),
        "pagesFetched": len(pages),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "pages": pages,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(pages)} BCCI API page(s) to {OUT.relative_to(ROOT)}", flush=True)


def walk_records(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            if isinstance(child, (dict, list)):
                yield from walk_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_records(child)


if __name__ == "__main__":
    main()
