#!/usr/bin/env python3
"""Prune enriched raw article copies not used by News/newsjson.json.

Keep API page payloads intact: the next refresh needs them to rediscover and fetch
article URLs. This only removes enriched raw article records whose URL is already
present in the published snapshot, and never edits/deletes News/newsjson.json.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "News" / "raw-news-pages.json"
NEWS = ROOT / "News" / "newsjson.json"


def main() -> None:
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    news_doc = json.loads(NEWS.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(news_doc, dict):
        raise ValueError("Raw and published news files must contain JSON objects")
    published = news_doc.get("news")
    articles = raw.get("articles")
    if not isinstance(published, list) or not isinstance(articles, list):
        raise ValueError("Expected newsjson.news and raw-news-pages.articles arrays")
    used_urls = {
        str(item.get("webviewUrl") or item.get("finalUrl") or "")
        for item in published
        if isinstance(item, dict)
    }
    used_ids = {
        str(item.get("id") or "")
        for item in published
        if isinstance(item, dict) and item.get("id")
    }
    kept = []
    removed = 0
    for item in articles:
        if not isinstance(item, dict):
            removed += 1
            continue
        url = str(item.get("webviewUrl") or item.get("finalUrl") or "")
        article_id = str(item.get("id") or "")
        if url in used_urls or (article_id and article_id in used_ids):
            # Already represented by the published snapshot; no need to keep a
            # second enriched copy in the raw cache.
            removed += 1
            continue
        kept.append(item)
    raw["articles"] = kept
    raw["rawCleanup"] = {
        "ranAt": datetime.now(timezone.utc).isoformat(),
        "policy": "keep only enriched raw article copies used by newsjson; preserve API payload pages",
        "publishedRecordsChecked": len(published),
        "rawArticleRecordsBefore": len(articles),
        "rawArticleRecordsAfter": len(kept),
        "rawArticleRecordsNotUsedRemoved": removed,
        "apiPagesPreserved": len(raw.get("pages", [])),
        "publishedNewsFileModified": False,
    }
    RAW.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(raw["rawCleanup"], ensure_ascii=False))


if __name__ == "__main__":
    main()
