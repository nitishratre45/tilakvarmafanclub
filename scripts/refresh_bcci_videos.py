#!/usr/bin/env python3
"""Refresh BCCI's Tilak Varma video catalogue, newest first.

The public latest-video feed is paginated/limited, so query additional pages and
player/search filters where the BCCI endpoint supports them. Signed playback URLs
are refreshed nightly; no video files are mirrored.
"""
from __future__ import annotations

import hashlib
import html
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None

API_BASE = "https://www.bcci.tv/api/bff/cms/videos"
PLAYER_ID = "993"  # Tilak Varma's BCCI player page
CONFIG = Path("data/video-config.json")
OUT = Path("assets/bcci-videos.json")
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TilakVarmaFanClub/1.0 (+https://tilakvarmafc.pages.dev/)",
}


def fetch_json(params: dict[str, str]) -> object:
    # The latest domestic feed uses a separate /latest route and singular tag.
    endpoint = API_BASE + "/latest" if "tag" in params else API_BASE
    url = endpoint + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"BCCI API returned HTTP {response.status} for {url}")
        return json.loads(response.read().decode("utf-8"))


def parse_custom_response(body: bytes, content_type: str = "") -> object:
    """Parse JSON API responses and JSON payloads embedded in BCCI HTML pages."""
    text = body.decode("utf-8", errors="replace").lstrip("\ufeff")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    if "html" not in content_type.lower() and not re.search(
        r"<!doctype\s+html|<html\b|<script\b", text, re.I
    ):
        raise ValueError("BCCI source response was neither valid JSON nor an HTML page.")

    # Some official BCCI video/match pages are rendered as HTML. Extract only
    # script payloads that are valid JSON; do not evaluate JavaScript from the page.
    payloads: list[object] = []
    for match in re.finditer(r"<script\b([^>]*)>(.*?)</script\s*>", text, re.I | re.S):
        attributes, raw = match.groups()
        attrs = {}
        for key, double_quoted, single_quoted, unquoted in re.findall(
            r"""([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""",
            attributes,
            re.S,
        ):
            attrs[key.lower()] = html.unescape(
                double_quoted or single_quoted or unquoted or ""
            )
        # Prefer structured data and framework bootstrap payloads, but safely
        # inspect other scripts too because BCCI may embed its CMS JSON inline.
        script_text = html.unescape(raw.strip())
        if not script_text or script_text.startswith("<!--"):
            continue
        script_id = attrs.get("id", "").lower()
        script_type = attrs.get("type", "").lower()
        likely_data = (
            "json" in script_type
            or script_id in {"__next_data__", "__nuxt_data__", "__initial_state__"}
            or "initialstate" in script_id
            or "initial-state" in script_id
        )
        candidates = [script_text]
        if not likely_data:
            # Support assignments such as window.__INITIAL_STATE__ = {...};
            candidates = re.findall(
                r"(?:__INITIAL_STATE__|__NEXT_DATA__|__APOLLO_STATE__|initialState)\s*=\s*({.*?})(?:;|</script)",
                script_text,
                re.I | re.S,
            )
        for candidate in candidates:
            candidate = candidate.strip().rstrip(";")
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, (dict, list)):
                payloads.append(parsed)

    if payloads:
        return {"embeddedPayloads": payloads}
    raise ValueError(
        "BCCI returned an HTML page but no readable JSON video payload was embedded. "
        "The collector will continue with the built-in official BCCI catalogue."
    )


def fetch_custom_url(url: str) -> object:
    """Fetch a saved BCCI API URL or page without assuming every URL returns JSON."""
    parsed = urllib.parse.urlparse(url)
    allowed_hosts = {"www.bcci.tv", "bcci.tv", "live-bccitv.epicon.in"}
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise ValueError(
            "Admin video source must be an HTTPS URL on an official BCCI host."
        )
    headers = {
        **HEADERS,
        "Accept": "application/json, text/html;q=0.9, */*;q=0.5",
    }
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"Admin BCCI URL returned HTTP {response.status}")
        content_type = response.headers.get("Content-Type", "")
        return parse_custom_response(response.read(), content_type)


