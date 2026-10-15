#!/usr/bin/env python3
"""Build Upcoming Matches from squad-confirmed fixtures in News/newsjson.json.

The existing BCCI News API pipeline owns news discovery. This script reads its
published JSON archive, extracts explicit fixture tables only from squad
announcements that name Tilak Varma, and updates the canonical fixture snapshot.
If the archive is stale, missing, or cannot be parsed, the existing future
fixtures are preserved.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
NEWS_FILE = ROOT / "News" / "newsjson.json"
REPORT_FILE = ROOT / "matches" / "upcoming-fixtures-refresh.json"
BCCI_FIXTURES_FILE = ROOT / "matches" / "bcci-stats-fixtures.json"
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
OPPONENTS = (
    "Afghanistan",
    "Australia",
    "Bangladesh",
    "England",
    "Ireland",
    "New Zealand",
    "Pakistan",
    "South Africa",
    "Sri Lanka",
    "West Indies",
    "Zimbabwe",
    "Nepal",
    "Netherlands",
    "Scotland",
    "Namibia",
    "Canada",
    "United States",
    "United Arab Emirates",
    "Oman",
    "Hong Kong",
    "Uganda",
    "Kenya",
    "Papua New Guinea",
    "Japan",
)


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
    """Return a verified 24-hour time, or an empty string when it is unknown."""
    value = str(value or "").strip()
    if not value:
        return ""
    match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b", value, re.I)
    if match:
        hour, minute, meridiem = match.groups()
        hour, minute = int(hour), int(minute or 0)
        if hour < 1 or hour > 12 or minute > 59:
            return ""
        if meridiem.upper() == "PM" and hour != 12:
            hour += 12
        if meridiem.upper() == "AM" and hour == 12:
            hour = 0
        return f"{hour:02d}:{minute:02d}"
    # Accept explicit 24-hour clock values only; never invent a default time.
    match = re.search(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)", value)
    if not match:
        return ""
    hour, minute = map(int, match.groups())
    return f"{hour:02d}:{minute:02d}"


def clean_venue(value: str) -> str:
    """Strip article text accidentally appended to a schedule table's last venue."""
    venue = re.sub(r"\s+", " ", str(value or "")).strip()
    venue = re.split(
        r"\s+(?:Rest of India squad:|India A squad:|DEVAJIT SAIKIA)",
        venue,
        maxsplit=1,
        flags=re.I,
    )[0].strip()
    return venue


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

    # Resolve the opponent from the official BCCI announcement title/body.
    # Never infer a team from a URL slug or an unrelated article.
    opponent = next(
        (
            name
            for name in OPPONENTS
            if re.search(r"\b" + re.escape(name) + r"\b", title + " " + text, re.I)
        ),
        None,
    )
    if not opponent:
        return []

    # Require an official international squad announcement naming Tilak and a
    # recognised format; this supports T20I, ODI and Test schedule tables.
    tilak_pos = re.search(r"Tilak\s+Varma", text, re.I)
    format_match = re.search(r"\b(T20I|ODI|Test)\b", title + " " + text, re.I)
    if not tilak_pos or not format_match:
        return []
    squad_text = text[max(0, tilak_pos.start() - 1000) : tilak_pos.end() + 1000]
    if not re.search(r"\b(T20I|ODI|Test)\b", squad_text, re.I):
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
            venue = clean_venue(str(row[venue_i] or ""))
            if (
                not date
                or not venue
                or not re.search(r"\b(T20I|ODI|Test)\b", match_label, re.I)
            ):
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
                    "newsUrl": "/News-details/index.html?id="
                    + quote(str(article.get("id") or "")),
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
            if (
                len(window) >= 5
                and "date" in window
                and "match" in window
                and "venue" in window
            ):
                header = window
                date_i = next(j for j, cell in enumerate(header) if cell == "date")
                match_i = next(j for j, cell in enumerate(header) if cell == "match")
                venue_i = next(j for j, cell in enumerate(header) if cell == "venue")
                time_i = next(
                    (j for j, cell in enumerate(header) if "time" in cell), None
                )
                day_i = next(
                    (
                        j
                        for j, cell in enumerate(header)
                        if cell in {"day", "day of week"}
                    ),
                    None,
                )
                row_width = len(header)
                cursor = i + row_width
                while cursor + row_width <= len(cells):
                    row = cells[cursor : cursor + row_width]
                    if not row or not re.fullmatch(r"\d{1,2}", row[0]):
                        break
                    date = parse_date(row[date_i] if date_i < len(row) else "")
                    match_label = row[match_i] if match_i < len(row) else ""
                    venue = row[venue_i] if venue_i < len(row) else ""
                    # BCCI pageText may append article text to the final venue.
                    venue = clean_venue(venue)
                    time_value = (
                        row[time_i] if time_i is not None and time_i < len(row) else ""
                    )
                    if (
                        date
                        and venue
                        and re.search(r"\b(T20I|ODI|Test)\b", match_label, re.I)
                    ):
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
                                "newsUrl": "/News-details/index.html?id="
                                + quote(str(article.get("id") or "")),
                            }
                        )
                    cursor += row_width
                if fixtures:
                    break
    return fixtures


