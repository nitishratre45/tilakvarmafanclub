#!/usr/bin/env python3
"""Fetch every article URL supplied by BCCI and store full readable page text."""
from __future__ import annotations
import html, json, re, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "News" / "raw-news-pages.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0)",
    "Accept": "text/html,application/xhtml+xml,*/*",
    "Referer": "https://www.bcci.tv/",
}
MAX_ARTICLES = 250


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.meta = {}
        self.title = False
        self.script = 0
        self.skip = 0
        self.jsonld = False
        self.jsonbuf = []
        self.jsonld_data = []

    def handle_starttag(self, tag, attrs):
        a = {str(k).lower(): (v or "") for k, v in attrs}
        if tag in {"style", "svg", "noscript", "template"}:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "script":
            self.script += 1
            self.jsonld = a.get("type", "").lower() == "application/ld+json"
            self.jsonbuf = []
        elif tag == "title":
            self.title = True
        elif tag in {"td", "th"}:
            self.text.append(" | ")
        elif tag == "meta":
            k = (a.get("property") or a.get("name") or a.get("itemprop") or "").lower()
            if k and a.get("content"):
                self.meta[k] = a["content"].strip()
        elif (
            tag == "link" and "canonical" in a.get("rel", "").lower() and a.get("href")
        ):
            self.meta["canonical"] = a["href"]
        elif tag in {
            "p",
            "div",
            "br",
            "li",
            "h1",
            "h2",
            "h3",
            "article",
            "section",
            "main",
        }:
            self.text.append("\n")

    def handle_endtag(self, tag):
        if tag in {"style", "svg", "noscript", "template"} and self.skip:
            self.skip -= 1
            return
        if self.skip:
            return
        if tag == "script":
            if self.jsonld and self.jsonbuf:
                try:
                    self.jsonld_data.append(json.loads("".join(self.jsonbuf)))
                except json.JSONDecodeError:
                    pass
            self.script = max(0, self.script - 1)
            self.jsonld = False
            self.jsonbuf = []
        elif tag == "title":
            self.title = False
        elif tag == "tr":
            self.text.append("\n")
        elif tag in {"p", "div", "li", "h1", "h2", "h3", "article", "section", "main"}:
            self.text.append("\n")

    def handle_data(self, data):
        if self.skip:
            return
        if self.jsonld:
            self.jsonbuf.append(data)
        elif not self.script:
            value = data.strip()
            if value:
                if self.title:
                    self.meta["html:title"] = value
                self.text.append(value)


def walk(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            if isinstance(v, (dict, list)):
                yield from walk(v)
    elif isinstance(value, list):
        for v in value:
            yield from walk(v)


def records(document):
    found = []
    seen = set()
    for page in document.get("pages", []):
        for r in walk(page.get("payload", {})):
            url = (
                r.get("webUrl")
                or r.get("web_url")
                or r.get("webviewUrl")
                or r.get("webview_url")
            )
            title = r.get("title") or r.get("headline")
            if (
                not isinstance(url, str)
                or not isinstance(title, str)
                or not title.strip()
            ):
                continue
            if url.startswith("/"):
                url = urljoin("https://www.bcci.tv", url)
            p = urlparse(url)
            host = p.netloc.lower().split(":")[0]
            if p.scheme != "https" or (
                host != "bcci.tv" and not host.endswith(".bcci.tv")
            ):
                continue
            if not any(
                x in p.path for x in ("/news/article/", "/webview/news/article/")
            ):
                continue
            url = url.split("#", 1)[0]
            if url in seen:
                continue
            seen.add(url)
            image = r.get("featuredImageUrl") or r.get("imageUrl") or ""
            if image.startswith("/"):
                image = urljoin("https://www.bcci.tv", image)
            found.append(
                {
                    "id": str(r.get("slug") or p.path.rstrip("/").split("/")[-1]),
                    "webviewUrl": url,
                    "title": title.strip(),
                    "imageUrl": image,
                    "publishedAt": r.get("publishedDate") or r.get("publishedAt") or "",
                    "sourceName": "BCCI",
                    "apiRecord": r,
                }
            )
            if len(found) >= MAX_ARTICLES:
                return found
    return found


def fetch_article(item):
    url = item["webviewUrl"]
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=25) as response:
        raw = response.read(4_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
        final = response.geturl()
    parser = PageText()
    parser.feed(raw.decode(charset, errors="replace"))
    text = html.unescape("".join(parser.text))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n+ *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    # Exclude page-wide related-story links so unrelated mentions do not qualify.
    cut_markers = ("Related Stories", "More News", "More Match Reports", "Latest News")
    lowered = text.lower()
    cut_at = [
        lowered.find(marker.lower())
        for marker in cut_markers
        if lowered.find(marker.lower()) >= 0
    ]
    if cut_at:
        text = text[: min(cut_at)].strip()
    # Keep the full extracted text (bounded to protect the static JSON deploy).
    text = text[:60000]
    meta = parser.meta
    item.update(
        {
            "finalUrl": final,
            "pageTitle": meta.get("og:title")
            or meta.get("html:title")
            or item["title"],
            "description": meta.get("og:description") or meta.get("description") or "",
            "pageText": text,
            "pageTextLength": len(text),
            "meta": meta,
            "jsonLd": parser.jsonld_data,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    item.pop("apiRecord", None)
    return item


def main():
    if not RAW.exists():
        raise FileNotFoundError(f"Missing {RAW}; run scripts/news.py first")
    doc = json.loads(RAW.read_text(encoding="utf-8"))
    articles = records(doc)
    if not articles:
        raise RuntimeError("No BCCI article URLs found; preserving raw snapshot")
    results = []
    errors = []
    for i, item in enumerate(articles, 1):
        try:
            results.append(fetch_article(item))
            print(
                f"FETCHED {i}/{len(articles)} {item['title']} ({results[-1]['pageTextLength']} chars)",
                flush=True,
            )
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
            item.update(
                {
                    "pageText": "",
                    "pageTextLength": 0,
                    "fetchError": str(exc),
                    "fetchedAt": datetime.now(timezone.utc).isoformat(),
                }
            )
            item.pop("apiRecord", None)
            results.append(item)
            errors.append({"url": item["webviewUrl"], "error": str(exc)})
            print(f"WARNING {item['webviewUrl']}: {exc}", flush=True)
        if i < len(articles):
            time.sleep(0.15)
    doc["articlesFetchedAt"] = datetime.now(timezone.utc).isoformat()
    doc["articleUrlCount"] = len(articles)
    doc["articlePagesFetched"] = sum(bool(a.get("pageText")) for a in results)
    doc["articleFetchErrors"] = errors
    doc["articles"] = results
    RAW.write_text(
        json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        f"Saved full page details for {len(results)} BCCI article URLs to {RAW.relative_to(ROOT)}",
        flush=True,
    )


if __name__ == "__main__":
    main()
