#!/usr/bin/env python3
"""Repair recoverable news JSON issues and enforce strict Tilak/BCCI filtering."""
from __future__ import annotations
import html, json, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "News" / "raw-news-pages.json"
OUT = ROOT / "News" / "newsjson.json"
NAME = re.compile(r"\\btilak\\s+varma\\b", re.I)
NAV = {
    "news",
    "videos",
    "photos",
    "matches",
    "players",
    "more",
    "home",
    "search",
    "menu",
    "sign in",
    "login",
    "related stories",
}


def valid_bcci_url(value):
    try:
        p = urlparse(str(value or ""))
        return (
            p.scheme == "https"
            and (
                p.hostname == "bcci.tv"
                or bool(p.hostname and p.hostname.endswith(".bcci.tv"))
            )
            and "/news/article/" in p.path
            or p.scheme == "https"
            and p.hostname == "www.bcci.tv"
            and "/webview/news/article/" in p.path
        )
    except Exception:
        return False


def clean_text(value):
    value = html.unescape(str(value or ""))
    value = re.sub(r"\\s+", " ", value).strip()
    return value


def main():
    if not RAW.exists():
        raise RuntimeError("raw-news-pages.json missing")
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    articles = raw.get("articles", [])
    if not isinstance(articles, list):
        raise ValueError("raw articles must be an array")
    cleaned_raw = []
    raw_removed = 0
    for item in articles:
        if not isinstance(item, dict) or not valid_bcci_url(item.get("webviewUrl")):
            raw_removed += 1
            continue
        item["title"] = clean_text(item.get("title"))[:300]
        item["pageText"] = clean_text(item.get("pageText"))[:60000]
        item["pageTextLength"] = len(item["pageText"])
        item.pop("apiRecord", None)
        cleaned_raw.append(item)
    raw["articles"] = cleaned_raw
    raw["jsonFixer"] = {
        "ranAt": datetime.now(timezone.utc).isoformat(),
        "invalidRawRecordsRemoved": raw_removed,
        "recordsChecked": len(articles),
    }
    RAW.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8"
    )
    existing = {}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = {}
    news = []
    seen = set()
    removed = {}
    for item in (
        existing.get("news", []) if isinstance(existing.get("news"), list) else []
    ):
        if not isinstance(item, dict):
            removed["not_object"] = removed.get("not_object", 0) + 1
            continue
        url = str(item.get("webviewUrl") or "")
        if not valid_bcci_url(url):
            removed["invalid_url"] = removed.get("invalid_url", 0) + 1
            continue
        title = clean_text(item.get("title"))
        text = clean_text(item.get("fullText") or item.get("pageText"))
        if not NAME.search(
            " ".join(
                (
                    title,
                    text,
                    clean_text(item.get("description")),
                    clean_text(item.get("pageTitle")),
                )
            )
        ):
            removed["no_tilak_mention"] = removed.get("no_tilak_mention", 0) + 1
            continue
        if not text:
            removed["missing_full_text"] = removed.get("missing_full_text", 0) + 1
            continue
        if url in seen:
            removed["duplicate_url"] = removed.get("duplicate_url", 0) + 1
            continue
        seen.add(url)
        item["title"] = title[:300]
        item["fullText"] = text[:60000]
        item["pageText"] = text[:60000]
        chunks = [clean_text(x) for x in re.split(r"(?<=[.!?])\\s+|\\n+", text)]
        item["articleText"] = [
            x for x in chunks if len(x) >= 25 and x.lower() not in NAV
        ][:500]
        item["matchedLines"] = [x[:1200] for x in chunks if NAME.search(x)][:50]
        item["matchFoundIn"] = [
            k
            for k, v in (
                ("title", title),
                ("pageText", text),
                ("description", clean_text(item.get("description"))),
                ("pageTitle", clean_text(item.get("pageTitle"))),
            )
            if NAME.search(v)
        ]
        item["sourceName"] = "BCCI"
        news.append(item)
    news.sort(key=lambda x: str(x.get("publishedAt") or ""), reverse=True)
    result = {
        "player": "Tilak Varma",
        "source": "BCCI News API only",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateCount": len(articles),
        "matchedCount": len(news),
        "newMatches": len(news),
        "sourceErrors": raw.get("errors", []),
        "readErrors": raw.get("articleFetchErrors", []),
        "cleanup": {
            "ranAt": datetime.now(timezone.utc).isoformat(),
            "recordsRemoved": removed,
        },
        "news": news,
    }
    OUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "rawRecords": len(cleaned_raw),
                "rawInvalidRemoved": raw_removed,
                "newsRecords": len(news),
                "removed": removed,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
