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
    text = str(article.get("fullText") or article.get("pageText") or "")
    blocks: list[dict] = []
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    table_rows: list[list[str]] = []

    def flush_table():
        nonlocal table_rows
        if table_rows:
            blocks.append({"type": "table", "rows": table_rows})
            table_rows = []

    for line in lines:
        if not line:
            flush_table()
            continue
        marker = re.fullmatch(r"\[TABLE\](.*?)\[/TABLE\]", line, flags=re.S)
        if marker:
            flush_table()
            try:
                rows = json.loads(marker.group(1))
                if isinstance(rows, list) and all(
                    isinstance(row, list) for row in rows
                ):
                    blocks.append({"type": "table", "rows": rows})
            except json.JSONDecodeError:
                pass
            continue
        cells = [
            cell.strip()
            for cell in re.split(r"\s*\|\s*", line.strip().strip("|"))
            if cell.strip()
        ]
        if len(cells) >= 2:
            table_rows.append(cells)
            continue
        flush_table()
        if len(line) < 100 and (line.endswith(":") or line.isupper()):
            blocks.append({"type": "heading", "text": line})
        else:
            blocks.append({"type": "text", "text": line})
    flush_table()
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
            findings.append(
                {
                    "severity": "error",
                    "record": index,
                    "issue": "Tilak Varma not found in verified live page title/body",
                }
            )
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
    doc["news"] = output
    doc["matchedCount"] = len(output)
    doc["newMatches"] = len(output)
    doc["contentFormatter"] = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "liveUrlsMatched": sum(bool(x.get("livePageVerified")) for x in output),
        "unverifiedRecordsExcluded": max(0, len(fetched) - len(output)),
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
