#!/usr/bin/env python3
"""Scan all fetched BCCI article page text and publish only Tilak Varma matches.

Reads  News/raw-news-pages.json  (output of scripts/newsreader.py)
Writes News/newsjson.json        (matches from the last N hours + preserved archive)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("filter_tilak_news")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = ROOT / "News" / "raw-news-pages.json"
DEFAULT_OUT = ROOT / "News" / "newsjson.json"

PLAYER_NAME = "Tilak Varma"
NAME_RE = re.compile(r"\btilak\s+varma\b", re.I)
PARAGRAPH_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")

DEFAULT_WINDOW_HOURS = 24
MAX_PARAGRAPHS = 500
MAX_MATCHED_LINES = 50
MAX_LINE_CHARS = 1200
DROP_KEYS = {"meta", "jsonLd", "apiRecord"}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("Could not read %s (%s); using default", path, exc)
        return default


def write_json_atomic(path: Path, data: Any) -> None:
    """Write via temp file + rename so a crash never leaves a broken archive."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def parse_published(value: Any) -> datetime | None:
    """Parse an ISO timestamp (supports trailing 'Z'); naive times are treated as UTC."""
    try:
        dt = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def within_window(published: datetime | None, now: datetime, window: timedelta) -> bool:
    """True if published is not in the future and not older than the window."""
    if published is None:
        return False
    age = now - published
    return timedelta(0) <= age <= window


def record_key(item: dict) -> str:
    return str(item.get("webviewUrl") or item.get("id") or "")


# --------------------------------------------------------------------------- #
# Core logic
# --------------------------------------------------------------------------- #
def build_match(article: dict) -> dict | None:
    """Return a cleaned record if the article mentions the player, else None."""
    fields = {
        "title": str(article.get("title") or ""),
        "pageText": str(article.get("pageText") or ""),
        "description": str(article.get("description") or ""),
        "pageTitle": str(article.get("pageTitle") or ""),
    }
    found_in = [label for label, value in fields.items() if NAME_RE.search(value)]
    if not found_in:
        return None

    page_text = fields["pageText"]
    paragraphs = [p.strip() for p in PARAGRAPH_SPLIT_RE.split(page_text) if p.strip()]

    clean = {k: v for k, v in article.items() if k not in DROP_KEYS}
    clean.update(
        {
            "fullText": page_text,
            "articleText": paragraphs[:MAX_PARAGRAPHS],
            "matchedLines": [
                p[:MAX_LINE_CHARS] for p in paragraphs if NAME_RE.search(p)
            ][:MAX_MATCHED_LINES],
            "matchFoundIn": found_in,
            "sourceName": "BCCI",
        }
    )
    return clean


def merge_archive(previous: list[Any], fresh: list[dict]) -> tuple[list[dict], int]:
    """Merge archive + fresh matches by key.

    Fresh fields overwrite stale ones, but extra fields added by later pipeline
    steps (e.g. contentBlocks from news_content_formatter) are kept.
    Returns (merged list sorted newest-first, count of genuinely new records).
    """
    by_key: dict[str, dict] = {}
    keyless: list[dict] = []
    for item in previous:
        if not isinstance(item, dict):
            continue
        key = record_key(item)
        if key:
            by_key.setdefault(key, item)
        else:
            keyless.append(item)

    new_count = 0
    for item in fresh:
        key = record_key(item)
        if not key:
            keyless.append(item)
            new_count += 1
        elif key in by_key:
            by_key[key] = {**by_key[key], **item}
        else:
            by_key[key] = item
            new_count += 1

    merged = list(by_key.values()) + keyless
    merged.sort(key=lambda x: str(x.get("publishedAt") or ""), reverse=True)
    return merged, new_count


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--window-hours", type=float, default=DEFAULT_WINDOW_HOURS)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    if not args.raw.exists():
        log.error("Raw file not found: %s. Run scripts/newsreader.py first.", args.raw)
        return 1
    doc = read_json(args.raw, {})
    articles = doc.get("articles") if isinstance(doc, dict) else None
    if not isinstance(articles, list) or not articles:
        log.error("No enriched article pages found. Run scripts/newsreader.py first.")
        return 1

    now = datetime.now(timezone.utc)
    window = timedelta(hours=args.window_hours)

    previous_doc = read_json(args.out, {}) if args.out.exists() else {}
    previous = previous_doc.get("news", []) if isinstance(previous_doc, dict) else []
    if not isinstance(previous, list):
        previous = []

    matches: list[dict] = []
    outside_window = 0
    for article in articles:
        if not isinstance(article, dict):
            continue
        record = build_match(article)
        if record is None:
            continue
        if not within_window(parse_published(article.get("publishedAt")), now, window):
            outside_window += 1
            continue
        matches.append(record)

    merged, new_count = merge_archive(previous, matches)

    result = {
        "player": PLAYER_NAME,
        "source": "BCCI News API only",
        "updatedAt": now.isoformat(),
        "windowHours": args.window_hours,
        "candidateCount": len(articles),
        "matchedCount": len(merged),
        "newMatches": new_count,
        "outsideWindowSkipped": outside_window,
        "sourceErrors": doc.get("errors", []),
        "readErrors": doc.get("articleFetchErrors", []),
        "news": merged,
    }
    write_json_atomic(args.out, result)

    print(
        f"Scanned {len(articles)} full BCCI pages; "
        f"{len(matches)} Tilak Varma matches in window ({new_count} new), "
        f"{outside_window} older/undated skipped.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