def walk_video_objects(node: object):
    if isinstance(node, dict):
        video_keys = (
            "playbackUrl",
            "playback_url",
            "playUrl",
            "play_url",
            "streamUrl",
            "stream_url",
            "videoUrl",
            "video_url",
            "thumbnailUrl",
            "slug",
        )
        if any(key in node for key in video_keys):
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
            for key in (
                "url",
                "src",
                "href",
                "path",
                "large",
                "xlarge",
                "medium",
                "small",
            ):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
    return ""


def is_valid_playback_url(value: str) -> bool:
    """Accept only direct HTTPS media URLs, never a page/profile URL."""
    if not value or any(character.isspace() for character in value):
        return False
    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and not parsed.username
        and not parsed.password
        and parsed.path.lower().endswith((".m3u8", ".mpd", ".mp4"))
    )


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

    playback = first_text(
        item.get("playbackUrl"),
        item.get("playback_url"),
        item.get("playUrl"),
        item.get("play_url"),
        item.get("streamUrl"),
        item.get("stream_url"),
        item.get("videoUrl"),
        item.get("video_url"),
    )
    # A Tilak-labelled object without a direct HTTPS media URL must never be
    # published to the public feed. This also makes the Admin URL a true
    # validate-before-publish input rather than trusting metadata alone.
    if not is_valid_playback_url(playback):
        return None

    thumbnail_set = (
        item.get("thumbnailUrlSet")
        if isinstance(item.get("thumbnailUrlSet"), dict)
        else {}
    )
    thumbnails = {
        size: first_text(thumbnail_set.get(size))
        for size in ("small", "medium", "large", "xlarge")
    }
    default_thumb = first_text(
        item.get("thumbnailUrl"),
        item.get("thumbnail"),
        thumbnails.get("large"),
        thumbnails.get("xlarge"),
    )
    published = first_text(
        item.get("publishedDate"), item.get("publishedAt"), item.get("createdAt")
    )
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


def fetch_browser_payloads() -> list[object]:
    """Use the official player page's own Load More control to discover all pages.

    Capturing the site's network responses avoids guessing private pagination
    parameters and follows the same public catalogue the BCCI page displays.
    """
    if sync_playwright is None:
        print("Playwright unavailable; using API fallback.", file=sys.stderr)
        return []
    payloads: list[object] = []
    seen_payloads: set[str] = set()
    page_url = "https://live-bccitv.epicon.in/videos/player/993?platform=international&type=men"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})

        def capture(response):
            url = response.url
            if "/api/" not in url and "application/json" not in response.headers.get(
                "content-type", ""
            ):
                return
            try:
                if "json" not in response.headers.get("content-type", "").lower():
                    return
                data = response.json()
            except Exception:
                return
            signature = hashlib.sha256(
                json.dumps(
                    data, sort_keys=True, ensure_ascii=False, default=str
                ).encode("utf-8")
            ).hexdigest()
            if signature in seen_payloads:
                return
            seen_payloads.add(signature)
            payloads.append(data)
            print(f"Captured BCCI catalogue response #{len(payloads)}: {url[:180]}")

        page.on("response", capture)
        try:
            page.goto(page_url, wait_until="domcontentloaded", timeout=45000)
        except Exception as exc:
            print(
                f"Official player page unavailable; continuing with public BCCI API: {exc}",
                file=sys.stderr,
            )
            browser.close()
            return []
        page.wait_for_timeout(2500)
        for click_number in range(100):
            # Capture links/items already rendered and trigger the official
            # pagination button. Stop only when the button is absent/disabled.
            button = page.get_by_role("button", name=re.compile(r"load more", re.I))
            if button.count() == 0:
                button = page.get_by_text(re.compile(r"^load more$", re.I))
            if button.count() == 0:
                break
            try:
                if not button.first.is_visible() or button.first.is_disabled():
                    break
                before = len(payloads)
                button.first.click(timeout=5000)
                page.wait_for_timeout(1200)
                if len(payloads) == before and click_number > 0:
                    # Let slow responses finish once before deciding the list is done.
                    page.wait_for_timeout(2500)
                    if len(payloads) == before:
                        break
            except Exception as exc:
                print(
                    f"Load More stopped at page {click_number + 1}: {exc}",
                    file=sys.stderr,
                )
                break
        browser.close()
    print(f"Captured {len(payloads)} unique BCCI JSON payloads from player archive.")
    return payloads


