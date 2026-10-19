#!/usr/bin/env python3
"""Keep only Tilak Varma-related article records in the raw news cache.

The published News/newsjson.json archive is read-only for this cleanup step.
BCCI API pages are fetched afresh by scripts/news.py on every refresh, so the
committed raw cache can safely omit unrelated article records.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "News" / "raw-news-pages.json"
NEWS = ROOT / "News" / "newsjson.json"
PLAYER_RE = re.compile(r"\btilak\s+varma\b", re.IGNORECASE)
URL_KEYS = ("webUrl", "web_url", "webviewUrl", "webview_url", "finalUrl", "url")


def article_url(item: dict) -> str:
    for key in URL_KEYS:
        value = item.get(key)
        if isinstance(value, str) and value:
            if value.startswith("/"):
                value = urljoin("https://www.bcci.tv", value)
            parsed = urlparse(value)
            if (
                parsed.hostname
                and (
                    parsed.hostname == "bcci.tv" or parsed.hostname.endswith(".bcci.tv")
                )
                and (
                    "/news/article/" in parsed.path
                    or "/webview/news/article/" in parsed.path
                )
            ):
                return value.split("#", 1)[0]
    return ""


def relevant_article(item: dict) -> bool:
    text = " ".join(
        str(item.get(key) or "")
        for key in (
            "title",
            "headline",
            "pageTitle",
            "description",
            "pageText",
            "fullText",
        )
    )
    return bool(PLAYER_RE.search(text))


def prune_api_value(value, relevant_urls: set[str]) -> tuple[object, int]:
    """Drop unrelated BCCI article records recursively while preserving API metadata."""
    removed = 0
    if isinstance(value, list):
        kept = []
        for child in value:
            cleaned, count = prune_api_value(child, relevant_urls)
            removed += count
            if cleaned is not None:
                kept.append(cleaned)
        return kept, removed
    if isinstance(value, dict):
        url = article_url(value)
        title = value.get("title") or value.get("headline")
        if (
            url
            and title
            and url not in relevant_urls
            and not PLAYER_RE.search(str(title))
        ):
            return None, 1
        cleaned = {}
        for key, child in value.items():
            if isinstance(child, (dict, list)):
                new_child, count = prune_api_value(child, relevant_urls)
                removed += count
                if new_child is not None:
                    cleaned[key] = new_child
            else:
                cleaned[key] = child
        return cleaned, removed
    return value, 0


def main() -> None:
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    news_doc = json.loads(NEWS.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not isinstance(news_doc, dict):
        raise ValueError("Raw and published news files must contain JSON objects")
    published = news_doc.get("news")
    articles = raw.get("articles")
    pages = raw.get("pages", [])
    if not isinstance(published, list) or not isinstance(articles, list):
        raise ValueError("Expected newsjson.news and raw-news-pages.articles arrays")
    if not isinstance(pages, list):
        raise ValueError("Expected raw-news-pages.pages array")

    before = len(articles)
    kept = [
        item for item in articles if isinstance(item, dict) and relevant_article(item)
    ]
    removed_articles = before - len(kept)
    relevant_urls = {url for item in kept if (url := article_url(item))}
    # API pages are refreshed before this cleanup runs; prune their embedded
    # article records too, so the committed raw JSON contains no unrelated stories.
    cleaned_pages, removed_page_records = prune_api_value(pages, relevant_urls)
    raw["articles"] = kept
    raw["pages"] = cleaned_pages if isinstance(cleaned_pages, list) else []
    raw["rawCleanup"] = {
        "ranAt": datetime.now(timezone.utc).isoformat(),
        "policy": "keep only Tilak Varma-related BCCI article records; preserve News/newsjson.json",
        "publishedRecordsChecked": len(published),
        "rawArticleRecordsBefore": before,
        "rawArticleRecordsAfter": len(kept),
        "unrelatedRawArticlesRemoved": removed_articles,
        "unrelatedApiPageRecordsRemoved": removed_page_records,
        "apiPagesKept": len(raw["pages"]),
        "publishedNewsFileModified": False,
    }
    RAW.write_text(
        json.dumps(raw, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(json.dumps(raw["rawCleanup"], ensure_ascii=False))


if __name__ == "__main__":
    main()
