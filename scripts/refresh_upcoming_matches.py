#!/usr/bin/env python3
"""Build Upcoming Matches from squad-confirmed fixtures in News/newsjson.json.

The existing BCCI News API pipeline owns news discovery. This script reads its
published JSON archive, extracts explicit fixture tables only from squad
announcements that name Tilak Varma, and updates only the fixtures array in the
existing renderer. If the archive is stale, missing, or cannot be parsed, the
existing fixture array is preserved.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEWS_FILE = ROOT / "News" / "newsjson.json"
JS_FILE = ROOT / "matches" / "upcoming-matches.js"
REPORT_FILE = ROOT / "matches" / "upcoming-fixtures-refresh.json"
MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
SERIES = ("West Indies", "New Zealand")


def parse_date(value: str) -> str | None:
    value = str(value or "").strip()
    for fmt in ("%d-%b-%y", "%d-%b-%Y", "%d %b %Y", "%d %B %Y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(value, fmt)
            if parsed.year < 100:
                parsed = parsed.replace(year=2000 + parsed.year)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def parse_time(value: str) -> str:
    value = str(value or "").strip()
    if not value:
        return "19:00"
    match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b", value, re.I)
    if not match:
        return "19:00"
    hour, minute, meridiem = match.groups()
    hour, minute = int(hour), int(minute or 0)
    if meridiem.upper() == "PM" and hour != 12:
        hour += 12
    if meridiem.upper() == "AM" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        return "19:00"
    return f"{hour:02d}:{minute:02d}"


def article_text(article: dict) -> str:
    parts = [
        article.get("title", ""),
        article.get("pageTitle", ""),
        article.get("description", ""),
        article.get("fullText", ""),
        article.get("pageText", ""),
    ]
    for block in article.get("contentBlocks", []) or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    return " ".join(str(part) for part in parts if part)


def article_fixtures(article: dict) -> list[dict]:
    title = str(article.get("title") or article.get("pageTitle") or "")
    text = article_text(article)
    if not re.search(r"squad", title, re.I):
        return []
    if not re.search(r"\bTilak\s+Varma\b", text, re.I):
        return []
    url = str(article.get("webviewUrl") or article.get("finalUrl") or "")
    if not url.startswith("https://www.bcci.tv/"):
        return []

    opponent = next(
        (
            name
            for name in SERIES
            if re.search(re.escape(name), title + " " + text, re.I)
        ),
        None,
    )
    if not opponent:
        return []

    # Require the announcement text to identify Tilak in a T20I squad; this
    # avoids publishing fixtures from unrelated squad announcements.
    tilak_pos = re.search(r"Tilak\s+Varma", text, re.I)
    t20i_pos = re.search(r"T20I", text, re.I)
    if not tilak_pos or not t20i_pos:
        return []
    squad_text = text[max(0, tilak_pos.start() - 700) : tilak_pos.end() + 700]
    if not re.search(r"T20I", squad_text, re.I):
        return []

    fixtures = []
    for block in article.get("contentBlocks", []) or []:
        if not isinstance(block, dict) or block.get("type") != "table":
            continue
        rows = block.get("rows")
        if not isinstance(rows, list) or len(rows) < 2:
            continue
        header = [
            re.sub(r"\s+", " ", str(cell or "")).strip().lower() for cell in rows[0]
        ]
        match_i = next(
            (
                i
                for i, cell in enumerate(header)
                if cell == "match" or cell.endswith("match")
            ),
            None,
        )
        date_i = next(
            (
                i
                for i, cell in enumerate(header)
                if cell == "date" or cell.startswith("date ")
            ),
            None,
        )
        venue_i = next(
            (i for i, cell in enumerate(header) if cell in {"venue", "ground"}), None
        )
        time_i = next((i for i, cell in enumerate(header) if "time" in cell), None)
        if match_i is None or date_i is None or venue_i is None:
            continue
        for row in rows[1:]:
            if not isinstance(row, list) or max(match_i, date_i, venue_i) >= len(row):
                continue
            match_label = str(row[match_i] or "").strip()
            date = parse_date(str(row[date_i] or ""))
            venue = str(row[venue_i] or "").strip()
            if not date or not venue or not re.search(r"T20I", match_label, re.I):
                continue
            time_value = (
                str(row[time_i] or "")
                if time_i is not None and time_i < len(row)
                else ""
            )
            fixtures.append(
                {
                    "date": date,
                    "label": datetime.strptime(date, "%Y-%m-%d").strftime(
                        "%a, %-d %b %Y"
                    ),
                    "match": match_label,
                    "opponent": opponent,
                    "venue": venue,
                    "time": parse_time(time_value),
                    "source": url,
                }
            )
    # Some BCCI article pages expose their schedule in pageText but the news
    # formatter does not produce contentBlocks table rows. Parse only the
    # explicitly pipe-delimited schedule table as a conservative fallback.
    if not fixtures:
        page_text = str(article.get("pageText") or article.get("fullText") or "")
        cells = [re.sub(r"\s+", " ", cell).strip() for cell in page_text.split("|")]
        for i in range(len(cells)):
            window = [cell.lower() for cell in cells[i : i + 6]]
            if len(window) >= 5 and "date" in window and "match" in window and "venue" in window:
                header = window
                date_i = next(j for j, cell in enumerate(header) if cell == "date")
                match_i = next(j for j, cell in enumerate(header) if cell == "match")
                venue_i = next(j for j, cell in enumerate(header) if cell == "venue")
                time_i = next((j for j, cell in enumerate(header) if "time" in cell), None)
                day_i = next((j for j, cell in enumerate(header) if cell in {"day", "day of week"}), None)
                row_width = len(header)
                cursor = i + row_width
                while cursor + row_width <= len(cells):
                    row = cells[cursor : cursor + row_width]
                    if not row or not re.fullmatch(r"\d{1,2}", row[0]):
                        break
                    date = parse_date(row[date_i] if date_i < len(row) else "")
                    match_label = row[match_i] if match_i < len(row) else ""
                    venue = row[venue_i] if venue_i < len(row) else ""
                    time_value = row[time_i] if time_i is not None and time_i < len(row) else ""
                    if date and venue and re.search(r"T20I", match_label, re.I):
                        fixtures.append({
                            "date": date,
                            "label": datetime.strptime(date, "%Y-%m-%d").strftime("%a, %-d %b %Y"),
                            "match": match_label,
                            "opponent": opponent,
                            "venue": venue,
                            "time": parse_time(time_value),
                            "source": url,
                        })
                    cursor += row_width
                if fixtures:
                    break
    return fixtures


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_fixture(fixture: dict) -> str:
    fields = ("date", "label", "match", "opponent", "venue", "time", "source")
    return (
        "    {\n"
        + ",\n".join(f"      {key}: {js_string(str(fixture[key]))}" for key in fields)
        + "\n    }"
    )


def main() -> None:
    if not NEWS_FILE.exists():
        raise SystemExit("News/newsjson.json is missing; refusing to change fixtures.")
    if not JS_FILE.exists():
        raise SystemExit(
            "matches/upcoming-matches.js is missing; refusing to create a replacement."
        )

    news = json.loads(NEWS_FILE.read_text(encoding="utf-8"))
    existing_js = JS_FILE.read_text(encoding="utf-8")
    if not isinstance(news, dict) or not isinstance(news.get("news"), list):
        raise SystemExit(
            "News JSON has an unexpected structure; existing fixtures preserved."
        )

    candidates = []
    for article in news["news"]:
        if isinstance(article, dict):
            candidates.extend(article_fixtures(article))

    # Newer announcements win when the same match appears more than once.
    unique = {}
    for fixture in candidates:
        unique[(fixture["date"], fixture["opponent"], fixture["match"])] = fixture
    fixtures = sorted(unique.values(), key=lambda row: (row["date"], row["match"]))
    # Only use fixtures from the current/future date onward. Past matches are
    # not needed in the public Upcoming Matches list.
    today = datetime.now().date().isoformat()
    fixtures = [fixture for fixture in fixtures if fixture["date"] >= today]

    status = "updated-from-news-json" if fixtures else "no-verified-fixtures-preserved"
    changed = False
    if fixtures:
        replacement = (
            "  const fixtures = [\n"
            + ",\n".join(render_fixture(f) for f in fixtures)
            + "\n  ];"
        )
        updated_js, count = re.subn(
            r"  const fixtures = \[.*?\n  \];",
            lambda _: replacement,
            existing_js,
            count=1,
            flags=re.S,
        )
        if count != 1:
            raise SystemExit(
                "Could not safely locate fixtures array; no files changed."
            )
        changed = updated_js != existing_js
        if changed:
            JS_FILE.write_text(updated_js, encoding="utf-8")

    report = {
        "source": "News/newsjson.json (BCCI News API pipeline)",
        "newsUpdatedAt": news.get("updatedAt"),
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "fixtureCount": len(fixtures),
        "fixtures": fixtures,
        "publicJsChanged": changed,
        "note": (
            "Fixtures were extracted only from squad announcement articles that name Tilak Varma and include explicit T20I fixture tables."
            if fixtures
            else "No safe future fixtures could be extracted from News/newsjson.json; the existing public fixture list was preserved."
        ),
    }
    REPORT_FILE.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Upcoming fixtures refresh: {status}; fixtures={len(fixtures)}; JS changed={changed}"
    )


if __name__ == "__main__":
    main()
