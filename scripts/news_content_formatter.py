#!/usr/bin/env python3
"""Verify fetched BCCI URLs against the live page metadata and prepare rich article blocks."""
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "News" / "raw-news-pages.json"
NEWS = ROOT / "News" / "newsjson.json"
REPORT = ROOT / "News" / "news-pipeline-report.json"
NAME = re.compile(r"\btilak\s+varma\b", re.I)


def official_url(value: str) -> bool:
    try:
        p = urlparse(str(value or ""))
        host = (p.hostname or "").lower()
        return (
            p.scheme == "https"
            and (host == "bcci.tv" or host.endswith(".bcci.tv"))
            and ("/news/article/" in p.path or "/webview/news/article/" in p.path)
        )
    except Exception:
        return False


def blocks_for(article: dict) -> list[dict]:
    """Render readable prose once and replace flattened schedule text with real tables."""
    text = str(article.get("fullText") or article.get("pageText") or "")
    text = text.replace("\r", "\n")
    tokens = [token.strip() for token in re.split(r"\s*\|\s*", text) if token.strip()]
    headers = [
        (["no.", "day", "date", "match", "venue"], 5),
        (["no.", "day", "date", "day (to)", "date (to)", "match", "venue"], 7),
    ]
    blocks: list[dict] = []

    def add_prose(value: str) -> None:
        value = re.sub(r"\s+", " ", value).strip()
        if not value:
            return
        # Remove repeated page chrome/headlines at the start of BCCI extraction.
        value = re.sub(r"^(?:[^.]{0,180}Press Releases\s+)?", "", value).strip()
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“‘])", value)
        for part in parts:
            part = part.strip(" |")
            if not part:
                continue
            # Headings/squad lists remain prose, not table cells.
            if len(part) < 100 and (part.endswith(":") or part.isupper()):
                blocks.append({"type": "heading", "text": part})
            else:
                blocks.append({"type": "text", "text": part})

    cursor = 0
    prose_start = 0
    while cursor < len(tokens):
        found = None
        for header, width in headers:
            if [x.lower() for x in tokens[cursor:cursor + width]] == header:
                found = (header, width)
                break
        if not found:
            cursor += 1
            continue
        header, width = found
        add_prose(" ".join(tokens[prose_start:cursor]))
        rows = [tokens[cursor:cursor + width]]
        pos = cursor + width
        trailing_prose = []
        while pos + width <= len(tokens):
            candidate = tokens[pos:pos + width]
            if [x.lower() for x in candidate] in [h for h, _ in headers]:
                break
            if not re.fullmatch(r"\d{1,2}", candidate[0]):
                break
            if not re.search(r"\d{1,2}[- /][A-Za-z0-9]{2,}|\d{4}", candidate[2]):
                break
            # Some BCCI pages flatten the next squad/paragraph into the Venue cell.
            venue = candidate[-1]
            split_match = re.search(
                r"\s+(?=(?:India A squad:|Note:|DEVAJIT SAIKIA|The squad for the ODIs))",
                venue,
                re.I,
            )
            if split_match:
                candidate[-1] = venue[:split_match.start()].strip()
                trailing_prose.append(venue[split_match.start():].strip())
                rows.append(candidate)
                pos += width
                break
            rows.append(candidate)
            pos += width
        if len(rows) > 1:
            blocks.append({"type": "table", "rows": rows})
            cursor = pos
            prose_start = pos
            if trailing_prose:
                add_prose(" ".join(trailing_prose))
                prose_start = pos
        else:
            cursor += 1
    add_prose(" ".join(tokens[prose_start:]))
    # Deduplicate identical prose blocks while preserving order.
    unique = []
    seen = set()
    for block in blocks:
        key = (block.get("type"), re.sub(r"\W+", "", str(block.get("text", "")).lower())) if block.get("type") != "table" else None
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        unique.append(block)
    return unique


