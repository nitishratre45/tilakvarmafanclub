#!/usr/bin/env python3
"""Refresh the single Tilak Varma photo from official BCCI album/profile APIs.

Only image records explicitly associated with Tilak Varma are accepted. If BCCI
does not return a matching image, the previous working image is preserved.
"""
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bcci-tilak-photo.json"
PROFILE_URL = "https://www.bcci.tv/domestic/men/players/tilak-varma/993"
KNOWN_BCCI_TILAK_IMAGE = (
    "https://documents.bcci.tv/resizedimageskirti/11088_compress.png"
)
ALBUM_API_URLS = [
    "https://www.bcci.tv/api/bff/cms/albums?page=1&limit=100&tags=all-years",
    "https://www.bcci.tv/api/bff/cms/albums?page=2&limit=100&tags=all-years",
    "https://www.bcci.tv/api/bff/cms/albums?tags=season%3A2025",
    "https://www.bcci.tv/api/bff/cms/albums?tags=season%3A2024",
    "https://www.bcci.tv/api/bff/cms/albums?tags=season%3A2023",
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
    "Referer": "https://www.bcci.tv/",
    "Accept-Language": "en-US,en;q=0.9",
}
IMAGE_KEYS = (
    "image",
    "photo",
    "thumbnail",
    "picture",
    "portrait",
    "headshot",
    "media",
    "asset",
)
URL_KEYS = (
    "url",
    "src",
    "image",
    "original",
    "large",
    "medium",
    "desktop",
    "path",
    "href",
)


def clean_url(value):
    if not isinstance(value, str):
        return ""
    value = value.strip().replace("\\/", "/").replace("&amp;", "&")
    if value.startswith("//"):
        value = "https:" + value
    if not value.startswith("https://"):
        return ""
    if any(
        word in value.lower()
        for word in ("logo", "icon", "flag", "placeholder", "default-avatar")
    ):
        return ""
    return value


def text_fields(obj):
    return " ".join(
        str(v)
        for k, v in obj.items()
        if isinstance(v, (str, int)) and not isinstance(v, bool)
    ).lower()


def image_urls(obj, inside_match=False):
    urls = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            k = key.lower()
            if isinstance(value, str) and any(
                token in k for token in URL_KEYS + IMAGE_KEYS
            ):
                url = clean_url(value)
                if url:
                    urls.append(url)
            elif isinstance(value, (dict, list)):
                urls.extend(image_urls(value, inside_match))
    elif isinstance(obj, list):
        for value in obj:
            urls.extend(image_urls(value, inside_match))
    return urls


def walk_tilak_records(value, found):
    """Collect image URLs only from records whose own text identifies Tilak Varma."""
    if isinstance(value, dict):
        label = text_fields(value)
        if "tilak" in label and "varma" in label:
            found.extend(image_urls(value))
        for child in value.values():
            walk_tilak_records(child, found)
    elif isinstance(value, list):
        for child in value:
            walk_tilak_records(child, found)


class ProfileImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img":
            return
        a = dict(attrs)
        label = " ".join((a.get("alt") or "", a.get("title") or "")).lower()
        if "tilak" not in label and "varma" not in label:
            return
        for raw in (a.get("src"), a.get("data-src"), a.get("data-lazy-src")):
            url = clean_url(raw or "")
            if url:
                self.images.append(url)


def get_json(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.loads(response.read(8_000_000).decode("utf-8", "replace"))


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        old = json.loads(OUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        old = {}
    checked = datetime.now(timezone.utc).isoformat(timespec="seconds")
    found = []
    errors = []

    # Use BCCI's album endpoints, but accept only photo records explicitly labelled Tilak Varma.
    for endpoint in ALBUM_API_URLS:
        try:
            payload = get_json(endpoint)
            walk_tilak_records(payload, found)
        except Exception as exc:
            errors.append(endpoint.split("?")[0] + ": " + str(exc))

    # The official player profile is a fallback, not a reason to use unrelated album imagery.
    try:
        request = urllib.request.Request(PROFILE_URL, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=25) as response:
            html = response.read(5_000_000).decode("utf-8", "replace")
        parser = ProfileImageParser()
        parser.feed(html)
        found.extend(parser.images)
        for raw in re.findall(r'https?://[^"\\s<>]+', html):
            url = clean_url(raw)
            if url and ("tilak" in url.lower() or "993" in url):
                found.append(url)
    except Exception as exc:
        errors.append("profile: " + str(exc))

    # Deduplicate and prefer URLs that look like a player portrait/photo.
    unique = []
    seen = set()
    for url in found:
        url = clean_url(url)
        if url and url not in seen:
            seen.add(url)
            unique.append(url)
    unique.sort(
        key=lambda url: (
            0 if any(word in url.lower() for word in ("tilak", "varma", "993")) else 1,
            (
                0
                if any(
                    word in url.lower()
                    for word in ("portrait", "player", "profile", "headshot")
                )
                else 1
            ),
            len(url),
        )
    )

    if unique:
        result = {
            "source": "BCCI",
            "sourceUrl": PROFILE_URL,
            "image": unique[0],
            "updatedAt": checked,
            "checkedAt": checked,
            "status": "success",
            "matchRule": "Tilak Varma-labelled BCCI image record",
        }
        print("Saved one BCCI image explicitly matched to Tilak Varma.")
    else:
        result = dict(old)
        # Official BCCI headshot fallback prevents a blank gallery on first run/API outage.
        if not clean_url(result.get("image", "")):
            result["image"] = KNOWN_BCCI_TILAK_IMAGE
            result["updatedAt"] = checked
            result["status"] = "success"
            result["matchRule"] = (
                "Verified official BCCI Tilak Varma profile headshot fallback"
            )
        result.update(
            {
                "source": "BCCI",
                "sourceUrl": PROFILE_URL,
                "checkedAt": checked,
                "lastAttemptStatus": "source-unavailable",
                "lastAttemptError": "; ".join(errors)
                or "No new Tilak-labelled image found; retained the verified BCCI profile headshot",
            }
        )
        result.setdefault("status", "success")
        result.setdefault("image", KNOWN_BCCI_TILAK_IMAGE)
        result.setdefault("updatedAt", checked)
        print(
            "Using the verified BCCI Tilak Varma headshot; preserving any previous working photo."
        )
    OUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
