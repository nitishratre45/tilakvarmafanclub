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
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "News" / "raw-news-pages.json"
BCCI_BASE = "https://www.bcci.tv/api/bff/cms/news"
GOOGLE_RSS = "https://news.google.com/rss/search"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0)",
    "Accept": "application/json, application/rss+xml, text/xml, */*",
    "Referer": "https://www.bcci.tv/",
}
BCCI_PAGES = range(1, 8)
GOOGLE_QUERIES = [
    ("Google News · Tilak Varma", '"Tilak Varma" cricket'),
    ("Google News · ESPNcricinfo", 'site:espncricinfo.com "Tilak Varma"'),
    ("Google News · BCCI", 'site:bcci.tv "Tilak Varma"'),
]


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
    params = {"tags": "international"}
    if page > 1:
        params["page"] = str(page)
    url = f"{BCCI_BASE}?{urlencode(params)}"
    payload = json.loads(read_url(url, "application/json, text/plain, */*").decode("utf-8-sig"))
    if not isinstance(payload, (dict, list)):
        raise ValueError(f"Unexpected BCCI API response on page {page}")
    return {"page": page, "sourceName": "BCCI News API", "sourceUrl": url, "payload": payload}


def fetch_google_rss(label: str, query: str) -> dict:
    params = {"q": query, "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}
    url = f"{GOOGLE_RSS}?{urlencode(params)}"
    raw = read_url(url, "application/rss+xml, text/xml, */*")
    root = ET.fromstring(raw)
    records = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        published = (item.findtext("pubDate") or "").strip()
        source_node = item.find("source")
        publisher = (source_node.text or "").strip() if source_node is not None else label
        if not link:
            continue
        records.append({
            "title": title,
            "webviewUrl": link,
            "publishedAt": published,
            "sourceName": publisher or label,
            "sourceQuery": query,
        })
    return {"page": 1, "sourceName": label, "sourceUrl": url, "payload": {"articles": records}}


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pages, errors = [], []
    sources = [
        ("BCCI News API", lambda: [fetch_bcci_page(page) for page in BCCI_PAGES]),
        *[(label, lambda label=label, query=query: [fetch_google_rss(label, query)])
          for label, query in GOOGLE_QUERIES],
    ]
    for source_name, fetch_source in sources:
        print(f"START source: {source_name}", flush=True)
        try:
            source_pages = fetch_source()
            pages.extend(source_pages)
            item_count = sum(1 for page in source_pages for _ in walk_records(page.get("payload", {})))
            print(f"OK source: {source_name} · {len(source_pages)} response(s) · {item_count} record(s)", flush=True)
        except Exception as exc:
            errors.append({"source": source_name, "error": str(exc), "failedAt": datetime.now(timezone.utc).isoformat()})
            print(f"WARNING source: {source_name} failed: {exc}; continuing to next source", flush=True)
        time.sleep(0.35)

    if not pages:
        raise RuntimeError("All configured news sources failed; preserving the previous raw news snapshot")

    document = {
        "player": "Tilak Varma",
        "sourcesConfigured": 1 + len(GOOGLE_QUERIES),
        "sourceOrder": ["BCCI News API", *[label for label, _ in GOOGLE_QUERIES]],
        "pagesRequested": len(BCCI_PAGES) + len(GOOGLE_QUERIES),
        "pagesFetched": len(pages),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "pages": pages,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(pages)} source response(s) to {OUT.relative_to(ROOT)}", flush=True)


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
