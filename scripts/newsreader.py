#!/usr/bin/env python3
"""Build a Tilak-only news cache from BCCI API payloads; never fetch article HTML."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "News" / "raw-news-pages.json"
NAME_RE = re.compile(r"\\btilak\\s+varma\\b", re.I)
URL_KEYS = ("webUrl", "web_url", "webviewUrl", "webview_url", "url", "link")
TITLE_KEYS = ("title", "headline", "name")
TEXT_KEYS = ("description", "summary", "excerpt", "shortDescription", "content")


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            if isinstance(child, (dict, list)):
                yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def clean_url(value):
    if not isinstance(value, str) or not value.strip():
        return ""
    url = urljoin("https://www.bcci.tv", value.strip())
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not (host == "bcci.tv" or host.endswith(".bcci.tv")):
        return ""
    if not any(path in parsed.path for path in ("/news/article/", "/webview/news/article/")):
        return ""
    return url.split("#", 1)[0]


def first_text(item, keys):
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return re.sub(r"\\s+", " ", value).strip()
    return ""


def main():
    if not RAW.exists():
        raise FileNotFoundError(f"Missing {RAW}; run scripts/news.py first")
    doc = json.loads(RAW.read_text(encoding="utf-8"))
    pages = doc.get("pages", []) if isinstance(doc, dict) else []
    if not isinstance(pages, list) or not pages:
        raise RuntimeError("No BCCI API pages found; preserving the previous snapshot")

    previous = doc.get("articles", []) if isinstance(doc.get("articles"), list) else []
    old_by_url = {
        str(item.get("webviewUrl")): item
        for item in previous
        if isinstance(item, dict) and clean_url(item.get("webviewUrl"))
    }
    seen = set()
    kept = []
    removed_unrelated = 0
    for page in pages:
        payload = page.get("payload", {}) if isinstance(page, dict) else {}
        for item in walk(payload):
            url = ""
            for key in URL_KEYS:
                url = clean_url(item.get(key))
                if url:
                    break
            if not url or url in seen:
                continue
            title = first_text(item, TITLE_KEYS)
            description = first_text(item, TEXT_KEYS)
            image = first_text(item, ("featuredImageUrl", "imageUrl", "image", "thumbnailUrl"))
            if image.startswith("/"):
                image = urljoin("https://www.bcci.tv", image)
            published = first_text(item, ("publishedDate", "publishedAt", "datePublished", "createdAt"))
            searchable = " ".join(str(item.get(k) or "") for k in (*TITLE_KEYS, *TEXT_KEYS))
            old = old_by_url.get(url, {})
            old_text = " ".join(str(old.get(k) or "") for k in ("title", "description", "pageTitle", "pageText", "fullText"))
            if not NAME_RE.search(searchable) and not NAME_RE.search(old_text):
                removed_unrelated += 1
                continue
            seen.add(url)
            body = description or str(old.get("pageText") or old.get("fullText") or "")
            record = {
                "id": str(item.get("slug") or item.get("id") or urlparse(url).path.rstrip("/").split("/")[-1]),
                "webviewUrl": url,
                "title": title or str(old.get("title") or "Tilak Varma news"),
                "imageUrl": image or str(old.get("imageUrl") or ""),
                "publishedAt": published or str(old.get("publishedAt") or ""),
                "description": description or str(old.get("description") or ""),
                "pageTitle": title or str(old.get("pageTitle") or ""),
                "pageText": body,
                "pageTextLength": len(body),
                "sourceName": "BCCI",
                "apiOnly": True,
            }
            kept.append(record)

    kept.sort(key=lambda item: str(item.get("publishedAt") or ""), reverse=True)
    doc.update({
        "source": "BCCI News API only",
        "articlesFetchedAt": datetime.now(timezone.utc).isoformat(),
        "articleUrlCount": len(seen),
        "articlePagesFetched": 0,
        "articleFetchErrors": [],
        "articles": kept,
        "apiOnlyFilter": {
            "policy": "BCCI API metadata only; keep Tilak Varma mentions; no article HTML requests",
            "recordsKept": len(kept),
            "unrelatedRecordsRemoved": removed_unrelated,
            "ranAt": datetime.now(timezone.utc).isoformat(),
        },
    })
    RAW.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
    print(f"BCCI API-only cache: kept {len(kept)} Tilak-related records; removed {removed_unrelated} unrelated records; article HTML requests: 0", flush=True)


if __name__ == "__main__":
    main()
