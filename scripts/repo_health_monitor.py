#!/usr/bin/env python3
"""Read-only repository health scan used by the 10-minute monitor.

Only deterministic formatting is eligible for automatic repair. This scanner
never rewrites application logic or cricket datasets.
"""
from __future__ import annotations
import json, re, subprocess, sys
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORE = {".git", ".github", "node_modules", "__pycache__", ".pytest_cache"}
issues, warnings, checks = [], [], []


def add(level, text, file=""):
    item = {"level": level, "message": text, "file": file}
    (issues if level == "error" else warnings if level == "warning" else checks).append(
        item
    )


class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.refs = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        for key in ("src", "href"):
            value = a.get(key, "")
            if value and not value.startswith(
                (
                    "http://",
                    "https://",
                    "//",
                    "data:",
                    "mailto:",
                    "tel:",
                    "#",
                    "javascript:",
                )
            ):
                self.refs.append(value.split("?", 1)[0].split("#", 1)[0])


def tracked_files():
    result = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, text=True, capture_output=True
    )
    if result.returncode:
        return [
            p
            for p in ROOT.rglob("*")
            if p.is_file() and not IGNORE.intersection(p.parts)
        ]
    return [ROOT / p for p in result.stdout.splitlines() if (ROOT / p).is_file()]


def main():
    files = tracked_files()
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        if path.suffix == ".json":
            try:
                json.loads(path.read_text(encoding="utf-8"))
                add("pass", "Valid JSON", rel)
            except Exception as e:
                add("error", f"JSON parse failed: {e}", rel)
        elif path.suffix == ".py":
            p = subprocess.run(
                [sys.executable, "-m", "py_compile", str(path)],
                capture_output=True,
                text=True,
            )
            add(
                "pass" if p.returncode == 0 else "error",
                "Python syntax OK" if p.returncode == 0 else p.stderr.strip()[-600:],
                rel,
            )
        elif path.suffix == ".js":
            p = subprocess.run(
                ["node", "--input-type=module", "--check", "-"],
                input=path.read_text(encoding="utf-8"),
                capture_output=True,
                text=True,
            )
            add(
                "pass" if p.returncode == 0 else "error",
                (
                    "JavaScript syntax OK"
                    if p.returncode == 0
                    else p.stderr.strip()[-600:]
                ),
                rel,
            )
        elif path.suffix == ".html":
            parser = IdParser()
            try:
                parser.feed(path.read_text(encoding="utf-8"))
                dup = sorted(k for k, n in Counter(parser.ids).items() if n > 1)
                if dup:
                    add("error", "Duplicate HTML IDs: " + ", ".join(dup[:30]), rel)
                else:
                    add("pass", "No duplicate HTML IDs", rel)
                for ref in parser.refs:
                    if not ref or ref.startswith(("https:", "http:")):
                        continue
                    target = (
                        (ROOT / ref.lstrip("/")).resolve()
                        if ref.startswith("/")
                        else (path.parent / ref).resolve()
                    )
                    try:
                        target.relative_to(ROOT.resolve())
                    except ValueError:
                        add(
                            "warning",
                            "Local asset path escapes repository: " + ref,
                            rel,
                        )
                        continue
                    if not target.exists():
                        add("error", "Missing local asset: " + ref, rel)
            except Exception as e:
                add("error", f"HTML scan failed: {e}", rel)
        elif path.suffix == ".css":
            text = path.read_text(encoding="utf-8")
            # Repeated selectors are a review signal, not automatically a bug:
            # media queries and intentional overrides can legitimately repeat.
            selectors = []
            for m in re.finditer(r"([^{}]+)\{", text):
                selector = m.group(1).strip()
                if (
                    selector
                    and not selector.startswith("@")
                    and "\n" not in selector
                    and len(selector) < 240
                ):
                    selectors.append(selector)
            repeated = [(s, n) for s, n in Counter(selectors).items() if n > 1]
            if repeated:
                sample = ", ".join(
                    f"{s} ({n}x)" for s, n in sorted(repeated, key=lambda x: -x[1])[:8]
                )
                add(
                    "warning",
                    f"{len(repeated)} repeated CSS selector(s); review cascade/overrides: {sample}",
                    rel,
                )
            else:
                add("pass", "No repeated CSS selectors detected", rel)
    report = {
        "schemaVersion": 1,
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "intervalMinutes": 10,
        "status": "error" if issues else "warning" if warnings else "healthy",
        "summary": {
            "filesScanned": len(files),
            "checksPassed": len(checks),
            "issues": len(issues),
            "warnings": len(warnings),
        },
        "items": (issues + warnings + checks)[:250],
        "autoRepair": {
            "attempted": False,
            "result": "No logic/data changes are made automatically. Formatting is handled by the separate safe-format workflow; code or data errors require a reviewed fix.",
        },
        "source": {
            "branch": subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=ROOT,
                text=True,
                capture_output=True,
            ).stdout.strip()
        },
    }
    out = ROOT / "data/repo-health.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    print(f"STATUS={report['status']} report={out.relative_to(ROOT)}")
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
