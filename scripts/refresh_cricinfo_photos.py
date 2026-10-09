#!/usr/bin/env python3
"""Refresh Tilak Varma photos from ESPNcricinfo's gallery, with its official RSS as fallback."""
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "cricinfo-photos.json"
PHOTOS_URL = "https://www.cricinfo.com/cricketers/tilak-varma-1170265/photos"
RSS_URL = "https://www.cricinfo.com/rss/content/story/feeds/0.xml"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

class GalleryParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
    def handle_starttag(self, tag, attrs):
        if tag.lower() not in ("img", "source"):
            return
        values = dict(attrs)
        src = values.get("src") or values.get("data-src") or values.get("data-lazy-src") or ""
        srcset = values.get("srcset") or values.get("data-srcset") or ""
        candidates = [src]
        for entry in srcset.split(","):
            url = entry.strip().split(" ")[0]
            if url:
                candidates.append(url)
        alt = html.unescape(values.get("alt") or values.get("title") or "").strip()
        for candidate in candidates:
            candidate = html.unescape(candidate).replace("\\/", "/")
            if candidate.startswith("//"):
                candidate = "https:" + candidate
            if candidate.startswith("https://"):
                self.images.append((candidate, alt))

def is_cricinfo_photo(url):
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    trusted_host = any(host.endswith(x) for x in (
        "hscicdn.com", "espncricinfo.com", "espncdn.com", "imgci.com"
    ))
    return trusted_host and (
        "pictures/cms" in path or "/image/upload/" in path or "/photo/" in path
    )

def normalize_url(url):
    url = html.unescape(url or "").replace("&amp;", "&").replace("\\/", "/").strip()
    if url.startswith("//"):
        url = "https:" + url
    return url.split(" ")[0].rstrip("),;")

def from_gallery_page():
    request = urllib.request.Request(PHOTOS_URL, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        page_url = response.geturl()
        page = response.read(5_000_000).decode("utf-8", "replace")
    parser = GalleryParser()
    parser.feed(page)
    embedded = re.findall(
        r'https?:\\?/\\?/(?:img1\.hscicdn\.com|images\.espncricinfo\.com|a\.espncdn\.com|p\.imgci\.com)[^"\\<> ]+',
        page, re.I
    )
    candidates = list(parser.images)
    candidates.extend((value, "Tilak Varma · Match photo") for value in embedded)
    items, seen = [], set()
    for raw_url, alt in candidates:
        url = normalize_url(raw_url)
        if not is_cricinfo_photo(url) or re.search(r"(?:avatar|logo|icon|flag|sprite|placeholder)", url, re.I):
            continue
        key = url.split("?")[0]
        if key in seen:
            continue
        seen.add(key)
        title = re.sub(r"\s+", " ", alt).strip() or "Tilak Varma · Match photo"
        items.append({"title": title[:180], "image": url, "url": PHOTOS_URL, "alt": title[:180]})
        if len(items) >= 18:
            break
    if not items:
        raise ValueError("Cricinfo photos page returned no usable gallery images")
    return items, page_url

def from_official_rss():
    request = urllib.request.Request(RSS_URL, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read(4_000_000)
    root = ET.fromstring(raw)
    ns = {"media": "http://search.yahoo.com/mrss/"}
    items, seen = [], set()
    for node in root.findall(".//item"):
        title = re.sub(r"\s+", " ", html.unescape(node.findtext("title") or "")).strip()
        description = node.findtext("description") or ""
        plain = re.sub(r"<[^>]+>", " ", html.unescape(description))
        plain = re.sub(r"\s+", " ", plain).strip()
        if "tilak" not in (title + " " + plain).lower():
            continue
        article_url = (node.findtext("link") or PHOTOS_URL).strip()
        candidates = []
        for tag in ("content", "thumbnail"):
            candidates.extend(node.findall("media:" + tag, ns))
        candidates.extend(node.findall("enclosure"))
        for media in candidates:
            candidates_url = media.attrib.get("url", "")
            if candidates_url:
                candidates_url = normalize_url(candidates_url)
                if is_cricinfo_photo(candidates_url):
                    candidates_image = candidates_url
                    key = candidates_image.split("?")[0]
                    if key not in seen:
                        seen.add(key)
                        items.append({
                            "title": title[:180] or "Tilak Varma · Match photo",
                            "image": candidates_image,
                            "url": article_url if article_url.startswith("https://") else PHOTOS_URL,
                            "alt": title[:180] or "Tilak Varma · Match photo",
                        })
        # RSS descriptions sometimes include the official image without a media tag.
        for raw_url in re.findall(r'https?://[^\s"\'<>]+', html.unescape(description)):
            image_url = normalize_url(raw_url)
            if is_cricinfo_photo(image_url):
                key = image_url.split("?")[0]
                if key not in seen:
                    seen.add(key)
                    items.append({
                        "title": title[:180] or "Tilak Varma · Match photo",
                        "image": image_url,
                        "url": article_url if article_url.startswith("https://") else PHOTOS_URL,
                        "alt": title[:180] or "Tilak Varma · Match photo",
                    })
        if len(items) >= 18:
            break
    if not items:
        raise ValueError("Official ESPNcricinfo RSS had no Tilak Varma images")
    return items[:18], RSS_URL

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    old = {"items": []}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    checked = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    try:
        try:
            items, page_url = from_gallery_page()
            method = "ESPNcricinfo photo gallery"
        except Exception as gallery_error:
            print(f"Gallery page unavailable ({gallery_error}); trying official ESPNcricinfo RSS.")
            items, page_url = from_official_rss()
            method = "ESPNcricinfo RSS photo stories"
        result = {
            "updatedAt": checked,
            "checkedAt": checked,
            "status": "success",
            "source": "ESPNcricinfo",
            "sourceUrl": PHOTOS_URL,
            "method": method,
            "pageUrl": page_url,
            "items": items,
        }
        print(f"Saved {len(items)} ESPNcricinfo photos via {method}.")
    except Exception as exc:
        print(f"Photo refresh failed; preserving last successful gallery: {exc}")
        result = dict(old)
        result["checkedAt"] = checked
        result["lastAttemptStatus"] = "source-unavailable"
        result["lastAttemptError"] = str(exc)
        result.setdefault("source", "ESPNcricinfo")
        result.setdefault("sourceUrl", PHOTOS_URL)
        result.setdefault("items", [])
        result.setdefault("status", "source-unavailable")
        result.setdefault("updatedAt", "")
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
