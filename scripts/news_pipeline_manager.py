#!/usr/bin/env python3
"""Validate all repository JSON files and write a detailed news pipeline health report."""
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "News" / "news-pipeline-report.json"
NAME = re.compile(r"\\btilak\\s+varma\\b", re.I)
SKIP = {".git", "node_modules", ".venv", "venv", "dist", "build"}


def valid_url(value):
    try:
        p = urlparse(str(value or ""))
        return (
            p.scheme == "https"
            and p.hostname
            and (p.hostname == "bcci.tv" or p.hostname.endswith(".bcci.tv"))
            and ("/news/article/" in p.path or "/webview/news/article/" in p.path)
        )
    except Exception:
        return False


def main():
    json_files = []
    invalid = []
    bytes_total = 0
    for path in ROOT.rglob("*.json"):
        if any(part in SKIP for part in path.parts):
            continue
        try:
            size = path.stat().st_size
            bytes_total += size
            json.loads(path.read_text(encoding="utf-8"))
            json_files.append(
                {"path": str(path.relative_to(ROOT)), "bytes": size, "valid": True}
            )
        except Exception as exc:
            invalid.append(
                {"path": str(path.relative_to(ROOT)), "error": str(exc)[:500]}
            )
    raw_path = ROOT / "News" / "raw-news-pages.json"
    news_path = ROOT / "News" / "newsjson.json"
    try:
        raw = json.loads(raw_path.read_text(encoding="utf-8"))
    except Exception:
        raw = {}
    try:
        newsdoc = json.loads(news_path.read_text(encoding="utf-8"))
    except Exception:
        newsdoc = {}
    articles = raw.get("articles", []) if isinstance(raw, dict) else []
    news = newsdoc.get("news", []) if isinstance(newsdoc, dict) else []
    findings = []
    seen = set()
    for i, item in enumerate(news):
        if not isinstance(item, dict):
            findings.append(
                {"severity": "error", "record": i, "issue": "record is not an object"}
            )
            continue
        if not item.get("id"):
            findings.append({"severity": "error", "record": i, "issue": "missing id"})
        if not item.get("title"):
            findings.append(
                {"severity": "error", "record": i, "issue": "missing title"}
            )
        if not valid_url(item.get("webviewUrl")):
            findings.append(
                {"severity": "error", "record": i, "issue": "invalid/non-BCCI URL"}
            )
        text = " ".join(
            str(item.get(k) or "")
            for k in ("title", "fullText", "pageText", "description", "pageTitle")
        )
        if not NAME.search(text):
            findings.append(
                {"severity": "error", "record": i, "issue": "Tilak Varma not found"}
            )
        if not str(item.get("fullText") or item.get("pageText") or "").strip():
            findings.append(
                {
                    "severity": "warning",
                    "record": i,
                    "issue": "full article text missing",
                }
            )
        url = item.get("webviewUrl")
        if url in seen:
            findings.append(
                {"severity": "error", "record": i, "issue": "duplicate URL"}
            )
        seen.add(url)
    report = {
        "manager": "Tilak News Pipeline Manager",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": (
            "error"
            if invalid or any(x["severity"] == "error" for x in findings)
            else "warning" if findings else "healthy"
        ),
        "jsonFilesScanned": len(json_files) + len(invalid),
        "validJsonFiles": len(json_files),
        "invalidJsonFiles": invalid,
        "totalJsonBytes": bytes_total,
        "raw": {
            "candidateRecords": raw.get("candidateCount", 0),
            "articleUrls": raw.get("articleUrlCount", len(articles)),
            "articlePagesFetched": raw.get(
                "articlePagesFetched",
                sum(bool(x.get("pageText")) for x in articles if isinstance(x, dict)),
            ),
            "articleFetchErrors": len(raw.get("articleFetchErrors", [])),
            "records": len(articles),
        },
        "news": {
            "records": len(news),
            "declaredCount": newsdoc.get("matchedCount"),
            "countConsistent": newsdoc.get("matchedCount") == len(news),
            "findings": findings,
            "errors": sum(x["severity"] == "error" for x in findings),
            "warnings": sum(x["severity"] == "warning" for x in findings),
        },
        "workflow": {
            "steps": [
                "Fetch BCCI API pages",
                "Read full article URLs",
                "Repair/filter JSON records",
                "Validate every repository JSON",
                "Publish report",
            ],
            "autoFixScript": "scripts/news_pipeline_fixer.py",
            "fullTextScript": "scripts/newsreader.py",
            "filterScript": "scripts/filter_tilak_news.py",
        },
        "files": json_files,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "jsonFilesScanned": report["jsonFilesScanned"],
                "invalidJsonFiles": len(invalid),
                "newsRecords": len(news),
                "findings": len(findings),
                "report": str(REPORT.relative_to(ROOT)),
            }
        )
    )
    if invalid:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
