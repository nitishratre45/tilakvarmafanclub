#!/usr/bin/env python3
"""Validate the published Tilak Varma news snapshot before committing it."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "News" / "newsjson.json"


def valid_bcci_url(value: object) -> bool:
    try:
        parsed = urlparse(str(value or "").strip())
        host = (parsed.hostname or "").lower()
        return (
            parsed.scheme == "https"
            and (host == "bcci.tv" or host.endswith(".bcci.tv"))
            and (
                "/news/article/" in parsed.path
                or "/webview/news/article/" in parsed.path
            )
        )
    except ValueError:
        return False


def main() -> int:
    data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    records = data.get("news", []) if isinstance(data, dict) else data
    if not isinstance(records, list):
        raise SystemExit("News snapshot must contain a list of stories")

    ids: set[str] = set()
    urls: set[str] = set()
    for index, item in enumerate(records):
        if not isinstance(item, dict):
            raise SystemExit(f"News record {index} is not an object")
        if not str(item.get("title") or "").strip():
            raise SystemExit(f"News record {index} has no title")

        url = str(item.get("webviewUrl") or item.get("finalUrl") or "").strip()
        if item.get("manual") is not True and not valid_bcci_url(url):
            raise SystemExit(f"News record {index} has an invalid BCCI article URL")

        item_id = str(item.get("id") or "").strip()
        if item_id and item_id in ids:
            raise SystemExit(f"Duplicate news ID: {item_id}")
        if url and url in urls:
            raise SystemExit(f"Duplicate news URL: {url}")
        if item_id:
            ids.add(item_id)
        if url:
            urls.add(url)

    if isinstance(data, dict) and data.get("matchedCount") != len(records):
        raise SystemExit("matchedCount does not match the actual news record count")

    print(
        f"News integrity check passed: {len(records)} records, "
        f"{len(ids)} IDs, {len(urls)} URLs"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
