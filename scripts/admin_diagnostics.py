#!/usr/bin/env python3
"""Read-only health diagnostics for the Tilak Varma Fan Club repository.

This checker never rewrites player stats or deletes files. It reports exact
file/line locations so a safe repair can be made without corrupting source data.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUMMARY = Path(__import__("os").environ.get("GITHUB_STEP_SUMMARY", "/tmp/admin-health-summary.md"))
issues: list[str] = []
checks: list[str] = []


def passed(message: str) -> None:
    checks.append(message)
    print("PASS: " + message)


def failed(message: str) -> None:
    issues.append(message)
    print("ERROR: " + message)


def check_json() -> None:
    files = sorted((ROOT / "data").glob("*.json"))
    if not files:
        failed("data/*.json: no JSON data files found")
        return
    for path in files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
            passed(f"{path.relative_to(ROOT)}: valid JSON")
        except json.JSONDecodeError as exc:
            failed(f"{path.relative_to(ROOT)}:{exc.lineno}:{exc.colno}: invalid JSON: {exc.msg}")
        except OSError as exc:
            failed(f"{path.relative_to(ROOT)}: cannot read file: {exc}")


def check_python() -> None:
    files = sorted((ROOT / "scripts").glob("*.py"))
    if not files:
        failed("scripts/*.py: no Python scripts found")
        return
    for path in files:
        result = subprocess.run(
            [sys.executable, "-m", "py_compile", str(path)],
            cwd=ROOT, text=True, capture_output=True,
        )
        if result.returncode:
            detail = (result.stderr or result.stdout).strip().replace(str(ROOT) + "/", "")
            failed(f"{path.relative_to(ROOT)}: Python syntax/compile error: {detail}")
        else:
            passed(f"{path.relative_to(ROOT)}: Python syntax OK")


def check_javascript() -> None:
    candidates = sorted((ROOT / "assets").glob("*.js"))
    candidates += sorted((ROOT / "functions").rglob("*.js"))
    if not candidates:
        failed("JavaScript: no scripts found")
        return
    for path in candidates:
        # Function files use ES modules; stdin mode avoids depending on package.json.
        command = ["node", "--input-type=module", "--check", "-"]
        result = subprocess.run(
            command, input=path.read_text(encoding="utf-8"), cwd=ROOT,
            text=True, capture_output=True,
        )
        if result.returncode:
            detail = (result.stderr or result.stdout).strip().replace(str(ROOT) + "/", "")
            failed(f"{path.relative_to(ROOT)}: JavaScript syntax error: {detail}")
        else:
            passed(f"{path.relative_to(ROOT)}: JavaScript syntax OK")


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key.lower() == "id" and value:
                self.ids.append(value)


def check_html_ids() -> None:
    pages = [ROOT / "index.html", ROOT / "admin" / "index.html", ROOT / "death-overs" / "index.html"]
    for path in pages:
        if not path.exists():
            failed(f"{path.relative_to(ROOT)}: required HTML page missing")
            continue
        parser = IdParser()
        try:
            parser.feed(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            failed(f"{path.relative_to(ROOT)}: HTML parse issue: {exc}")
            continue
        duplicates = sorted(k for k, n in Counter(parser.ids).items() if n > 1)
        if duplicates:
            failed(f"{path.relative_to(ROOT)}: duplicate element IDs: {', '.join(duplicates)}")
        else:
            passed(f"{path.relative_to(ROOT)}: no duplicate IDs")


def main() -> int:
    check_json()
    check_python()
    check_javascript()
    check_html_ids()
    result = ["# Admin Studio · Python diagnostics", "", f"- Result: **{'PASS' if not issues else 'FAIL'}**",
              f"- Checks passed: **{len(checks)}**", f"- Issues found: **{len(issues)}**", ""]
    if issues:
        result += ["## Errors", *[f"- {item}" for item in issues], ""]
    result += ["## Successful checks", *[f"- {item}" for item in checks], ""]
    text = "\n".join(result)
    print("\n" + text)
    try:
        SUMMARY.write_text(text + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"WARNING: could not write workflow summary: {exc}")
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
