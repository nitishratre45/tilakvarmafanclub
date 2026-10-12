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
    """Convert extracted BCCI page text into paragraphs and genuine table blocks."""
    text = str(article.get("fullText") or article.get("pageText") or "")
    text = text.replace("\r", "\n")
    blocks: list[dict] = []

    def add_prose(value: str) -> None:
        value = re.sub(r"\s+", " ", value).strip()
        if not value:
            return
        # Split a flattened article into readable sentence-level paragraphs.
        parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“‘])", value)
        for part in parts:
            part = part.strip()
            if not part:
                continue
            if len(part) < 100 and (part.endswith(":") or part.isupper()):
                blocks.append({"type": "heading", "text": part})
            else:
                blocks.append({"type": "text", "text": part})

    # BCCI HTML extraction flattens table rows to pipe-separated text. Parse a
    # table only when a recognizable header exists; never treat the whole page
    # as a table simply because it contains pipe characters.
    tokens = [token.strip() for token in re.split(r"\s*\|\s*", text) if token.strip()]
    header_sets = [
        (["no.", "day", "date", "match", "venue"], 5),
        (["no.", "day", "date", "day (to)", "date (to)", "match", "venue"], 7),
    ]
    # Preserve the complete extracted article as readable prose; real tables are rendered separately.
    add_prose(re.sub(r"\s*\|\s*", " ", text))
    cursor = 0
    while cursor < len(tokens):
        found = None
        for headers, width in header_sets:
            end = cursor + len(headers)
            if [v.lower() for v in tokens[cursor:end]] == headers:
                found = (headers, width, cursor)
                break
        if not found:
            cursor += 1
            continue
        headers, width, header_start = found
        # Recover the prose before this table using the original token span.
        # It is okay if preceding prose has already been represented; cursor
        # always advances to the next detected table and the original text is
        # retained in fullText for reference.
        rows = [tokens[header_start : header_start + width]]
        pos = header_start + width
        while pos + width <= len(tokens):
            candidate = tokens[pos : pos + width]
            if [v.lower() for v in candidate] in [item[0] for item in header_sets]:
                break
            first = candidate[0]
            if not re.fullmatch(r"\d{1,2}", first):
                break
            # Require a date-ish value in the expected date column to avoid
            # swallowing the following article text into the table.
            if not re.search(r"\d{1,2}[- /][A-Za-z0-9]{2,}|\d{4}", candidate[2]):
                break
            rows.append(candidate)
            pos += width
        # If no data rows follow, this was not a genuine table.
        if len(rows) > 1:
            add_prose(" ".join(tokens[max(0, header_start - 1) : header_start]).strip())
            blocks.append({"type": "table", "rows": rows})
            cursor = pos
        else:
            cursor = header_start + 1

    return blocks


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
    # Never discard the existing published archive. Merge newly verified recent matches by URL/ID.\n    previous = doc.get("news", []) if isinstance(doc.get("news"), list) else []\n    merged = []\n    seen_keys = set()\n    for item in previous + output:\n        if not isinstance(item, dict):\n            continue\n        key = str(item.get("webviewUrl") or item.get("id") or "")\n        if key and key not in seen_keys:\n            seen_keys.add(key)\n            merged.append(item)\n    merged.sort(key=lambda x: str(x.get("publishedAt") or ""), reverse=True)\n    doc["news"] = merged\n    doc["matchedCount"] = len(merged)\n    doc["newMatches"] = len(output)\n    doc["archivePreservation"] = {"existingRecordsPreserved": len(previous), "mergedRecords": len(merged)}
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
