#!/usr/bin/env python3
"""Refresh Tilak Varma news from BCCI and ESPNcricinfo Google News RSS queries.

Publisher links and titles are retained; on source/network failure the last good feed
is preserved. Images are best-effort publisher thumbnails and are not required.
"""
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "tilak-news.json"
FEEDS = [
    (
        "BCCI",
        "https://news.google.com/rss/search?q=site%3Abcci.tv+%22Tilak+Varma%22&hl=en-IN&gl=IN&ceid=IN:en",
    ),
    (
        "ESPNcricinfo",
        "https://news.google.com/rss/search?q=site%3Aespncricinfo.com+%22Tilak+Varma%22&hl=en-IN&gl=IN&ceid=IN:en",
    ),
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFC/1.0; +https://tilakvarmafc.pages.dev/)"
}
NS = {"media": "http://search.yahoo.com/mrss/"}


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.images = []

    def handle_data(self, data):
        value = " ".join(data.split())
        if value:
            self.parts.append(value)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "img":
            src = attrs.get("src") or attrs.get("data-src")
            if src and src.startswith("https://"):
                self.images.append(src)


def clean(value):
    value = html.unescape(value or "")
    return re.sub(r"\s+", " ", value).strip()


def article_image(url):
    """Best-effort publisher Open Graph thumbnail; images are optional."""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=8) as response:
            page = response.read(700_000).decode("utf-8", "replace")
            page_url = response.geturl()
        patterns = [
            r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)""",
            r"""<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']""",
            r"""<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)""",
        ]
        for pattern in patterns:
            match = re.search(pattern, page, re.I)
            if match:
                candidate = urljoin(page_url, html.unescape(match.group(1)))
                if candidate.startswith("https://"):
                    return candidate
    except Exception:
        pass
    return ""


def load_feed(label, feed_url, seen):
    req = urllib.request.Request(feed_url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        root = ET.fromstring(response.read())
    channel = root.find("channel")
    if channel is None:
        raise ValueError(f"{label}: RSS channel missing")
    result = []
    for item in channel.findall("item"):
        title = clean(item.findtext("title"))
        link = clean(item.findtext("link"))
        if not title or not link.startswith("https://"):
            continue
        key = link
        if key in seen:
            continue
        source_node = item.find("source")
        publisher = clean(source_node.text if source_node is not None else "") or label
        description = item.findtext("description") or ""
        parser = TextOnly()
        parser.feed(description)
        summary = clean(" ".join(parser.parts))
        if not re.search(r"\btilak\b|\bvarma\b", title + " " + summary, re.I):
            continue
        image = ""
        media = item.find("media:content", NS)
        if media is None:
            media = item.find("media:thumbnail", NS)
        if media is not None:
            image = media.attrib.get("url", "")
        if not image and parser.images:
            image = parser.images[0]
        if not image.startswith("https://"):
            image = ""
        if not image and len(result) < 3:
            image = article_image(link)
        result.append(
            {
                "title": title,
                "url": link,
                "publisher": publisher,
                "published": clean(item.findtext("pubDate")) or "Recent",
                "summary": summary[:320],
                "image": image,
                "source": label,
            }
        )
        seen.add(key)
    return result


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    old = {"items": []}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    checked = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    items, seen, errors = [], set(), []
    for label, feed_url in FEEDS:
        try:
            feed_items = load_feed(label, feed_url, seen)
            items.extend(feed_items)
            print(f"{label}: loaded {len(feed_items)} stories.")
        except Exception as exc:
            errors.append(f"{label}: {exc}")
            print(f"{label} news refresh failed: {exc}")

    items.sort(key=lambda item: item.get("published", ""), reverse=True)
    items = items[:12]
    if items:
        result = {
            "updatedAt": checked,
            "lastAttemptAt": checked,
            "lastAttemptStatus": "success" if not errors else "partial",
            "status": "available" if not errors else "partial",
            "source": [url for _, url in FEEDS],
            "sources": [label for label, _ in FEEDS],
            "errors": errors,
            "items": items,
        }
        print(f"Published {len(items)} combined BCCI / ESPNcricinfo stories.")
    else:
        print("No new stories were fetched; preserving the previous good feed.")
        result = {
            **old,
            # Keep the timestamp of the last good content; this run only records
            # the failed attempt and must not make stale stories look newly updated.
            "updatedAt": old.get("updatedAt"),
            "lastAttemptAt": checked,
            "lastAttemptStatus": "source-unavailable",
            "status": "source-unavailable",
            "source": [url for _, url in FEEDS],
            "errors": errors or ["No usable BCCI or ESPNcricinfo stories returned."],
        }
        result.setdefault("items", [])
    OUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
