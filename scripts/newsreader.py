#!/usr/bin/env python3
"""Collect BCCI article metadata and keep only stories mentioning Tilak Varma."""
from __future__ import annotations

import html
import json
import re
import time
import textwrap
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
IMAGE_KEYS = {
    "image",
    "imageurl",
    "image_url",
    "thumbnail",
    "thumbnailurl",
    "thumbnail_url",
    "banner",
    "coverimage",
    "featuredimage",
    "featuredimageurl",
    "ogimage",
}
DATE_KEYS = {
    "date",
    "publishdate",
    "publisheddate",
    "publishedat",
    "createdat",
    "publishedon",
    "datepublished",
    "datemodified",
    "updatedat",
    "releasedate",
}


class ArticleParser(HTMLParser):
    """Extract readable text and Open Graph/JSON-LD metadata from an article page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.article_parts: list[str] = []
        self.article_candidates: list[list[str]] = []
        self._article_depth = 0
        self.meta: dict[str, str] = {}
        self.jsonld: list[str] = []
        self._capture_title = False
        self._capture_jsonld = False
        self._script_depth = 0
        self._ignored_depth = 0
        self._jsonld_buffer: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs = {str(k).lower(): (v or "") for k, v in attrs}
        if tag in {"style", "svg", "noscript", "template"}:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag == "article":
            if self._article_depth == 0:
                self.article_parts = []
            self._article_depth += 1
        if tag == "meta":
            key = (
                attrs.get("property")
                or attrs.get("name")
                or attrs.get("itemprop")
                or ""
            ).lower()
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
            self._capture_jsonld = (
                attrs.get("type", "").lower() == "application/ld+json"
            )
            self._jsonld_buffer = []
        elif tag in {"p", "div", "br", "li", "h1", "h2", "h3", "article", "section"}:
            self.parts.append("\n")
            if self._article_depth:
                self.article_parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"style", "svg", "noscript", "template"} and self._ignored_depth:
            self._ignored_depth -= 1
            return
        if self._ignored_depth:
            return
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
            if self._article_depth:
                self.article_parts.append("\n")
        if tag == "article" and self._article_depth:
            self._article_depth -= 1
            if self._article_depth == 0 and self.article_parts:
                self.article_candidates.append(self.article_parts[:])
                self.article_parts = []

    def handle_data(self, data):
        if self._ignored_depth:
            return
        if self._capture_jsonld:
            self._jsonld_buffer.append(data)
        elif not self._script_depth:
            value = data.strip()
            if value:
                if self._capture_title:
                    self.meta["html:title"] = value
                self.parts.append(value)
                if self._article_depth:
                    self.article_parts.append(value)


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
                    for nested_key in (
                        "url",
                        "src",
                        "href",
                        "contentUrl",
                        "content_url",
                    ):
                        nested = item.get(nested_key)
                        if isinstance(nested, str) and nested.strip():
                            return nested.strip()
    return None


def collect_articles(document: dict) -> list[dict]:
    """Read direct article records from BCCI API pages; ignore nested image/link objects."""
    articles, seen = [], set()
    for page in document.get("pages", []):
        for record in walk_records(page.get("payload", {})):
            url = record.get("webviewUrl") or record.get("webview_url")
            title = record.get("title") or record.get("headline")
            if (
                not isinstance(url, str)
                or not isinstance(title, str)
                or not title.strip()
            ):
                continue
            if url.startswith("/"):
                url = urljoin("https://www.bcci.tv", url)
            parsed = urlparse(url)
            host = parsed.netloc.lower().split(":")[0]
            if parsed.scheme != "https" or (
                host != "bcci.tv" and not host.endswith(".bcci.tv")
            ):
                continue
            if (
                "/news/article/" not in parsed.path
                and "/webview/news/article/" not in parsed.path
            ):
                continue
            slug = str(record.get("slug") or parsed.path.rstrip("/").split("/")[-1])
            article_url = url.replace("/webview/news/article/", "/news/article/")
            canonical = article_url.split("#", 1)[0]
            if canonical in seen:
                continue
            seen.add(canonical)
            image = first_value(record, IMAGE_KEYS) or ""
            if isinstance(image, str) and image.startswith("/"):
                image = urljoin("https://www.bcci.tv", image)
            if (
                isinstance(image, str)
                and image.startswith("https://")
                and not urlparse(image).netloc.lower().endswith("bcci.tv")
            ):
                image = ""
            published = first_value(record, DATE_KEYS) or ""
            articles.append(
                {
                    "id": re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
                    or canonical,
                    "webviewUrl": canonical,
                    "title": title.strip()[:300],
                    "imageUrl": image[:1500] if image else "",
                    "publishedAt": published,
                    "sourceName": "BCCI",
                    "apiRecord": record,
                }
            )
            if len(articles) >= 250:
                return articles
    return articles


def parse_page(raw: str) -> tuple[str, dict]:
    parser = ArticleParser()
    parser.feed(raw)
    metadata = dict(parser.meta)
    selected_parts = max(parser.article_candidates, key=len, default=[])
    metadata["text"] = html.unescape("\n".join(selected_parts or parser.parts))
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
            return json.dumps(payload, ensure_ascii=False), {
                "jsonld": [payload],
                "canonical": final_url,
            }
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


def normalize_url(value: str) -> str:
    """Normalize a story URL so tracking parameters do not create duplicates."""
    from urllib.parse import parse_qsl, urlencode, urlunparse

    parsed = urlparse((value or "").strip())
    if not parsed.netloc:
        return ""
    host = parsed.netloc.lower()
    path = re.sub(r"/+", "/", parsed.path or "/").rstrip("/") or "/"
    ignored = {
        "fbclid",
        "gclid",
        "ocid",
        "cmpid",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "ved",
        "usg",
    }
    query = urlencode(
        sorted(
            (k, v)
            for k, v in parse_qsl(parsed.query, keep_blank_values=True)
            if k.lower() not in ignored
        )
    )
    return urlunparse((parsed.scheme.lower() or "https", host, path, "", query, ""))


def normalize_title(value: str) -> str:
    value = html.unescape(value or "").lower()
    value = re.sub(r"\bhttps?://\S+", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def merge_unique_news(previous: list[dict], incoming: list[dict]) -> list[dict]:
    """Merge history and new records; URL or exact normalized title duplicates collapse."""
    merged: list[dict] = []
    by_url: dict[str, int] = {}
    by_title: dict[str, int] = {}

    # Oldest first lets newer incoming metadata update an existing story in place.
    for item in [*previous, *incoming]:
        if not isinstance(item, dict):
            continue
        url = normalize_url(str(item.get("webviewUrl") or ""))
        title = normalize_title(str(item.get("title") or ""))
        if not url and not title:
            continue
        url_index = by_url.get(url) if url else None
        title_index = by_title.get(title) if title else None
        existing_index = url_index if url_index is not None else title_index
        clean = dict(item)
        clean.pop("apiRecord", None)
        if existing_index is not None:
            merged[existing_index] = {**merged[existing_index], **clean}
            final_url = normalize_url(
                str(merged[existing_index].get("webviewUrl") or "")
            )
            final_title = normalize_title(
                str(merged[existing_index].get("title") or "")
            )
            if final_url:
                by_url[final_url] = existing_index
            if final_title:
                by_title[final_title] = existing_index
            continue
        index = len(merged)
        merged.append(clean)
        if url:
            by_url[url] = index
        if title:
            by_title[title] = index
    return merged


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing {SOURCE}; run scripts/news.py first")
    document = json.loads(SOURCE.read_text(encoding="utf-8"))
    candidates = collect_articles(document)
    if not candidates:
        raise RuntimeError(
            "No article candidates found; keeping the previous filtered news snapshot"
        )

    previous_news: list[dict] = []
    if OUTPUT.exists():
        try:
            previous_data = json.loads(OUTPUT.read_text(encoding="utf-8"))
            if isinstance(previous_data.get("news"), list):
                previous_news = []
                for item in previous_data["news"]:
                    if not isinstance(item, dict):
                        continue
                    old_url = urlparse(str(item.get("webviewUrl") or ""))
                    if old_url.scheme != "https" or (
                        old_url.netloc.lower().split(":")[0] != "bcci.tv"
                        and not old_url.netloc.lower()
                        .split(":")[0]
                        .endswith(".bcci.tv")
                    ):
                        continue
                    clean = {
                        key: item.get(key)
                        for key in (
                            "id",
                            "webviewUrl",
                            "title",
                            "imageUrl",
                            "publishedAt",
                            "matchedLines",
                            "matchFoundIn",
                            "articleText",
                        )
                        if item.get(key) is not None
                    }
                    # Drop legacy articleText: old snapshots may contain scraped CSS or page chrome.
                    clean["sourceName"] = "BCCI"
                    clean["title"] = str(clean.get("title") or "")[:300]
                    clean["imageUrl"] = str(clean.get("imageUrl") or "")[:1500]
                    previous_news.append(clean)
        except (OSError, json.JSONDecodeError):
            print(
                "WARNING: existing filtered archive could not be read; only fresh matches can be saved"
            )

    matches, errors = [], []
    for index, article in enumerate(candidates, start=1):
        url = article["webviewUrl"]
        try:
            text, metadata = fetch_page(url)
            title = article["title"] or metadata_fallback(
                metadata,
                ("og:title", "twitter:title", "html:title", "headline", "name"),
            )
            image = article["imageUrl"] or metadata_fallback(
                metadata,
                (
                    "og:image",
                    "og:image:url",
                    "twitter:image",
                    "twitter:image:src",
                    "image",
                    "thumbnailUrl",
                    "contentUrl",
                ),
            )
            if image and any(
                host in image.lower()
                for host in ("news.google.com", "google.com", "googleusercontent.com")
            ):
                image = ""
            published = article["publishedAt"] or metadata_fallback(
                metadata,
                (
                    "article:published_time",
                    "datepublished",
                    "datePublished",
                    "publishdate",
                    "publishedat",
                    "date",
                    "dc.date",
                ),
            )
            image = urljoin(url, image) if image and image.startswith("/") else image
            # Keep the BCCI API article URL; generic page canonical tags can collapse unrelated stories.
            canonical = url
            article.update(
                {
                    "sourceName": "BCCI",
                    "id": article.get("id")
                    or re.sub(
                        r"[^a-z0-9]+", "-", urlparse(canonical).path.lower()
                    ).strip("-"),
                    "webviewUrl": canonical,
                    "title": title or "Tilak Varma mentioned in news",
                    "imageUrl": image or "",
                    "publishedAt": published or "",
                }
            )

            # Drop stylesheet/script-like content defensively in case a publisher returns app markup.
            clean_lines = []
            for raw_line in text.splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                if len(line) > 1200:
                    clean_lines.extend(
                        textwrap.wrap(
                            line,
                            width=1000,
                            break_long_words=False,
                            break_on_hyphens=False,
                        )
                    )
                    continue
                lower = line.lower()
                if any(
                    token in lower
                    for token in (
                        "@font-face",
                        "font-family:",
                        "webkit-",
                        "moz-",
                        "text-size-adjust:",
                        "textarea{",
                        "body{height:",
                        "display:none",
                        "sourceMappingURL",
                    )
                ):
                    continue
                if lower.count("{") > 2 or lower.count("}") > 2:
                    continue
                clean_lines.append(line[:500])
            navigation_labels = {
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
            }
            normalized_title = re.sub(
                r"\s+", " ", str(article.get("title") or "").lower()
            ).strip()
            clean_lines = [
                line
                for line in clean_lines
                if re.sub(r"[•·|]", " ", line.lower()).strip() not in navigation_labels
                and re.sub(r"\s+", " ", line.lower()).strip() != normalized_title
                and len(line.strip()) >= 35
            ]
            matched_lines = [line for line in clean_lines if NAME_PATTERN.search(line)]
            title_match = bool(NAME_PATTERN.search(article["title"]))
            record = article.get("apiRecord", {})
            api_text_fields = " ".join(
                str(record.get(key) or "")
                for key in (
                    "description",
                    "summary",
                    "excerpt",
                    "articleBody",
                    "content",
                    "body",
                    "featuredImageAlt",
                    "imageAlt",
                    "seoDescription",
                )
            )
            structured_body = []
            target_url = normalize_url(url)
            target_title = normalize_title(article.get("title", ""))
            for structured in metadata.get("jsonld", []):
                for structured_record in walk_records(structured):
                    record_url = (
                        structured_record.get("url")
                        or structured_record.get("@id")
                        or ""
                    )
                    record_main = structured_record.get("mainEntityOfPage")
                    if isinstance(record_main, dict):
                        record_url = (
                            record_main.get("@id")
                            or record_main.get("url")
                            or record_url
                        )
                    record_title = normalize_title(
                        str(
                            structured_record.get("headline")
                            or structured_record.get("name")
                            or ""
                        )
                    )
                    record_url_norm = normalize_url(str(record_url))
                    if (
                        record_url_norm
                        and record_url_norm != target_url
                        and record_title != target_title
                    ):
                        continue
                    if (
                        record_title
                        and target_title
                        and record_title != target_title
                        and record_url_norm != target_url
                    ):
                        continue
                    for key in ("articleBody", "description", "text"):
                        value = structured_record.get(key)
                        if isinstance(value, str) and value.strip():
                            structured_body.append(value.strip())
            meta_description = " ".join(
                str(metadata.get(key) or "")
                for key in (
                    "description",
                    "og:description",
                    "twitter:description",
                    "article:tag",
                )
            )
            api_match = bool(
                NAME_PATTERN.search(
                    api_text_fields
                    + " "
                    + " ".join(structured_body)
                    + " "
                    + meta_description
                )
            )
            if matched_lines or title_match or api_match:
                article["matchedLines"] = matched_lines[:12]
                # Prefer actual article paragraphs, then BCCI API/JSON-LD descriptions.
                # Never store menu labels or the title itself as article copy.
                content_candidates = (
                    clean_lines
                    + structured_body
                    + [
                        str(record.get(key) or "").strip()
                        for key in (
                            "articleBody",
                            "content",
                            "body",
                            "description",
                            "summary",
                            "excerpt",
                            "seoDescription",
                        )
                    ]
                    + [meta_description]
                )
                normalized_title = normalize_title(article.get("title", ""))
                navigation_labels = {
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
                }
                saved_content = []
                seen_content = set()
                for candidate in content_candidates:
                    if not isinstance(candidate, str):
                        continue
                    candidate = re.sub(r"\s+", " ", html.unescape(candidate)).strip()
                    normalized = normalize_title(candidate)
                    if len(candidate) < 35 or len(candidate) > 4000 or not normalized:
                        continue
                    if (
                        normalized in navigation_labels
                        or normalized == normalized_title
                        or normalized in seen_content
                    ):
                        continue
                    if any(
                        token in candidate.lower()
                        for token in (
                            "@font-face",
                            "font-family:",
                            "sourceMappingURL",
                            "text-size-adjust:",
                        )
                    ):
                        continue
                    seen_content.add(normalized)
                    saved_content.append(candidate[:1000])
                if saved_content:
                    article["articleText"] = saved_content[:30]
                else:
                    article.pop("articleText", None)
                article["matchFoundIn"] = [
                    name
                    for name, found in (
                        ("article", bool(matched_lines)),
                        ("title", title_match),
                        ("apiRecord", api_match),
                    )
                    if found
                ]
                article.pop("apiRecord", None)
                matches.append(article)
                print(
                    f"MATCH: {article['title']} | date={article['publishedAt'] or 'missing'} | source={article['sourceName']}"
                )
            else:
                print(f"No Tilak mention: {article['title'] or url}")
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append({"webviewUrl": url, "error": str(exc)})
            print(f"WARNING: could not read {url}: {exc}")
            # If a BCCI API title explicitly names Tilak, keep it even if BCCI blocks scraping.
            if NAME_PATTERN.search(str(article.get("title", ""))):
                article.pop("apiRecord", None)
                article["matchFoundIn"] = ["title"]
                matches.append(article)
                print(f"MATCH BY TITLE FALLBACK: {article['title']}")
        if index < len(candidates):
            time.sleep(0.2)

    if candidates and len(errors) == len(candidates) and not matches:
        raise RuntimeError(
            f"All {len(candidates)} article pages failed to load; preserving previous filtered snapshot"
        )

    # Preserve all previously saved stories, not only stories that happened to be fetched today.
    # Collapse exact URL/tracking variants and exact normalized-title duplicates across sources.
    merged = merge_unique_news(previous_news, matches)
    merged.sort(key=lambda item: str(item.get("publishedAt", "")), reverse=True)
    merged = merged[:500]
    for item in merged:
        item["title"] = str(item.get("title") or "")[:300]
        item["imageUrl"] = str(item.get("imageUrl") or "")[:1500]
        if isinstance(item.get("articleText"), list):
            navigation_labels = {
                "news",
                "videos",
                "photos",
                "matches",
                "players",
                "more",
                "home",
                "menu",
            }
            cleaned_body = [
                str(line).strip()[:1000]
                for line in item["articleText"]
                if str(line).strip().lower() not in navigation_labels
                and len(str(line).strip()) >= 35
                and normalize_title(str(line))
                != normalize_title(str(item.get("title") or ""))
            ]
            if len(cleaned_body) >= 2 and sum(map(len, cleaned_body)) >= 180:
                item["articleText"] = cleaned_body[:30]
            else:
                item.pop("articleText", None)
        elif isinstance(item.get("articleText"), str):
            item["articleText"] = item["articleText"][:4000]
        item.pop("apiRecord", None)
    result = {
        "player": "Tilak Varma",
        "source": "BCCI News API only",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateCount": len(candidates),
        "matchedCount": len(merged),
        "newMatches": len(matches),
        "sourceErrors": document.get("errors", []),
        "readErrors": errors,
        "news": merged,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Saved {len(merged)} unique Tilak Varma articles ({len(matches)} current matches) to {OUTPUT.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
