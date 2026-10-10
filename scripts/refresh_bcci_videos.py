#!/usr/bin/env python3
"""Refresh official BCCI international video metadata for Tilak Varma.

The BCCI API's playback URLs may be signed and expire. Fetching this feed nightly
keeps the public metadata and current playback URL fresh without mirroring video.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://www.bcci.tv/api/bff/cms/videos?tags=international"
OUT = Path("assets/bcci-videos.json")


def fetch_json() -> object:
    request = urllib.request.Request(
        API_URL,
        headers={
            "Accept": "application/json",
            "User-Agent": "TilakVarmaFanClub/1.0 (+https://tilakvarmafc.pages.dev/)",
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"BCCI API returned HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def walk_video_objects(node: object):
    if isinstance(node, dict):
        if any(k in node for k in ("playbackUrl", "thumbnailUrl", "slug")):
            yield node
        for value in node.values():
            yield from walk_video_objects(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk_video_objects(item)


def first_text(*values: object) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            for key in ("url", "src", "href", "path", "large", "xlarge", "medium", "small"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
    return ""


def infer_format(item: dict) -> str:
    parts = []
    for key in ("format", "matchFormat", "videoType", "category", "title", "slug"):
        value = item.get(key)
        if isinstance(value, str):
            parts.append(value.lower())
    taxonomy = item.get("taxonomy")
    if isinstance(taxonomy, dict):
        parts.extend(str(v).lower() for v in taxonomy.values() if isinstance(v, str))
    text = " ".join(parts)
    if re.search(r"\b(test|tests)\b", text):
        return "Test"
    if re.search(r"\b(odi|one day international)\b", text):
        return "ODI"
    if re.search(r"\b(t20i|t20 international)\b", text):
        return "T20I"
    if "international" in text:
        return "International"
    return "Other"


def normalize(item: dict) -> dict | None:
    title = first_text(item.get("title"), item.get("name"), item.get("videoTitle"))
    # Keep only actual Tilak Varma videos; do not match unrelated clips.
    if not title or "tilak" not in title.lower() or "varma" not in title.lower():
        return None
    playback = first_text(item.get("playbackUrl"), item.get("playback_url"), item.get("streamUrl"))
    thumbnail_set = item.get("thumbnailUrlSet") if isinstance(item.get("thumbnailUrlSet"), dict) else {}
    thumbnails = {
        size: first_text(thumbnail_set.get(size))
        for size in ("small", "medium", "large", "xlarge")
    }
    default_thumb = first_text(item.get("thumbnailUrl"), item.get("thumbnail"), thumbnails.get("large"), thumbnails.get("xlarge"))
    published = first_text(item.get("publishedDate"), item.get("publishedAt"), item.get("createdAt"))
    year = published[:4] if re.match(r"^\d{4}", published) else ""
    slug = first_text(item.get("slug"))
    video_id = first_text(item.get("id"), item.get("externalId"))
    if not playback:
        # Keep the entry as metadata, but the UI will show it as unavailable until
        # BCCI provides a playback URL again.
        playback = ""
    return {
        "id": video_id or slug or title,
        "title": title,
        "slug": slug,
        "thumbnailUrl": default_thumb,
        "thumbnailUrlSet": thumbnails,
        "publishedDate": published,
        "year": year,
        "duration": first_text(item.get("duration")),
        "format": infer_format(item),
        "playbackUrl": playback,
        "source": "BCCI",
    }


def main() -> int:
    payload = fetch_json()
    videos = []
    seen = set()
    for item in walk_video_objects(payload):
        video = normalize(item)
        if not video:
            continue
        key = video["id"] or video["title"]
        if key in seen:
            continue
        seen.add(key)
        videos.append(video)
    videos.sort(key=lambda v: v.get("publishedDate", ""), reverse=True)
    if not videos:
        raise RuntimeError("BCCI API responded, but no Tilak Varma videos were found; refusing to overwrite the existing feed.")
    output = {
        "source": API_URL,
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(videos),
        "videos": videos,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(videos)} Tilak Varma videos to {OUT}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Refresh failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
