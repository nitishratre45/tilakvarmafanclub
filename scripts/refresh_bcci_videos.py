#!/usr/bin/env python3
"""Refresh BCCI's Tilak Varma video catalogue, newest first.

The public latest-video feed is paginated/limited, so query additional pages and
player/search filters where the BCCI endpoint supports them. Signed playback URLs
are refreshed nightly; no video files are mirrored.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_BASE = "https://www.bcci.tv/api/bff/cms/videos"
PLAYER_ID = "993"  # Tilak Varma's BCCI player page
OUT = Path("assets/bcci-videos.json")
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TilakVarmaFanClub/1.0 (+https://tilakvarmafc.pages.dev/)",
}


def fetch_json(params: dict[str, str]) -> object:
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"BCCI API returned HTTP {response.status} for {url}")
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
        if isinstance(value, (int, float)):
            return str(value)
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
    if not title:
        return None

    # BCCI's player catalogue sometimes lists joint clips with only one player's
    # name in the title; inspect the item's metadata as well before excluding it.
    searchable = title.lower()
    for key in ("slug", "description", "playerName", "players", "tags"):
        value = item.get(key)
        if isinstance(value, str):
            searchable += " " + value.lower()
        elif isinstance(value, list):
            searchable += " " + " ".join(str(part).lower() for part in value)
        elif isinstance(value, dict):
            searchable += " " + " ".join(str(part).lower() for part in value.values())
    if "tilak" not in searchable or "varma" not in searchable:
        return None

    playback = first_text(item.get("playbackUrl"), item.get("playback_url"), item.get("streamUrl"))
    thumbnail_set = item.get("thumbnailUrlSet") if isinstance(item.get("thumbnailUrlSet"), dict) else {}
    thumbnails = {size: first_text(thumbnail_set.get(size)) for size in ("small", "medium", "large", "xlarge")}
    default_thumb = first_text(item.get("thumbnailUrl"), item.get("thumbnail"), thumbnails.get("large"), thumbnails.get("xlarge"))
    published = first_text(item.get("publishedDate"), item.get("publishedAt"), item.get("createdAt"))
    year = published[:4] if re.match(r"^\d{4}", published) else ""
    slug = first_text(item.get("slug"))
    video_id = first_text(item.get("id"), item.get("externalId"))
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
    collected: dict[str, dict] = {}
    sources_tried: list[str] = []

    # Walk through the latest international feed. If the API ignores the page
    # parameter, stop after repeated pages with no new Tilak entries.
    empty_pages = 0
    for page in range(1, 31):
        params = {"tags": "international", "page": str(page)}
        sources_tried.append(API_BASE + "?" + urllib.parse.urlencode(params))
        payload = fetch_json(params)
        before = len(collected)
        for item in walk_video_objects(payload):
            video = normalize(item)
            if video:
                collected[video["id"]] = video
        if len(collected) == before:
            empty_pages += 1
        else:
            empty_pages = 0
        if empty_pages >= 2:
            break

    # The BCCI player page exposes a player-specific video catalogue. Try common
    # public filter names; unsupported filters safely fall back to deduped results.
    for params in (
        {"playerId": PLAYER_ID},
        {"player": PLAYER_ID},
        {"players": PLAYER_ID},
        {"tags": "tilak-varma"},
        {"tags": "international", "search": "Tilak Varma"},
        {"tags": "international", "term": "Tilak Varma"},
    ):
        sources_tried.append(API_BASE + "?" + urllib.parse.urlencode(params))
        try:
            payload = fetch_json(params)
        except Exception as exc:
            print(f"Skipping unsupported BCCI query {params}: {exc}", file=sys.stderr)
            continue
        for item in walk_video_objects(payload):
            video = normalize(item)
            if video:
                collected[video["id"]] = video

    videos = sorted(
        collected.values(),
        key=lambda video: (video.get("publishedDate", ""), video.get("title", "").lower()),
        reverse=True,
    )
    if not videos:
        raise RuntimeError("BCCI API returned no Tilak Varma videos; refusing to overwrite the existing feed.")

    output = {
        "source": "BCCI official video API and player catalogue",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(videos),
        "videos": videos,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(videos)} unique Tilak Varma videos to {OUT}, newest first.")
    print(f"Dates covered: {videos[-1].get('publishedDate', 'unknown')} to {videos[0].get('publishedDate', 'unknown')}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Refresh failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