def normalise_match_text(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def bcci_fixture_for(news_fixture: dict, bcci_fixtures: list[dict]) -> dict | None:
    """Only enrich a squad-confirmed news fixture with an exact BCCI fixture match."""
    news_date = str(news_fixture.get("date") or "")
    news_match = normalise_match_text(news_fixture.get("match"))
    news_opponent = normalise_match_text(news_fixture.get("opponent"))
    if not news_date or not news_match or not news_opponent:
        return None
    for row in bcci_fixtures:
        if not isinstance(row, dict):
            continue
        if str(row.get("date") or "") != news_date:
            continue
        if normalise_match_text(row.get("match")) != news_match:
            continue
        team = normalise_match_text(row.get("team"))
        opponent = normalise_match_text(row.get("opponent"))
        sides = {team, opponent}
        if "india" not in sides or news_opponent not in sides or len(sides) != 2:
            continue
        # BCCI's fixture row is the authority for schedule fields and IDs.
        return {
            **row,
            "date": row.get("date") or news_fixture.get("date"),
            "label": row.get("label") or news_fixture.get("label"),
            "match": row.get("match") or news_fixture.get("match"),
            "team": "India",
            "opponent": (
                row.get("opponent")
                if normalise_match_text(row.get("team")) == "india"
                else row.get("team")
            )
            or news_fixture.get("opponent"),
            "venue": row.get("venue") or "",
            "time": row.get("time") or "",
            "source": row.get("source") or "",
            "newsUrl": news_fixture.get("newsUrl") or "",
            "squadSource": news_fixture.get("source") or "",
            "tilakInSquad": True,
            "confirmationSource": "BCCI squad announcement naming Tilak Varma",
        }
    return None


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_fixture(fixture: dict) -> str:
    fields = (
        "date",
        "label",
        "match",
        "opponent",
        "venue",
        "time",
        "source",
        "newsUrl",
    )
    return (
        "    {\n"
        + ",\n".join(f"      {key}: {js_string(str(fixture[key]))}" for key in fields)
        + "\n    }"
    )


def main() -> None:
    if not NEWS_FILE.exists():
        raise SystemExit("News/newsjson.json is missing; refusing to change fixtures.")
    news = json.loads(NEWS_FILE.read_text(encoding="utf-8"))
    if not isinstance(news, dict) or not isinstance(news.get("news"), list):
        raise SystemExit(
            "News JSON has an unexpected structure; existing fixtures preserved."
        )

    candidates = []
    for article in news["news"]:
        if isinstance(article, dict):
            candidates.extend(article_fixtures(article))

    # Newer squad announcements win when the same match appears more than once.
    unique = {}
    for fixture in candidates:
        unique[(fixture["date"], fixture["opponent"], fixture["match"])] = fixture
    news_confirmed = sorted(
        unique.values(), key=lambda row: (row["date"], row["match"])
    )

    # News confirms Tilak's selection; BCCI Stats supplies canonical schedule
    # fields. Require exact date + match label + India/opponent pair; never guess.
    bcci_fixtures = []
    bcci_checked_at = None
    if BCCI_FIXTURES_FILE.exists():
        try:
            bcci_payload = json.loads(BCCI_FIXTURES_FILE.read_text(encoding="utf-8"))
            if bcci_payload.get("status") == "updated-from-bcci-stats":
                bcci_fixtures = bcci_payload.get("fixtures", [])
                bcci_checked_at = bcci_payload.get("checkedAt")
        except (json.JSONDecodeError, OSError, AttributeError):
            bcci_fixtures = []
            bcci_checked_at = None
    fixtures = []
    unmatched = []
    for news_fixture in news_confirmed:
        matched = bcci_fixture_for(news_fixture, bcci_fixtures)
        if matched:
            fixtures.append(matched)
        elif str(news_fixture.get("date") or "") >= datetime.now().date().isoformat():
            unmatched.append(
                {
                    "date": news_fixture.get("date"),
                    "match": news_fixture.get("match"),
                    "opponent": news_fixture.get("opponent"),
                    "source": news_fixture.get("source"),
                }
            )

    today = datetime.now().date().isoformat()
    fixtures = [fixture for fixture in fixtures if fixture["date"] >= today]
    unmatched = [row for row in unmatched if str(row.get("date") or "") >= today]

    previous_report = {}
    if REPORT_FILE.exists():
        try:
            previous_report = json.loads(REPORT_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous_report = {}
    # Match Centre reads this JSON snapshot directly. Preserve prior future
    # fixtures if the source is stale or no safe schedule rows can be extracted.
    if not fixtures:
        fixtures = [
            row
            for row in previous_report.get("fixtures", [])
            if isinstance(row, dict)
            and row.get("tilakInSquad") is True
            and row.get("confirmationSource")
            == "BCCI squad announcement naming Tilak Varma"
            and str(row.get("date", "")) >= today
        ]
        status = (
            "no-exact-bcci-match-preserved-verified"
            if fixtures
            else "no-exact-bcci-match"
        )
    else:
        status = "updated-from-news-and-bcci-json"
    changed = fixtures != previous_report.get("fixtures", [])
    report = {
        "source": "News/newsjson.json squad confirmation + matches/bcci-stats-fixtures.json exact fixture match",
        "newsUpdatedAt": news.get("updatedAt"),
        "bcciFixturesCheckedAt": bcci_checked_at,
        "unmatchedNewsFixtures": unmatched,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "fixtureCount": len(fixtures),
        "fixtures": fixtures,
        "publicJsChanged": False,
        "note": (
            "News JSON confirms Tilak Varma's squad selection; every displayed fixture is joined to BCCI Stats by exact date, match label, and India/opponent pair."
            if status == "updated-from-news-and-bcci-json"
            else "No exact BCCI fixture match was available. Only previously verified future fixtures were preserved; unmatched fixtures are not displayed."
        ),
    }
    REPORT_FILE.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"Upcoming fixtures refresh: {status}; confirmed News fixtures={len(news_confirmed)}; "
        f"exact BCCI matches={len(fixtures)}; unmatched={len(unmatched)}; snapshot changed={changed}"
    )


if __name__ == "__main__":
    main()
