#!/usr/bin/env python3
"""Collect BCCI international news pages 1–7 into News/newsjson.json.

This stage stores the API records only. scripts/newsreader.py filters those
records to articles whose webview content mentions Tilak Varma.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "News" / "newsjson.json"
BASE_URL = "https://www.bcci.tv/api/bff/cms/news"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0)",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.bcci.tv/",
}
PAGES = range(1, 8)


def fetch_page(page: int) -> dict:
    params = {"tags": "international"}
    if page > 1:
        params["page"] = page
    url = f"{BASE_URL}?{urlencode(params)}"
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise RuntimeError(f"Page {page}: HTTP {response.status}")
        payload = json.loads(response.read().decode("utf-8-sig"))
    if not isinstance(payload, (dict, list)):
        raise ValueError(f"Page {page}: unexpected API response type")
    return {"page": page, "sourceUrl": url, "payload": payload}


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pages, errors = [], []
    for page in PAGES:
        try:
            pages.append(fetch_page(page))
            print(f"Fetched BCCI news page {page}")
        except Exception as exc:
            errors.append({"page": page, "error": str(exc)})
            print(f"WARNING: page {page} failed: {exc}")
        if page != 7:
            time.sleep(0.35)

    # Preserve the previous good snapshot if every request fails.
    if not pages:
        raise RuntimeError("All BCCI news pages failed; keeping existing JSON unchanged")

    document = {
        "source": BASE_URL,
        "tag": "international",
        "pagesRequested": 7,
        "pagesFetched": len(pages),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "pages": pages,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(pages)} page(s) to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
