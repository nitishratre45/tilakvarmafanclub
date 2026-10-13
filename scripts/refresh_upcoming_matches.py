#!/usr/bin/env python3
"""Refresh the Upcoming Matches fixture snapshot from BCCI's public fixtures page.

The updater is deliberately fail-closed: if the official page cannot be parsed
or no matching fixtures are found, it keeps the existing verified snapshot.
It only publishes India international fixtures for series whose squad was
already confirmed in the maintained snapshot (West Indies / New Zealand).
"""
from __future__ import annotations

import html
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS_FILE = ROOT / "matches" / "upcoming-matches.js"
REPORT_FILE = ROOT / "matches" / "upcoming-fixtures-refresh.json"
BCCI_FIXTURES_URL = "https://www.bcci.tv/matches"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClub/1.0; fixture-refresh)"
}
MONTHS = {
    name.lower(): number
    for number, name in enumerate(
        ["", "January", "February", "March", "April", "May", "June",
         "July", "August", "September", "October", "November", "December"],
        start=0,
    )
    if name
}


def fetch_page() -> str:
    request = urllib.request.Request(BCCI_FIXTURES_URL, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"BCCI fixtures page returned HTTP {response.status}")
        return response.read().decode("utf-8", "replace")


def strip_markup(value: str) -> str:
    value = re.sub(r"<script\b.*?</script>|<style\b.*?</style>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def find_date(text: str) -> str | None:
    # Accept common BCCI date forms, e.g. 14 Oct 2026, 14 October 2026.
    match = re.search(
        r"\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b",
        text,
        re.I,
    )
    if not match:
        return None
    day, month_text, year = match.groups()
    month_key = month_text.lower()[:3]
    month = next((n for name, n in MONTHS.items() if name.startswith(month_key)), None)
    if not month:
        return None
    try:
        return datetime(int(year), month, int(day)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def extract_fixture_cards(page: str) -> list[dict]:
    # BCCI match-detail links have a stable URL shape; inspect surrounding
    # markup for the date and visible card text rather than guessing dates.
    matches = list(re.finditer(
        r'href=["\']([^"\']*/matches/([0-9a-f-]{36})/([^"\']*match-details[^"\']*))["\']',
        page,
        re.I,
    ))
    fixtures = []
    seen = set()
    for match in matches:
        url_path = html.unescape(match.group(1))
        match_id = match.group(2)
        if match_id in seen:
            continue
        seen.add(match_id)
        start = max(0, match.start() - 1800)
        end = min(len(page), match.end() + 1800)
        card_text = strip_markup(page[start:end])
        # Keep the feature scoped to India's already squad-confirmed series.
        if not re.search(r"\bIndia\b", card_text, re.I):
            continue
        if not re.search(r"\b(West Indies|New Zealand)\b", card_text, re.I):
            continue
        date = find_date(card_text)
        if not date:
            continue
        opponent_match = re.search(r"\b(West Indies|New Zealand)\b", card_text, re.I)
        opponent = opponent_match.group(1) if opponent_match else None
        if not opponent:
            continue
        title_match = re.search(
            r"\b((?:\d+(?:st|nd|rd|th)\s+)?(?:T20I|ODI|Test|TEST|T20|ODI)\b[^.]{0,50})",
            card_text,
            re.I,
        )
        match_label = title_match.group(1).strip() if title_match else "International match"
        # Venue is taken only when it is explicitly visible in the source text.
        venue = ""
        for candidate in re.findall(r"\b[A-Z][A-Za-z.' -]{2,70}\b", card_text):
            if any(token in candidate.lower() for token in ("stadium", "ground", "park", "arena")):
                venue = candidate.strip()
                break
        source = url_path if url_path.startswith("http") else "https://www.bcci.tv" + url_path
        fixtures.append({
            "date": date,
            "label": datetime.strptime(date, "%Y-%m-%d").strftime("%a, %-d %b %Y"),
            "match": match_label,
            "opponent": opponent,
            "venue": venue or "Venue as listed by BCCI",
            "time": "19:00",
            "source": source,
        })
    return fixtures


def main() -> None:
    # Preserve the manually verified snapshot unless the official source returns
    # a useful, parseable set. The JS remains the current public fallback.
    existing_text = JS_FILE.read_text(encoding="utf-8")
    checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    report = {
        "source": BCCI_FIXTURES_URL,
        "checkedAt": checked_at,
        "status": "source-unavailable",
        "fixturesFound": 0,
        "note": "The previous verified fixture list remains in place unless official fixtures can be parsed.",
    }
    try:
        fixtures = extract_fixture_cards(fetch_page())
        if fixtures:
            # Store an auditable official-source snapshot for review. Do not
            # rewrite the public JS from ambiguous scraped text.
            REPORT_FILE.write_text(
                json.dumps(
                    {
                        **report,
                        "status": "official-fixtures-found",
                        "fixturesFound": len(fixtures),
                        "fixtures": sorted(fixtures, key=lambda item: item["date"]),
                        "note": "Parsed from BCCI's public fixtures page. Review squad status before publishing new cards.",
                    },
                    ensure_ascii=False,
                    indent=2,
                ) + "\n",
                encoding="utf-8",
            )
            print(f"Parsed {len(fixtures)} fixture candidates from BCCI. Snapshot saved for validation.")
            return
        report["status"] = "no-matching-fixtures-parsed"
        report["note"] = "BCCI page loaded, but no trustworthy matching fixture cards were parsed; existing public fixtures were preserved."
    except Exception as exc:
        report["status"] = "source-unavailable"
        report["note"] = f"Could not refresh from BCCI; existing public fixtures were preserved. {type(exc).__name__}: {exc}"
        print(report["note"])
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Ensure the current fixture code remains unchanged on any parse/source issue.
    assert "const fixtures = [" in existing_text, "Existing fixtures array not found; refusing to proceed"
    print("Existing Upcoming Matches fixtures preserved.")


if __name__ == "__main__":
    main()
