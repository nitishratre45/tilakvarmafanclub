#!/usr/bin/env python3
"""Verify fetched BCCI article URLs and prepare rich article blocks.

Reads  News/raw-news-pages.json   (fetched BCCI pages)
Writes News/newsjson.json         (filtered + formatted archive)
       News/news-pipeline-report.json (health report)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

log = logging.getLogger("news_formatter")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = ROOT / "News" / "raw-news-pages.json"
DEFAULT_NEWS = ROOT / "News" / "newsjson.json"
DEFAULT_REPORT = ROOT / "News" / "news-pipeline-report.json"

PLAYER_NAME = "Tilak Varma"
NAME_RE = re.compile(r"\btilak\s+varma\b", re.I)

# BCCI article tables arrive as flattened cell text, and their column labels
# vary by series/year. Keep common itinerary layouts here; row detection below
# uses the header's actual Date column instead of assuming it is always column 3.
TABLE_HEADERS: tuple[tuple[str, ...], ...] = (
    ("no.", "day", "date", "match", "venue"),
    ("no", "day", "date", "match", "venue"),
    ("no.", "day", "date", "time", "match", "venue"),
    ("no.", "day", "date", "time (ist)", "match", "venue"),
    ("no.", "day", "date", "day (to)", "date (to)", "match", "venue"),
    ("no", "day", "date", "day (to)", "date (to)", "match", "venue"),
    ("sr no.", "day", "date", "time", "match", "venue"),
    ("sr no.", "day", "date", "match", "venue"),
    ("sr. no.", "day", "date", "match", "venue"),
    ("sr no.", "day", "date", "time", "match", "venue"),
    ("sr. no.", "day", "date", "time", "match", "venue"),
    ("day", "date", "time (ist)", "match", "venue"),
    ("day", "date", "time", "match", "venue"),
    ("day", "date", "match", "venue"),
    ("day", "date", "match"),
    ("no.", "date", "day", "venue"),
    ("no", "date", "day", "venue"),
    ("date", "day", "venue"),
    ("date", "day", "match"),
    ("date", "day", "match", "venue"),
)
HEADER_SET = {h for h in TABLE_HEADERS}

# Some pages flatten the next paragraph/squad into the last (Venue) cell.
VENUE_SPLIT_RE = re.compile(
    r"\s+(?=(?:India A squad:|Note:|DEVAJIT SAIKIA|The squad for the ODIs))", re.I
)
ROW_NO_RE = re.compile(r"\d{1,2}")
ROW_DATE_RE = re.compile(r"\d{1,2}[- /][A-Za-z0-9]{2,}|\d{4}")
CHROME_RE = re.compile(r"^[^.]{0,180}Press Releases\s+")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z“‘])")
# BCCI frequently places editorial labels in the middle of flattened page text.
# Split them into real heading blocks before sentence-level formatting.
INLINE_HEADING_RE = re.compile(
    r"\s+(?=(?:India(?:’s|'s)?\s+(?:T20I\s+)?squad:|India A squad:|"
    r"T20I squad:|ODI squad:|Test squad:|Playing XI:|Squad:|Fixtures:|"
    r"Schedule:|Match officials:|Key dates:))",
    re.I,
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def official_url(value: Any) -> bool:
    """True only for https://(www.)bcci.tv article / webview-article URLs."""
    try:
        p = urlparse(str(value or ""))
    except ValueError:
        return False
    host = (p.hostname or "").lower()
    return (
        p.scheme == "https"
        and (host == "bcci.tv" or host.endswith(".bcci.tv"))
        and ("/news/article/" in p.path or "/webview/news/article/" in p.path)
    )


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("Could not read %s (%s); using default", path, exc)
        return default