def main() -> int:
    collected: dict[str, dict] = {}
    sources_tried: list[str] = []

    # First consume the exact URL saved in Admin. Python fetches the raw BCCI
    # response, extracts Tilak clips, and normalizes them into the public schema.
    try:
        config = (
            json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
        )
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read Admin video config: {exc}", file=sys.stderr)
        config = {}
    custom_url = config.get("feedUrl", "").strip() if isinstance(config, dict) else ""
    if custom_url:
        sources_tried.append(custom_url)
        try:
            payload = fetch_custom_url(custom_url)
            custom_found = 0
            for item in walk_video_objects(payload):
                video = normalize(item)
                if video:
                    collected[video["id"]] = video
                    custom_found += 1
            print(
                f"Admin-saved BCCI URL: extracted {custom_found} Tilak clips; "
                f"{len(collected)} unique total so far."
            )
            if custom_found == 0:
                print(
                    "Admin-saved BCCI URL returned no playable Tilak clips; "
                    "continuing with the built-in official BCCI searches.",
                    file=sys.stderr,
                )
        except Exception as exc:
            # The custom source is optional. Reject unsafe/unavailable inputs,
            # then continue with the fixed official BCCI catalogue searches.
            # The normalizer still publishes only verified Tilak clips with
            # direct HTTPS media URLs, so fallback cannot publish unrelated items.
            print(
                f"Admin-saved BCCI URL unavailable; continuing with built-in official searches: {exc}",
                file=sys.stderr,
            )

    # Prefer the complete official player archive and its native Load More flow.
    # This is how we discover older pages without assuming undocumented params.
    for payload in fetch_browser_payloads():
        for item in walk_video_objects(payload):
            video = normalize(item)
            if video:
                collected[video["id"]] = video

    # Query BCCI API pages and season/format combinations. Continue through all
    # requested pages even when one page contains no Tilak Varma clips.
    api_queries: list[tuple[str, dict[str, str]]] = []
    for page_number in range(1, 7):
        api_queries.append(
            (
                f"international page {page_number}",
                {"page": str(page_number), "tags": "international"},
            )
        )

    season_queries = (
        {"tags": "international,season:2026"},
        {"tags": "international,men,season:2026,t20"},
        {"tags": "international,season:2025"},
        {"tags": "international,men,season:2025,t20"},
        {"tags": "international,season:2024"},
        {"tags": "international,season:2024,t20"},
        {"tags": "international,men,season:2024,t20"},
        {"tags": "international,men,season:2023,t20"},
        {"tags": "international,men,season:2022,t20"},
        {"tags": "international,men,season:2021,t20"},
        {"tags": "international,men,season:2020,t20"},
    )
    api_queries.extend(
        (f"season query {params['tags']}", params) for params in season_queries
    )

    # Additional common pagination parameter spellings and offset pages.
    for page_number in range(1, 7):
        api_queries.extend(
            [
                (
                    f"pageNumber {page_number}",
                    {"tags": "international", "pageNumber": str(page_number)},
                ),
                (
                    f"pageNo {page_number}",
                    {"tags": "international", "pageNo": str(page_number)},
                ),
                (
                    f"offset {page_number}",
                    {
                        "tags": "international",
                        "offset": str((page_number - 1) * 20),
                        "limit": "20",
                    },
                ),
            ]
        )

    # Extra official BCCI catalogue feeds. BCCI exposes category, season and
    # format filters as query parameters rather than one documented master feed.
    api_queries.extend(
        [
            ("latest domestic videos", {"tag": "domestic"}),
            (
                "domestic features/interviews season 2025",
                {"category": "features-and-interviews", "tags": "domestic,season:2025"},
            ),
            (
                "domestic men features/interviews season 2024",
                {
                    "category": "features-and-interviews",
                    "tags": "domestic,men,season:2024",
                },
            ),
        ]
    )

    # Scan BCCI's visible category/filter combinations for men's videos, by
    # season and format. The Tilak-only normalizer below removes unrelated clips.
    categories = ("highlights", "features-and-interviews", "press-conferences")
    environments = ("international,men", "domestic,men")
    formats = ("t20", "odi", "test")
    for environment in environments:
        for season in range(2018, datetime.now(timezone.utc).year + 1):
            api_queries.append(
                (
                    f"{environment} season {season}",
                    {"tags": f"{environment},season:{season}"},
                )
            )
            for category in categories:
                api_queries.append(
                    (
                        f"{environment} {category} season {season}",
                        {
                            "category": category,
                            "tags": f"{environment},season:{season}",
                        },
                    )
                )
                for match_format in formats:
                    api_queries.append(
                        (
                            f"{environment} {category} season {season} {match_format}",
                            {
                                "category": category,
                                "tags": f"{environment},season:{season},{match_format}",
                            },
                        )
                    )

    # BCCI features/interviews category feed for international T20 clips.
    api_queries.append(
        (
            "features and interviews (international T20)",
            {"category": "features-and-interviews", "tags": "international,t20"},
        )
    )

    # Tilak's IPL archive is not always included in the international player feed.
    # Search IPL separately from 2022 onward (his IPL seasons), across broad feeds
    # and the official highlights/features categories. The normalizer still keeps
    # only clips whose title or metadata identifies Tilak Varma.
    api_queries.extend(
        [
            ("IPL all videos", {"tags": "ipl"}),
            ("IPL men's videos", {"tags": "ipl,men"}),
            ("IPL highlights", {"category": "highlights", "tags": "ipl"}),
            (
                "IPL features/interviews",
                {"category": "features-and-interviews", "tags": "ipl"},
            ),
        ]
    )
    for season in range(2022, datetime.now(timezone.utc).year + 1):
        for tags in (f"ipl,season:{season}", f"ipl,men,season:{season}"):
            api_queries.append((f"IPL season {season} ({tags})", {"tags": tags}))
        for category in categories:
            api_queries.append(
                (
                    f"IPL {category} season {season}",
                    {"category": category, "tags": f"ipl,season:{season}"},
                )
            )

    api_queries.extend(
        [
            ("player ID", {"playerId": PLAYER_ID}),
            ("player", {"player": PLAYER_ID}),
            ("players", {"players": PLAYER_ID}),
            ("Tilak Varma tag", {"tags": "tilak-varma"}),
            ("Tilak Varma search", {"tags": "international", "search": "Tilak Varma"}),
            ("Tilak Varma term", {"tags": "international", "term": "Tilak Varma"}),
        ]
    )

    # Deduplicate identical requests, then fetch independent catalogue pages in
    # parallel. A slow optional BCCI query must not stall the entire daily refresh.
    unique_queries = []
    seen_urls: set[str] = set()
    for label, params in api_queries:
        endpoint = API_BASE + "/latest" if "tag" in params else API_BASE
        url = endpoint + "?" + urllib.parse.urlencode(params)
        if url in seen_urls:
            continue
        seen_urls.add(url)
        unique_queries.append((label, params, url))

    queried_signatures: set[str] = set()
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(fetch_json, params): (label, url)
            for label, params, url in unique_queries
        }
        for future in as_completed(futures):
            label, url = futures[future]
            sources_tried.append(url)
            try:
                payload = future.result()
            except Exception as exc:
                print(f"Skipping BCCI {label}: {exc}", file=sys.stderr)
                continue
            signature = hashlib.sha256(
                json.dumps(
                    payload, sort_keys=True, ensure_ascii=False, default=str
                ).encode("utf-8")
            ).hexdigest()
            if signature in queried_signatures:
                continue
            queried_signatures.add(signature)
            found_on_query = 0
            for item in walk_video_objects(payload):
                video = normalize(item)
                if video:
                    collected[video["id"]] = video
                    found_on_query += 1
            print(
                f"BCCI {label}: {found_on_query} Tilak clips; {len(collected)} unique total"
            )

    # Preserve previously published clips so a partial or narrower BCCI response
    # can never wipe the site's video history. Newly fetched records take priority
    # (they may carry refreshed signed playback URLs); old IDs are appended only
    # when they are absent from the current collection.
    previous_count = 0
    try:
        previous_payload = (
            json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
        )
        previous_videos = (
            previous_payload.get("videos", [])
            if isinstance(previous_payload, dict)
            else []
        )
        if isinstance(previous_videos, list):
            for previous in previous_videos:
                if not isinstance(previous, dict):
                    continue
                video_id = first_text(previous.get("id"))
                title = first_text(previous.get("title"))
                playback = first_text(previous.get("playbackUrl"))
                if not video_id or not title or not is_valid_playback_url(playback):
                    continue
                if video_id not in collected:
                    collected[video_id] = previous
                    previous_count += 1
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"Could not read prior video history; using newly collected clips only: {exc}",
            file=sys.stderr,
        )

    print(
        f"Video history retention: preserved {previous_count} previously published clips not returned by this refresh."
    )

    videos = sorted(
        collected.values(),
        key=lambda video: (
            video.get("publishedDate", ""),
            video.get("title", "").lower(),
        ),
        reverse=True,
    )

    # Remove only confidently identified duplicates. Never deduplicate by title alone:
    # different clips can legitimately share similar titles, and all non-duplicates
    # from the existing history must remain published.
    unique_videos: list[dict] = []
    seen_video_keys: set[str] = set()
    for video in videos:
        slug_key = re.sub(
            r"[^a-z0-9]+", "-", first_text(video.get("slug")).lower()
        ).strip("-")
        playback = first_text(video.get("playbackUrl"))
        try:
            parsed_playback = urllib.parse.urlparse(playback)
            # Ignore signed query parameters so refreshed tokens don't make a
            # previously seen media file look like a new video.
            playback_key = (
                parsed_playback.hostname or ""
            ).lower() + parsed_playback.path.lower()
        except ValueError:
            playback_key = playback.lower().split("?", 1)[0]
        title_key = re.sub(
            r"[^a-z0-9]+", " ", first_text(video.get("title")).lower()
        ).strip()
        published_key = first_text(video.get("publishedDate"))
        thumbnail_key = first_text(
            video.get("thumbnailUrl"),
            (
                (video.get("thumbnailUrlSet") or {}).get("large")
                if isinstance(video.get("thumbnailUrlSet"), dict)
                else ""
            ),
        )
        # Stable slug or canonical media path is strong duplicate evidence.
        # If neither exists, use a composite fingerprint, never title alone.
        if slug_key:
            identity = "slug:" + slug_key
        elif playback_key:
            identity = "media:" + playback_key
        else:
            identity = "fallback:" + "|".join((title_key, published_key, thumbnail_key))
        if identity in seen_video_keys:
            continue
        seen_video_keys.add(identity)
        unique_videos.append(video)
    removed_duplicates = len(videos) - len(unique_videos)
    videos = unique_videos
    print(
        f"Duplicate cleanup: removed {removed_duplicates} confirmed repeated entries."
    )

    if not videos:
        raise RuntimeError(
            "BCCI API returned no Tilak Varma videos; refusing to overwrite the existing feed."
        )

    output = {
        "source": "BCCI official video API and player catalogue",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(videos),
        "videos": videos,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Saved {len(videos)} unique Tilak Varma videos to {OUT}, newest first.")
    print(
        f"Dates covered: {videos[-1].get('publishedDate', 'unknown')} to {videos[0].get('publishedDate', 'unknown')}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Refresh failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