def main():
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    try:
        doc = json.loads(NEWS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        doc = {}
    # Rebuild from the latest fetched BCCI pages. Do not depend on the previous
    # filtered archive, because a bad formatter run may have emptied it.
    fetched = raw.get("articles", []) if isinstance(raw.get("articles"), list) else []
    findings = []
    output = []
    non_matches = 0
    for index, source in enumerate(fetched):
        item = source
        if not isinstance(item, dict):
            findings.append(
                {
                    "severity": "error",
                    "record": index,
                    "issue": "record is not an object",
                }
            )
            continue
        url = str(item.get("webviewUrl") or "")
        if not official_url(url):
            findings.append(
                {
                    "severity": "error",
                    "record": index,
                    "issue": "news URL is not a BCCI article URL",
                }
            )
            continue
        final_url = str(item.get("finalUrl") or item.get("webviewUrl") or "")
        canonical = str((item.get("meta") or {}).get("canonical") or "")
        # BCCI currently uses the site root as canonical on some valid article
        # pages. Validate the actual article URL/redirect, but don't reject a
        # valid page just because its canonical points to the BCCI homepage.
        if not official_url(final_url):
            findings.append(
                {
                    "severity": "error",
                    "record": index,
                    "issue": "live page redirect is not a BCCI article URL",
                }
            )
            continue
        body = str(item.get("pageText") or item.get("fullText") or "")
        title = str(item.get("pageTitle") or item.get("title") or "")
        description = str(item.get("description") or "")
        if not NAME.search(" ".join((title, body, description))):
            # Most BCCI articles are expected not to mention Tilak. This is a
            # normal filter skip, not a pipeline failure.
            non_matches += 1
            continue
        merged = {
            k: v for k, v in item.items() if k not in {"meta", "jsonLd", "apiRecord"}
        }
        merged.update(
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
                    b["text"]
                    for b in blocks_for({"pageText": body})
                    if b["type"] in {"text", "heading"}
                ],
                "contentBlocks": blocks_for({"pageText": body}),
                "livePageVerified": True,
                "verifiedAt": datetime.now(timezone.utc).isoformat(),
                "sourceName": "BCCI",
            }
        )
        output.append(merged)
    doc["player"] = "Tilak Varma"
    doc["source"] = "BCCI News API only"
    doc["updatedAt"] = datetime.now(timezone.utc).isoformat()
    doc["candidateCount"] = len(fetched)
    # Preserve existing snapshot records while adding newly verified articles.
    previous = doc.get("news", []) if isinstance(doc.get("news"), list) else []
    combined = []
    seen_keys = set()
    for item in previous + output:
        if not isinstance(item, dict):
            continue
        key = str(item.get("webviewUrl") or item.get("id") or "")
        if key and key not in seen_keys:
            seen_keys.add(key)
            combined.append(item)
    combined.sort(key=lambda x: str(x.get("publishedAt") or ""), reverse=True)
    doc["news"] = combined
    doc["matchedCount"] = len(combined)
    doc["newMatches"] = len(output)
    doc["archivePreservation"] = {
        "existingRecordsPreserved": len(previous),
        "mergedRecords": len(combined),
    }
    doc["contentFormatter"] = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "liveUrlsMatched": sum(bool(x.get("livePageVerified")) for x in output),
        "unverifiedRecordsExcluded": max(0, len(fetched) - len(output)),
        "nonMatchingArticlesSkipped": non_matches,
        "findings": findings,
        "format": "paragraphs, headings, and detected HTML tables",
    }
    NEWS.write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    try:
        report = (
            json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {}
        )
        report["contentVerification"] = doc["contentFormatter"]
        report["status"] = (
            "error"
            if any(x["severity"] == "error" for x in findings)
            else "warning" if findings else "healthy"
        )
        REPORT.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    except (OSError, json.JSONDecodeError):
        pass
    print(
        json.dumps(
            {
                "verified": doc["contentFormatter"]["liveUrlsMatched"],
                "published": len(output),
                "findings": len(findings),
            }
        )
    )


if __name__ == "__main__":
    main()