def write_json_atomic(path: Path, data: Any) -> None:
    """Write JSON via temp file + rename so a crash never leaves a half/empty file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


# --------------------------------------------------------------------------- #
# Content blocks
# --------------------------------------------------------------------------- #
def prose_blocks(value: str, strip_chrome: bool = False) -> list[dict]:
    """Split a prose chunk into sentence-level text / heading blocks."""
    value = re.sub(r"\s+", " ", value).strip()
    if strip_chrome:
        # Page chrome / repeated headline ahead of the real body.
        value = CHROME_RE.sub("", value).strip()
    out: list[dict] = []
    # Add a boundary before known editorial labels that can be concatenated
    # directly to the preceding sentence by the source page's text extractor.
    value = INLINE_HEADING_RE.sub("\n", value)
    for chunk in value.splitlines():
        chunk = chunk.strip(" |")
        if not chunk:
            continue
        for part in SENTENCE_SPLIT_RE.split(chunk):
            part = part.strip(" |")
            if not part:
                continue
            is_heading = len(part) < 100 and (
                part.endswith(":")
                or part.isupper()
                or bool(
                    re.fullmatch(
                        r"(?:India(?:’s|'s)?\s+)?(?:T20I|ODI|Test)?\s*(?:squad|fixtures|schedule|playing XI|match officials|key dates)",
                        part,
                        re.I,
                    )
                )
            )
            out.append({"type": "heading" if is_heading else "text", "text": part})
    return out


def match_header(tokens: list[str], cursor: int) -> int:
    """Return table width if a known header starts at `cursor`, else 0."""
    for header in TABLE_HEADERS:
        width = len(header)
        if tuple(t.lower() for t in tokens[cursor : cursor + width]) == header:
            return width
    return 0


def is_row(candidate: list[str], header: list[str]) -> bool:
    """Recognize a table row using its header's date column, not a fixed index."""
    normalized = [value.strip().lower().rstrip(":") for value in header]
    date_indexes = [
        index
        for index, value in enumerate(normalized)
        if value == "date" or value.startswith("date ")
    ]
    if not date_indexes:
        return False
    date_index = date_indexes[0]
    if date_index >= len(candidate) or not ROW_DATE_RE.search(candidate[date_index]):
        return False
    # Most BCCI fixtures include a serial number; some don't.
    return bool(ROW_NO_RE.fullmatch(candidate[0])) or (
        bool(candidate)
        and candidate[0].strip().lower()
        in {
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        }
    )


def blocks_for(text: str) -> list[dict]:
    """Turn flattened BCCI text into ordered heading/text/table blocks."""
    text = text.replace("\r", "\n")
    tokens = [t.strip() for t in re.split(r"\s*\|\s*", text) if t.strip()]

    blocks: list[dict] = []
    first_prose = True

    def flush_prose(chunk: str) -> None:
        nonlocal first_prose
        new = prose_blocks(chunk, strip_chrome=first_prose)
        if new:
            first_prose = False
        blocks.extend(new)

    cursor = prose_start = 0
    while cursor < len(tokens):
        width = match_header(tokens, cursor)
        if not width:
            cursor += 1
            continue

        header = list(tokens[cursor : cursor + width])
        rows = [header]
        pos = cursor + width
        trailing: list[str] = []

        while pos + width <= len(tokens):
            candidate = list(tokens[pos : pos + width])
            if match_header(tokens, pos) or not is_row(candidate, header):
                break
            split = VENUE_SPLIT_RE.search(candidate[-1])
            if split:
                venue = candidate[-1]
                candidate[-1] = venue[: split.start()].strip()
                trailing.append(venue[split.start() :].strip())
                rows.append(candidate)
                pos += width
                break
            rows.append(candidate)
            pos += width

        if len(rows) == 1:  # header with no data rows -> not a real table
            cursor += 1
            continue

        flush_prose(" ".join(tokens[prose_start:cursor]))
        blocks.append({"type": "table", "rows": rows})
        if trailing:
            flush_prose(" ".join(trailing))
        cursor = prose_start = pos

    flush_prose(" ".join(tokens[prose_start:]))
    return dedupe_blocks(blocks)


def dedupe_blocks(blocks: list[dict]) -> list[dict]:
    """Drop repeated prose blocks (order preserved); tables are always kept."""
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for block in blocks:
        if block["type"] != "table":
            key = (block["type"], re.sub(r"\W+", "", block["text"].lower()))
            if key in seen:
                continue
            seen.add(key)
        unique.append(block)
    return unique


def editorial_copy(title: str, description: str, body: str) -> dict:
    """Build a short editorial summary from source text only; never invent facts."""
    clean = re.sub(r"\s+", " ", str(body or "")).strip()
    clean = CHROME_RE.sub("", clean).strip()
    clean = re.sub(r"\b(?:Share|\d+\s+d ago)\b", "", clean, flags=re.I).strip()
    summary = re.sub(r"\s+", " ", str(description or "")).strip()
    if len(summary) < 45 or summary.casefold() == str(title or "").strip().casefold():
        candidates = SENTENCE_SPLIT_RE.split(clean)
        summary = next(
            (
                part.strip(" |")
                for part in candidates
                if len(part.strip(" |")) >= 45
                and part.strip(" |").casefold() != str(title or "").strip().casefold()
            ),
            "",
        )
    if not summary:
        summary = str(title or "").strip()
    if len(summary) > 360:
        summary = summary[:357].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"

    points: list[str] = []
    for part in SENTENCE_SPLIT_RE.split(clean):
        part = part.strip(" |")
        if not 35 <= len(part) <= 260:
            continue
        if re.search(
            r"\b(Tilak Varma|squad|vice.?captain|captain|T20I|New Zealand|selection committee|fitness)\b",
            part,
            re.I,
        ):
            if part not in points:
                points.append(part)
        if len(points) == 3:
            break
    return {"summary": summary, "keyPoints": points, "style": "source-grounded"}


