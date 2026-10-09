#!/usr/bin/env python3
"""Refresh Tilak Varma's photo gallery from the ESPNcricinfo player photos page."""
import html
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "cricinfo-photos.json"
PHOTOS_URL = "https://www.espncricinfo.com/cricketers/tilak-varma-1170265/photos"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
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
        "hscicdn.com", "espncricinfo.com", "espncdn.com"
    ))
    return trusted_host and (
        "pictures/cms" in path or "/image/upload/" in path
    )

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
        request = urllib.request.Request(PHOTOS_URL, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=30) as response:
            page_url = response.geturl()
            page = response.read(5_000_000).decode("utf-8", "replace")
        parser = GalleryParser()
        parser.feed(page)
        # The gallery is a client-rendered page on some deployments; inspect
        # embedded JSON for the same official CDN image URLs as a fallback.
        embedded = re.findall(
            r'https?:\\?/\\?/(?:img1\.hscicdn\.com|images\.espncricinfo\.com|a\.espncdn\.com)[^"\\\\<> ]+',
            page,
            re.I,
        )
        candidates = list(parser.images)
        candidates.extend((value.replace("\\/", "/"), "Tilak Varma") for value in embedded)
        items, seen = [], set()
        for url, alt in candidates:
            url = html.unescape(url).replace("&amp;", "&").replace("\\/", "/")
            url = url.split(" ")[0].rstrip("),;")
            if not is_cricinfo_photo(url):
                continue
            # Avoid avatars, logos, icons and tiny tracker assets.
            if re.search(r"(?:avatar|logo|icon|flag|sprite|placeholder)", url, re.I):
                continue
            key = url.split("?")[0]
            if key in seen:
                continue
            seen.add(key)
            title = re.sub(r"\s+", " ", alt).strip()
            if not title or len(title) < 4:
                title = "Tilak Varma · Match photo"
            items.append({
                "title": title[:180],
                "image": url,
                "url": PHOTOS_URL,
                "alt": title[:180],
            })
            if len(items) >= 18:
                break
        if not items:
            raise ValueError("No official gallery images found on the player photos page")
        result = {
            "updatedAt": checked,
            "checkedAt": checked,
            "status": "success",
            "source": "ESPNcricinfo",
            "sourceUrl": PHOTOS_URL,
            "pageUrl": page_url,
            "items": items,
        }
        print(f"Saved {len(items)} ESPNcricinfo gallery photos.")
    except Exception as exc:
        print(f"Photo refresh failed; preserving last successful gallery: {exc}")
        result = dict(old)
        result["checkedAt"] = checked
        result["lastAttemptStatus"] = "source-unavailable"
        result["lastAttemptError"] = str(exc)
        result.setdefault("source", "ESPNcricinfo")
        result.setdefault("sourceUrl", PHOTOS_URL)
        result.setdefault("items", [])
        if not result["items"]:
            OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
            raise SystemExit("No previous gallery available to preserve")
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")

if __name__ == "__main__":
    main()
