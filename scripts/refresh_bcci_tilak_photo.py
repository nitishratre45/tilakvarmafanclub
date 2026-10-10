#!/usr/bin/env python3
"""Fetch Tilak Varma's official BCCI profile image from the live BCCI page/API payloads."""
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bcci-tilak-photo.json"
PROFILE_URL = "https://www.bcci.tv/international/men/players/tilak-varma/993"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def safe_url(value):
    if not isinstance(value, str):
        return ""
    value = value.strip().replace("\\/", "/").replace("&amp;", "&")
    if value.startswith("//"):
        value = "https:" + value
    return value if value.startswith("https://") else ""


def walk(value, found):
    if isinstance(value, dict):
        name = " ".join(
            str(value.get(k, "")) for k in ("name", "title", "fullName", "playerName")
        ).lower()
        if "tilak" in name and "varma" in name:
            for key, item in value.items():
                if any(
                    token in key.lower()
                    for token in (
                        "image",
                        "photo",
                        "headshot",
                        "portrait",
                        "profilepic",
                        "playerpic",
                    )
                ):
                    if isinstance(item, str):
                        url = safe_url(item)
                        if url:
                            found.append((url, key))
                    elif isinstance(item, dict):
                        for subkey, subvalue in item.items():
                            if isinstance(subvalue, str) and any(
                                t in subkey.lower() for t in ("url", "src", "image")
                            ):
                                url = safe_url(subvalue)
                                if url:
                                    found.append((url, subkey))
        for child in value.values():
            walk(child, found)
    elif isinstance(value, list):
        for child in value:
            walk(child, found)


class ImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img":
            return
        a = dict(attrs)
        alt = (a.get("alt") or a.get("title") or "").lower()
        candidates = [
            a.get("src"),
            a.get("data-src"),
            a.get("data-lazy-src"),
            a.get("srcset", "").split(",")[0].strip().split(" ")[0],
        ]
        for raw in candidates:
            url = safe_url(raw or "")
            if url and ("tilak" in alt or "varma" in alt):
                self.images.append((url, "profile image alt text"))
                break


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    checked = datetime.now(timezone.utc).isoformat(timespec="seconds")
    found = []
    errors = []
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            def response_handler(response):
                if "/api/" not in response.url or "bcci.tv" not in response.url:
                    return
                try:
                    payload = response.json()
                    walk(payload, found)
                except Exception:
                    pass

            page.on("response", response_handler)
            page.goto(PROFILE_URL, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(4000)
            html = page.content()
            parser = ImageParser()
            parser.feed(html)
            found.extend(parser.images)
            # Also inspect JSON-LD and embedded JSON on the official page.
            for match in re.findall(
                r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                html,
                re.I | re.S,
            ):
                try:
                    walk(json.loads(match), found)
                except Exception:
                    pass
            browser.close()
    except Exception as exc:
        errors.append(str(exc))
        try:
            request = urllib.request.Request(PROFILE_URL, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=25) as response:
                html = response.read(5_000_000).decode("utf-8", "replace")
            parser = ImageParser()
            parser.feed(html)
            found.extend(parser.images)
            for raw in re.findall(r'https?:\\?/\\?/[^"\\s<>]+', html):
                url = safe_url(raw)
                if (
                    url
                    and any(host in url.lower() for host in ("bcci", "epicon"))
                    and any(t in url.lower() for t in ("tilak", "993", "player"))
                ):
                    found.append((url, "embedded BCCI image URL"))
        except Exception as fallback_exc:
            errors.append(str(fallback_exc))
    # Prefer image/photo keys from API payloads; keep only official BCCI/EPICON hosts.
    candidates = []
    for url, hint in found:
        url = safe_url(url)
        host = url.split("/")[2].lower() if url else ""
        if not url or not (
            host == "bcci.tv" or host.endswith(".bcci.tv") or host.endswith("epicon.in")
        ):
            continue
        if any(word in url.lower() for word in ("logo", "icon", "flag", "placeholder")):
            continue
        score = 0
        if any(
            word in hint.lower()
            for word in ("image", "photo", "headshot", "portrait", "profile")
        ):
            score += 5
        if any(word in url.lower() for word in ("tilak", "993", "player")):
            score += 3
        candidates.append((score, url))
    unique = []
    seen = set()
    for score, url in sorted(candidates, reverse=True):
        if url not in seen:
            seen.add(url)
            unique.append(url)
    if unique:
        result = {
            "source": "BCCI",
            "sourceUrl": PROFILE_URL,
            "image": unique[0],
            "updatedAt": checked,
            "checkedAt": checked,
            "status": "success",
        }
        print("Saved official BCCI Tilak Varma profile image.")
    else:
        result = dict(old)
        result.update(
            {
                "source": "BCCI",
                "sourceUrl": PROFILE_URL,
                "checkedAt": checked,
                "lastAttemptStatus": "source-unavailable",
                "lastAttemptError": "; ".join(errors)
                or "No official BCCI player image found in API/page payloads",
            }
        )
        result.setdefault("status", "source-unavailable")
        result.setdefault("image", "")
        result.setdefault("updatedAt", "")
        print("No BCCI profile image found; preserving last working image.")
    OUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
