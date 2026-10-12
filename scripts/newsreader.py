#!/usr/bin/env python3
"""Find BCCI news whose webviewUrl content mentions Tilak Varma."""
from __future__ import annotations

import html
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "News" / "newsjson.json"
OUTPUT = ROOT / "News" / "tilak-news.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0)",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Referer": "https://www.bcci.tv/",
}
NAME_PATTERN = re.compile(r"\btilak\s+varma\b", re.IGNORECASE)
URL_KEYS = {"webviewurl", "webview_url", "webview", "url"}
TITLE_KEYS = {"title", "headline", "name", "newsTitle".lower()}
IMAGE_KEYS = {"image", "imageurl", "image_url", "thumbnail", "thumbnailurl", "thumbnail_url", "banner", "coverimage"}
DATE_KEYS = {"date", "publishdate", "publishedat", "createdat", "publishedon"}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "article"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript", "svg"} and self.skip_depth:
            self.skip_depth -= 1
        if tag in {"p", "div", "li", "h1", "h2", "h3", "article"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip_depth:
            value = data.strip()
            if value:
                self.parts.append(value)


def keynorm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def walk_records(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            if isinstance(child, (dict, list)):
                yield from walk_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_records(child)


def first_value(record: dict, wanted: set[str]):
    normalized = {keynorm(str(k)): v for k, v in record.items()}
    for key in wanted:
        value = normalized.get(keynorm(key))
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def collect_articles(document: dict) -> list[dict]:
    articles, seen = [], set()
    for page in document.get("pages", []):
        for record in walk_records(page.get("payload", {})):
            url = first_value(record, URL_KEYS)
            if not url:
                continue
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc:
                continue
            canonical = url.split("#", 1)[0]
            if canonical in seen:
                continue
            seen.add(canonical)
            articles.append({
                "webviewUrl": canonical,
                "title": first_value(record, TITLE_KEYS) or "",
                "imageUrl": first_value(record, IMAGE_KEYS) or "",
                "publishedAt": first_value(record, DATE_KEYS) or "",
                "apiRecord": record,
            })
    return articles


def fetch_text(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=25) as response:
        raw = response.read(3_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
    text = raw.decode(charset, errors="replace")
    if "<" in text and ">" in text:
        parser = TextExtractor()
        parser.feed(text)
        return html.unescape("\n".join(parser.parts))
    # Some webview URLs return JSON rather than HTML.
    try:
        return json.dumps(json.loads(text), ensure_ascii=False)
    except json.JSONDecodeError:
        return text


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing {SOURCE}; run scripts/news.py first")
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    candidates = collect_articles(document)
    matches, errors = [], []
    for index, article in enumerate(candidates, start=1):
        url = article["webviewUrl"]
        try:
            text = fetch_text(url)
            title = article["title"]
            # Search the article text line by line, plus title and API record.
            matched_lines = [line.strip() for line in text.splitlines() if NAME_PATTERN.search(line)]
            title_match = bool(NAME_PATTERN.search(title))
            record_match = bool(NAME_PATTERN.search(json.dumps(article["apiRecord"], ensure_ascii=False)))
            if matched_lines or title_match or record_match:
                article["matchedLines"] = matched_lines[:12]
                article["matchFoundIn"] = [
                    name for name, found in (("article", bool(matched_lines)), ("title", title_match), ("apiRecord", record_match)) if found
                ]
                article.pop("apiRecord", None)
                matches.append(article)
                print(f"MATCH: {title or url}")
            else:
                print(f"No Tilak mention: {title or url}")
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append({"webviewUrl": url, "error": str(exc)})
            print(f"WARNING: could not read {url}: {exc}")
        if index < len(candidates):
            time.sleep(0.2)

    result = {
        "player": "Tilak Varma",
        "source": document.get("source", ""),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateCount": len(candidates),
        "matchedCount": len(matches),
        "readErrors": errors,
        "news": matches,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(matches)} Tilak Varma article(s) to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
