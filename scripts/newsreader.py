#!/usr/bin/env python3
"""Collect BCCI article metadata and keep only stories mentioning Tilak Varma."""
from __future__ import annotations

import html
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "News" / "raw-news-pages.json"
OUTPUT = ROOT / "News" / "newsjson.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0)",
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Referer": "https://www.bcci.tv/",
}
NAME_PATTERN = re.compile(r"\btilak\s+varma\b", re.IGNORECASE)
URL_KEYS = {"webviewurl", "webview_url", "webview", "url", "articleurl", "canonicalurl"}
TITLE_KEYS = {"title", "headline", "name", "newstitle", "metatitle"}
IMAGE_KEYS = {"image", "imageurl", "image_url", "thumbnail", "thumbnailurl", "thumbnail_url", "banner", "coverimage", "featuredimage", "ogimage"}
DATE_KEYS = {"date", "publishdate", "publishedat", "createdat", "publishedon", "datepublished", "datemodified", "updatedat", "releasedate"}


class ArticleParser(HTMLParser):
    """Extract readable text and Open Graph/JSON-LD metadata from an article page."""
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.meta: dict[str, str] = {}
        self.jsonld: list[str] = []
        self._capture_title = False
        self._capture_jsonld = False
        self._script_depth = 0
        self._jsonld_buffer: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = {str(k).lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (attrs.get("property") or attrs.get("name") or attrs.get("itemprop") or "").lower()
            value = attrs.get("content", "").strip()
            if key and value:
                self.meta[key] = value
        elif tag == "link" and "canonical" in attrs.get("rel", "").lower():
            if attrs.get("href"):
                self.meta["canonical"] = attrs["href"]
        elif tag == "title":
            self._capture_title = True
        elif tag == "script":
            self._script_depth += 1
            self._capture_jsonld = attrs.get("type", "").lower() == "application/ld+json"
            self._jsonld_buffer = []
        elif tag in {"p", "div", "br", "li", "h1", "h2", "h3", "article", "section"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._capture_title = False
        elif tag == "script":
            if self._capture_jsonld and self._jsonld_buffer:
                self.jsonld.append("".join(self._jsonld_buffer))
            self._script_depth = max(0, self._script_depth - 1)
            self._capture_jsonld = False
            self._jsonld_buffer = []
        elif tag in {"p", "div", "li", "h1", "h2", "h3", "article", "section"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._capture_jsonld:
            self._jsonld_buffer.append(data)
        elif not self._script_depth:
            value = data.strip()
            if value:
                if self._capture_title:
                    self.meta["html:title"] = value
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
        if isinstance(value, dict):
            for nested_key in ("url", "src", "href", "contentUrl", "content_url"):
                nested = value.get(nested_key)
                if isinstance(nested, str) and nested.strip():
                    return nested.strip()
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, dict):
                    for nested_key in ("url", "src", "href", "contentUrl", "content_url"):
                        nested = item.get(nested_key)
                        if isinstance(nested, str) and nested.strip():
                            return nested.strip()
    return None


def collect_articles(document: dict) -> list[dict]:
    articles, seen = [], set()
    for page in document.get("pages", []):
        page_source = page.get("sourceName") or "BCCI News API"
        for record in walk_records(page.get("payload", {})):
            url = first_value(record, URL_KEYS)
            if not url:
                continue
            if url.startswith("/"):
                url = urljoin("https://www.bcci.tv", url)
            parsed = urlparse(url)
            if parsed.scheme != "https" or not parsed.netloc:
                continue
            canonical = url.split("#", 1)[0]
            if canonical in seen:
                continue
            seen.add(canonical)
            image = first_value(record, IMAGE_KEYS) or ""
            if isinstance(image, str) and image.startswith("/"):
                image = urljoin("https://www.bcci.tv", image)
            articles.append({
                "id": re.sub(r"[^a-z0-9]+", "-", parsed.path.lower()).strip("-") or canonical,
                "webviewUrl": canonical,
                "title": first_value(record, TITLE_KEYS) or "",
                "imageUrl": image,
                "publishedAt": first_value(record, DATE_KEYS) or "",
                "sourceName": first_value(record, {"sourcename", "source"}) or page_source,
                "apiRecord": record,
            })
    return articles


def parse_page(raw: str) -> tuple[str, dict]:
    parser = ArticleParser()
    parser.feed(raw)
    metadata = dict(parser.meta)
    metadata["text"] = html.unescape("\n".join(parser.parts))
    structured = []
    for blob in parser.jsonld:
        try:
            structured.append(json.loads(blob))
        except json.JSONDecodeError:
            continue
    metadata["jsonld"] = structured
    return metadata["text"], metadata


def fetch_page(url: str) -> tuple[str, dict]:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=25) as response:
        raw = response.read(3_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
        final_url = response.geturl()
    body = raw.decode(charset, errors="replace")
    if "<" not in body or ">" not in body:
        try:
            payload = json.loads(body)
            return json.dumps(payload, ensure_ascii=False), {"jsonld": [payload], "canonical": final_url}
        except json.JSONDecodeError:
            return body, {"canonical": final_url}
    text, metadata = parse_page(body)
    metadata.setdefault("canonical", final_url)
    return text, metadata


def metadata_fallback(metadata: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for structured in metadata.get("jsonld", []):
        for record in walk_records(structured):
            for key in keys:
                value = record.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
                if isinstance(value, dict):
                    nested = value.get("url") or value.get("contentUrl")
                    if isinstance(nested, str) and nested.strip():
                        return nested.strip()
    return ""


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing {SOURCE}; run scripts/news.py first")
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    candidates = collect_articles(document)
    if not candidates:
        raise RuntimeError("No article candidates found; keeping the previous filtered news snapshot")

    previous_news = []
    if OUTPUT.exists():
        try:
            previous_data = json.loads(OUTPUT.read_text(encoding="utf-8"))
            if isinstance(previous_data.get("news"), list):
                previous_news = previous_data["news"]
        except (OSError, json.JSONDecodeError):
            pass

    matches, errors = [], []
    for index, article in enumerate(candidates, start=1):
        url = article["webviewUrl"]
        try:
            text, metadata = fetch_page(url)
            title = article["title"] or metadata_fallback(metadata, ("og:title", "twitter:title", "html:title", "headline", "name"))
            image = article["imageUrl"] or metadata_fallback(metadata, ("og:image", "og:image:url", "twitter:image", "twitter:image:src", "image", "thumbnailUrl", "contentUrl"))
            published = article["publishedAt"] or metadata_fallback(metadata, ("article:published_time", "datepublished", "datePublished", "publishdate", "publishedat", "date", "dc.date"))
            image = urljoin(url, image) if image and image.startswith("/") else image
            canonical = metadata.get("canonical") or url
            if canonical.startswith("/"):
                canonical = urljoin(url, canonical)
            article.update({
                "sourceName": article.get("sourceName") or "BCCI News API",
                "id": article.get("id") or re.sub(r"[^a-z0-9]+", "-", urlparse(canonical).path.lower()).strip("-"),
                "webviewUrl": canonical,
                "title": title or "Tilak Varma mentioned in BCCI news",
                "imageUrl": image or "",
                "publishedAt": published or "",
            })

            matched_lines = [line.strip() for line in text.splitlines() if NAME_PATTERN.search(line)]
            title_match = bool(NAME_PATTERN.search(article["title"]))
            record_match = bool(NAME_PATTERN.search(json.dumps(article["apiRecord"], ensure_ascii=False)))
            if matched_lines or title_match or record_match:
                article["matchedLines"] = matched_lines[:12]
                article["articleText"] = [line.strip() for line in text.splitlines() if line.strip()][:220]
                article["matchFoundIn"] = [
                    name for name, found in (("article", bool(matched_lines)), ("title", title_match), ("apiRecord", record_match))
                    if found
                ]
                article.pop("apiRecord", None)
                matches.append(article)
                print(f"MATCH: {article['title']} | date={article['publishedAt'] or 'missing'} | image={'yes' if article['imageUrl'] else 'missing'}")
            else:
                print(f"No Tilak mention: {article['title'] or url}")
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append({"webviewUrl": url, "error": str(exc)})
            print(f"WARNING: could not read {url}: {exc}")
        if index < len(candidates):
            time.sleep(0.2)

    if candidates and len(errors) == len(candidates) and not matches:
        raise RuntimeError(f"All {len(candidates)} article pages failed to load; preserving previous filtered snapshot")

    failed_urls = {entry.get("webviewUrl") for entry in errors}
    current_urls = {entry.get("webviewUrl") for entry in matches}
    preserved = [
        item for item in previous_news
        if item.get("webviewUrl") in failed_urls and item.get("webviewUrl") not in current_urls
    ]
    matches.extend(preserved)
    matches.sort(key=lambda item: item.get("publishedAt", ""), reverse=True)

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
