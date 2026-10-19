#!/usr/bin/env python3
"""Fetch BCCI News API pages sequentially for the Tilak Varma news pipeline.

Each BCCI API page is attempted in order. Failures are recorded while later
pages continue; the previous raw snapshot is preserved if every page fails.
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
BCCI_TAGS = ("international", "domestic")


def read_url(url: str, accept: str | None = None) -> bytes:
    headers = dict(HEADERS)
    if accept:
        headers["Accept"] = accept
    request = Request(url, headers=headers)
    with urlopen(request, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}")
        return response.read(4_000_000)


def fetch_bcci_page(page: int, tag: str) -> dict:
    params = {"page": str(page), "tags": tag}
    url = f"{BCCI_BASE}?{urlencode(params)}"
    payload = json.loads(
        read_url(url, "application/json, text/plain, */*").decode("utf-8-sig")
    )
    if not isinstance(payload, (dict, list)):
        raise ValueError(f"Unexpected BCCI API response on page {page}")
    return {
        "page": page,
        "tag": tag,
        "sourceName": "BCCI News API",
        "sourceUrl": url,
        "payload": payload,
    }


def fetch_bcci_pages(errors: list[dict]) -> list[dict]:
    collected = []
    for tag in BCCI_TAGS:
        for page in BCCI_PAGES:
            try:
                collected.append(fetch_bcci_page(page, tag))
                print(f"OK source: BCCI News API tag={tag} page {page}", flush=True)
            except Exception as exc:
                errors.append(
                    {
                        "source": "BCCI News API",
                        "page": page,
                        "tag": tag,
                        "error": str(exc),
                        "failedAt": datetime.now(timezone.utc).isoformat(),
                    }
                )
                print(
                    f"WARNING source: BCCI News API tag={tag} page {page} failed: {exc}; continuing to next page",
                    flush=True,
                )
            time.sleep(0.2)
    return collected


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    errors: list[dict] = []
    pages = fetch_bcci_pages(errors)

    if not pages:
        raise RuntimeError(
            "All configured BCCI News API pages failed; preserving the previous raw news snapshot"
        )

    # A partial response must never replace a complete last-known-good snapshot.
    # This avoids silently losing discoverable stories during a BCCI API outage.
    expected_pages = len(BCCI_PAGES) * len(BCCI_TAGS)
    if len(pages) < expected_pages and OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}
        if (
            isinstance(previous, dict)
            and isinstance(previous.get("pages"), list)
            and previous.get("pages")
        ):
            partial_path = OUT.with_name("raw-news-pages.partial.json")
            document = {
                **previous,
                "latestAttemptAt": datetime.now(timezone.utc).isoformat(),
                "latestAttemptPagesFetched": len(pages),
                "latestAttemptPagesRequested": expected_pages,
                "latestAttemptErrors": errors,
                "lastKnownGoodSnapshotPreserved": True,
            }
            partial_path.write_text(
                json.dumps(
                    {
                        "player": "Tilak Varma",
                        "source": "BCCI News API only",
                        "pagesFetched": len(pages),
                        "pagesRequested": expected_pages,
                        "fetchedAt": datetime.now(timezone.utc).isoformat(),
                        "errors": errors,
                        "pages": pages,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n",
                encoding="utf-8",
            )
            OUT.write_text(
                json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
            raise RuntimeError(
                f"Partial BCCI refresh ({len(pages)}/{expected_pages}); kept previous snapshot and saved diagnostics"
            )

    document = {
        "player": "Tilak Varma",
        "source": "BCCI News API only",
        "sourcesConfigured": 2,
        "sourceOrder": ["BCCI International API", "BCCI Domestic API"],
        "tagsRequested": list(BCCI_TAGS),
        "pagesPerTag": len(BCCI_PAGES),
        "pagesRequested": len(BCCI_PAGES) * len(BCCI_TAGS),
        "pagesFetched": len(pages),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "pages": pages,
    }
    OUT.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
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