# --------------------------------------------------------------------------- #
# Record processing
# --------------------------------------------------------------------------- #
def process_record(
    index: int, item: Any, verified_at: str
) -> tuple[str, dict | None, dict | None]:
    """Return (status, record, finding). status: ok | skipped | error."""

    def error(msg: str) -> tuple[str, None, dict]:
        return "error", None, {"severity": "error", "record": index, "issue": msg}

    if not isinstance(item, dict):
        return error("record is not an object")

    url = str(item.get("webviewUrl") or "")
    if not official_url(url):
        return error("news URL is not a BCCI article URL")

    final_url = str(item.get("finalUrl") or url)
    if not official_url(final_url):
        return error("live page redirect is not a BCCI article URL")

    # BCCI sometimes sets canonical to the site root on valid articles, so the
    # canonical is informational only; the real/final URL is what we validate.
    canonical = str((item.get("meta") or {}).get("canonical") or "")

    body = str(item.get("pageText") or item.get("fullText") or "")
    title = str(item.get("pageTitle") or item.get("title") or "")
    description = str(item.get("description") or "")

    if not NAME_RE.search(f"{title} {body} {description}"):
        return "skipped", None, None  # normal filter miss, not a failure

    blocks = blocks_for(body)  # computed once
    record = {k: v for k, v in item.items() if k not in {"meta", "jsonLd", "apiRecord"}}
    record.update(
        {
            "title": str(item.get("title") or title),
            "webviewUrl": url,
            "verifiedLiveUrl": final_url,
            "canonicalUrl": canonical or final_url,
            "pageTitle": title,
            "description": description,
            "fullText": body,
            "pageText": body,
            "articleText": [
                b["text"] for b in blocks if b["type"] in {"text", "heading"}
            ],
            "contentBlocks": blocks,
            "editorial": editorial_copy(title, description, body),
            "livePageVerified": True,
            "verifiedAt": verified_at,
            "sourceName": "BCCI",
        }
    )
    return "ok", record, None


def record_key(item: dict) -> str:
    return str(item.get("webviewUrl") or item.get("id") or "")


def merge_archive(previous: list[Any], fresh: list[dict]) -> tuple[list[dict], int]:
    """Merge old + new by key. Fresh data replaces stale copies. Returns (list, new_count)."""
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
        if key not in by_key:
            new_count += 1
        by_key[key] = item  # refresh with the latest verified content

    combined = list(by_key.values()) + keyless
    combined.sort(key=lambda x: str(x.get("publishedAt") or ""), reverse=True)
    return combined, new_count


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", type=Path, default=DEFAULT_RAW)
    ap.add_argument("--news", type=Path, default=DEFAULT_NEWS)
    ap.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    if not args.raw.exists():
        log.error("Raw file not found: %s", args.raw)
        return 1
    raw = read_json(args.raw, {})
    fetched = raw.get("articles") if isinstance(raw, dict) else None
    if not isinstance(fetched, list):
        log.error("Raw file has no 'articles' list")
        return 1

    # Existing archive is preserved; a missing/corrupt file just means empty.
    doc = read_json(args.news, {}) if args.news.exists() else {}
    if not isinstance(doc, dict):
        doc = {}

    stamp = now_iso()
    findings: list[dict] = []
    output: list[dict] = []
    skipped = 0
    for index, item in enumerate(fetched):
        status, record, finding = process_record(index, item, stamp)
        if status == "ok":
            output.append(record)  # type: ignore[arg-type]
        elif status == "skipped":
            skipped += 1
        else:
            findings.append(finding)  # type: ignore[arg-type]

    previous = doc.get("news") if isinstance(doc.get("news"), list) else []
    combined, new_count = merge_archive(previous, output)

    doc.update(
        {
            "player": PLAYER_NAME,
            "source": "BCCI News API only",
            "updatedAt": stamp,
            "candidateCount": len(fetched),
            "news": combined,
            "matchedCount": len(combined),
            "newMatches": new_count,
            "archivePreservation": {
                "existingRecordsPreserved": len(previous),
                "mergedRecords": len(combined),
            },
            "contentFormatter": {
                "checkedAt": stamp,
                "liveUrlsMatched": len(output),
                # Only genuinely invalid records; non-matching articles are counted separately.
                "unverifiedRecordsExcluded": len(findings),
                "nonMatchingArticlesSkipped": skipped,
                "findings": findings,
                "format": "paragraphs, headings, and detected HTML tables",
            },
        }
    )
    write_json_atomic(args.news, doc)

    report = read_json(args.report, {}) if args.report.exists() else {}
    if not isinstance(report, dict):
        report = {}
    report["contentVerification"] = doc["contentFormatter"]
    report["status"] = (
        "error"
        if any(f["severity"] == "error" for f in findings)
        else "warning" if findings else "healthy"
    )
    write_json_atomic(args.report, report)

    print(
        json.dumps(
            {
                "verified": len(output),
                "published": new_count,
                "skipped": skipped,
                "findings": len(findings),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
