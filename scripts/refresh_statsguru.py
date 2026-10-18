#!/usr/bin/env python3
"""Refresh Tilak Varma batting Statsguru data from ESPNcricinfo every 12 hours.

ESPNcricinfo Statsguru supplies these tables for T20I, ODI, T20, FC and List A.
Optional formats may be blocked; if a source is unavailable or markup changes, the last
successfully saved snapshot is preserved and no values are invented.
"""
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "site-data.json"
PLAYER_ID = "1170265"
BASE = "https://stats.espncricinfo.com/ci/engine/player/" + PLAYER_ID + ".html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
FORMATS = {"T20I": 3, "ODI": 2, "FC": 4, "List A": 5, "T20": 6}


def stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def number(value):
    value = clean(value).replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", value)
    if not match:
        return None
    parsed = float(match.group())
    return int(parsed) if parsed.is_integer() else parsed


def score(value):
    value = clean(value)
    if not value:
        return None, False
    match = re.search(r"(\d+)\s*(\*)?", value)
    if not match:
        return value, False
    return int(match.group(1)), bool(match.group(2))


class TableParser(HTMLParser):
    """Extract HTML tables while safely ignoring nested-table structure."""

    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None
        self.table_depth = 0
        self.in_anchor = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table":
            if self.table_depth == 0:
                self.table = []
            self.table_depth += 1
            return
        if self.table_depth != 1:
            return
        if tag == "tr":
            self.row = []
        elif self.row is not None and tag in ("td", "th"):
            self.cell = {"text": [], "links": []}
        elif self.cell is not None and tag == "a":
            href = attrs.get("href")
            if href:
                self.cell["links"].append(
                    urllib.parse.urljoin("https://stats.espncricinfo.com", href)
                )
            self.in_anchor = True

    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "a":
            self.in_anchor = False
            return
        if tag == "table":
            if self.table_depth > 0:
                self.table_depth -= 1
                if self.table_depth == 0 and self.table is not None:
                    if self.table:
                        self.tables.append(self.table)
                    self.table = None
            return
        if self.table_depth != 1:
            return
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(
                {
                    "text": clean(" ".join(self.cell["text"])),
                    "links": self.cell["links"],
                }
            )
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.table.append(self.row)
            self.row = None


def fetch(url, retries=6):
    """Fetch Statsguru with rate-limit-aware backoff for temporary failures.

    Respect Retry-After when supplied. 429 and 5xx responses get a much
    longer cooldown than ordinary network errors; non-retryable HTTP 4xx
    responses fail immediately so we do not hammer a rejected endpoint.
    """
    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as response:
                return response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            last_error = exc
            retryable = exc.code == 429 or 500 <= exc.code <= 599
            if not retryable or attempt >= retries - 1:
                raise
            retry_after = exc.headers.get("Retry-After")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            retry_after = None
            if attempt >= retries - 1:
                raise
        # Back off aggressively on throttling; honor Retry-After where possible.
        if isinstance(last_error, urllib.error.HTTPError) and last_error.code == 429:
            delay = min(60, 10 * (2**attempt))
        else:
            delay = min(30, 3 * (2**attempt))
        try:
            if retry_after:
                delay = max(delay, min(120, int(retry_after)))
        except (TypeError, ValueError):
            pass
        print(
            "Temporary Statsguru fetch error; retrying in "
            + str(delay)
            + "s (attempt "
            + str(attempt + 2)
            + "/"
            + str(retries)
            + "): "
            + str(last_error)
        )
        time.sleep(delay)
    raise last_error


def stats_url(match_class, view=None, page=1, kind="batting"):
    # ESPNcricinfo's legacy Statsguru endpoint uses semicolon-separated query
    # parameters. Encoding the whole filter string as the class value causes
    # HTTP 400, so preserve the legacy query syntax.
    query = "class=" + str(match_class) + ";template=results;type=" + str(kind)
    if view:
        query += ";view=" + view
    if page > 1:
        query += ";page=" + str(page)
    return BASE + "?" + query


def parse_tables(page):
    parser = TableParser()
    parser.feed(page)
    return parser.tables


def cell_text(row):
    return [cell["text"] for cell in row]


def parse_career_summary(page):
    tables = parse_tables(page)
    for table in tables:
        for index, row in enumerate(table):
            headers = [clean(x).casefold().replace(".", "") for x in cell_text(row)]
            if not any(x in {"mat", "matches"} for x in headers) or not any(
                x in {"runs", "r"} for x in headers
            ):
                continue
            col = {}
            for i, h in enumerate(headers):
                if h in {"mat", "matches"}:
                    col["matches"] = i
                elif h in {"inns", "inn"}:
                    col["innings"] = i
                elif h in {"no", "not out"}:
                    col["notOuts"] = i
                elif h in {"runs", "r"}:
                    col["runs"] = i
                elif h in {"hs", "high score"}:
                    col["highestScore"] = i
                elif h in {"ave", "avg", "bat av"}:
                    col["average"] = i
                elif h in {"bf", "balls"}:
                    col["balls"] = i
                elif h in {"sr", "strike rate"}:
                    col["strikeRate"] = i
                elif h in {"100", "100s"}:
                    col["hundreds"] = i
                elif h in {"50", "50s"}:
                    col["fifties"] = i
                elif h in {"4s", "fours"}:
                    col["fours"] = i
                elif h in {"6s", "sixes"}:
                    col["sixes"] = i
            if not {"matches", "runs", "highestScore"}.issubset(col):
                continue
            for candidate in table[index + 1 :]:
                values = cell_text(candidate)
                if len(values) <= max(col.values()):
                    continue
                joined = " ".join(values).casefold()
                if "overall" not in joined and not re.search(
                    r"\b(?:career|total)\b", joined
                ):
                    continue
                result = {}
                for key, i in col.items():
                    value = values[i]
                    result[key] = value if key == "highestScore" else number(value)
                if result.get("runs") is not None and result.get("matches") is not None:
                    return result
    return None


def find_innings_table(tables):
    for table in tables:
        for i, row in enumerate(table):
            headers = [clean(x).casefold() for x in cell_text(row)]
            if (
                any("opposition" in x for x in headers)
                and any("ground" in x for x in headers)
                and any("date" in x for x in headers)
                and any(x in {"bat1", "batting", "score", "runs"} for x in headers)
            ):
                return table, i, headers
    return None, None, None


def parse_career_breakdown(page):
    """Parse Statsguru career summary split rows across its adjacent tables."""
    wanted = {
        "span",
        "mat",
        "inns",
        "no",
        "runs",
        "hs",
        "ave",
        "bf",
        "sr",
        "100",
        "50",
        "0",
        "4s",
        "6s",
    }
    output = []
    seen = set()
    last_indexes = None
    parsed_tables = parse_tables(page)
    for table in parsed_tables:
        header_index = None
        indexes = {}
        for ri, row in enumerate(table):
            headers = [clean(x).casefold().replace(".", "") for x in cell_text(row)]
            normalized = [re.sub(r"[^a-z0-9]+", "", x) for x in headers]
            if not {"span", "mat", "runs", "hs", "ave"}.issubset(set(normalized)):
                continue
            header_index = ri
            for i, h in enumerate(normalized):
                if h in {"grouping", "group", "category"}:
                    indexes["group"] = i
                elif h == "span":
                    indexes["span"] = i
                elif h in {"mat", "matches"}:
                    indexes["matches"] = i
                elif h in {"inns", "innings"}:
                    indexes["innings"] = i
                elif h in {"no", "notout", "notouts"}:
                    indexes["notOuts"] = i
                elif h in {"runs", "r"}:
                    indexes["runs"] = i
                elif h in {"hs", "highscore"}:
                    indexes["highestScore"] = i
                elif h in {"ave", "avg", "batav"}:
                    indexes["average"] = i
                elif h in {"bf", "balls"}:
                    indexes["balls"] = i
                elif h in {"sr", "strikerate"}:
                    indexes["strikeRate"] = i
                elif h in {"100", "100s"}:
                    indexes["hundreds"] = i
                elif h in {"50", "50s"}:
                    indexes["fifties"] = i
                elif h in {"0", "ducks"}:
                    indexes["ducks"] = i
                elif h in {"4s", "fours"}:
                    indexes["fours"] = i
                elif h in {"6s", "sixes"}:
                    indexes["sixes"] = i
            last_indexes = indexes
            break
        if header_index is None:
            # Statsguru renders many split groups as separate adjacent tables
            # without repeating their header. Reuse the official header map.
            if last_indexes is None:
                continue
            indexes = last_indexes
            data_start = 0
        else:
            data_start = header_index + 1
        max_index = max(indexes.values(), default=0)
        for row in table[data_start:]:
            values = cell_text(row)
            if len(values) <= max_index:
                continue
            group_index = indexes.get("group", 0)
            group = values[group_index].strip()
            if not group or re.sub(r"[^a-z0-9]+", "", group.casefold()) in wanted:
                continue
            span = (
                values[indexes["span"]].strip()
                if indexes.get("span", 999) < len(values)
                else ""
            )
            if not re.search(r"\d{4}", span):
                continue
            item = {"group": group, "span": span}
            for key, i in indexes.items():
                if key in {"group", "span"} or i >= len(values):
                    continue
                val = values[i]
                item[key] = val if key == "highestScore" else number(val)
            if item.get("runs") is None or item.get("matches") is None:
                continue
            key = (
                item.get("group"),
                item.get("span"),
                item.get("matches"),
                item.get("runs"),
            )
            if key not in seen:
                seen.add(key)
                output.append(item)
    return output


def parse_innings_page(page, fmt):
    tables = parse_tables(page)
    table, header_index, headers = find_innings_table(tables)
    if table is None:
        return []
    indexes = {}
    for i, header in enumerate(headers):
        h = header.casefold()
        normalized = re.sub(r"[^a-z0-9]+", "", h)
        if normalized in {"bat1", "batting", "score", "runs"}:
            indexes["score"] = i
        elif "opposition" in normalized:
            indexes["opposition"] = i
        elif "ground" in normalized:
            indexes["ground"] = i
        elif "date" in normalized:
            indexes["date"] = i
        elif normalized in {"mins", "min", "minutes"}:
            indexes["minutes"] = i
        elif normalized in {"bf", "balls", "ballsFaced"}:
            indexes["balls"] = i
        elif normalized in {"4s", "fours"}:
            indexes["fours"] = i
        elif normalized in {"6s", "sixes"}:
            indexes["sixes"] = i
        elif normalized in {"sr", "strikerate"}:
            indexes["strikeRate"] = i
        elif normalized in {"pos", "position"}:
            indexes["position"] = i
        elif normalized in {"dismissal", "howout", "dismissed"}:
            indexes["dismissal"] = i
        elif normalized in {"inns", "inn", "innings"}:
            indexes["innings"] = i
        elif normalized in {"wkts", "wickets"}:
            indexes["wickets"] = i
        elif normalized in {"ct", "catches"}:
            indexes["catches"] = i
        elif normalized in {"st", "stumpings"}:
            indexes["stumpings"] = i
        elif normalized in {"match", "scorecard", "card"}:
            indexes["match"] = i
    required = {"score", "opposition", "ground", "date"}
    if not required.issubset(indexes):
        return []
    rows = []
    for row in table[header_index + 1 :]:
        values = cell_text(row)
        if len(values) <= max(indexes.values()):
            continue
        date = values[indexes["date"]]
        opposition = values[indexes["opposition"]]
        ground = values[indexes["ground"]]
        raw_score = values[indexes["score"]]
        if not date or not opposition or not ground:
            continue
        # Exclude repeated header rows and footer summaries.
        if (
            date.casefold() in {"start date", "date"}
            or opposition.casefold() == "opposition"
        ):
            continue
        runs, not_out = score(raw_score)
        match_url = None
        if "match" in indexes and indexes["match"] < len(row):
            links = row[indexes["match"]].get("links", [])
            match_url = next(
                (
                    url
                    for url in links
                    if "engine/match" in url
                    or "scorecard" in url
                    or "full-scorecard" in url
                ),
                None,
            )
        if not match_url:
            for cell in row:
                for url in cell.get("links", []):
                    if (
                        "engine/match" in url
                        or "scorecard" in url
                        or "full-scorecard" in url
                    ):
                        match_url = url
                        break
                if match_url:
                    break
        item = {
            "date": date,
            "format": fmt,
            "opposition": opposition,
            "ground": ground,
            "score": raw_score or "—",
            "runs": runs,
            "notOut": not_out,
            "minutes": (
                values[indexes["minutes"]]
                if "minutes" in indexes and indexes["minutes"] < len(values)
                else "—"
            ),
            "balls": (
                number(values[indexes["balls"]])
                if "balls" in indexes and indexes["balls"] < len(values)
                else None
            ),
            "fours": (
                number(values[indexes["fours"]])
                if "fours" in indexes and indexes["fours"] < len(values)
                else None
            ),
            "sixes": (
                number(values[indexes["sixes"]])
                if "sixes" in indexes and indexes["sixes"] < len(values)
                else None
            ),
            "strikeRate": (
                number(values[indexes["strikeRate"]])
                if "strikeRate" in indexes and indexes["strikeRate"] < len(values)
                else None
            ),
            "position": (
                values[indexes["position"]]
                if "position" in indexes and indexes["position"] < len(values)
                else "—"
            ),
            "dismissal": (
                values[indexes["dismissal"]]
                if "dismissal" in indexes and indexes["dismissal"] < len(values)
                else "—"
            ),
            "innings": (
                values[indexes["innings"]]
                if "innings" in indexes and indexes["innings"] < len(values)
                else "—"
            ),
            "wickets": (
                values[indexes["wickets"]]
                if "wickets" in indexes and indexes["wickets"] < len(values)
                else "—"
            ),
            "catches": (
                values[indexes["catches"]]
                if "catches" in indexes and indexes["catches"] < len(values)
                else "—"
            ),
            "stumpings": (
                values[indexes["stumpings"]]
                if "stumpings" in indexes and indexes["stumpings"] < len(values)
                else "—"
            ),
            "source": "ESPNcricinfo Statsguru",
        }
        if match_url:
            item["matchUrl"] = match_url
        rows.append(item)
    return rows


def date_sort_key(value):
    """Sort Statsguru dates safely; unknown date formats remain at the bottom."""
    value = clean(value)
    # Range labels such as "06–10 Sep 2026" and "30 Dec 2018 - 02 Jan 2019".
    range_end = re.search(
        r"\d{1,2}\s+[A-Za-z]{3,}\s+\d{4}\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})",
        value,
    )
    if range_end:
        try:
            return (
                datetime.strptime(" ".join(range_end.groups()), "%d %b %Y")
                .date()
                .toordinal()
            )
        except ValueError:
            pass
    same_month_range = re.search(
        r"\d{1,2}\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})", value
    )
    if same_month_range:
        try:
            return (
                datetime.strptime(" ".join(same_month_range.groups()), "%d %b %Y")
                .date()
                .toordinal()
            )
        except ValueError:
            pass
    for pattern in ("%d %b %Y", "%d-%b-%Y", "%d %B %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern).date().toordinal()
        except ValueError:
            continue
    match = re.search(r"(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})", value)
    if match:
        try:
            return (
                datetime.strptime(" ".join(match.groups()), "%d %b %Y")
                .date()
                .toordinal()
            )
        except ValueError:
            pass
    return 0


def infer_balls_from_strike_rate(summary):
    """Infer missing balls faced from runs and published strike rate.

    Since Statsguru strike rate is rounded to two decimals, inferred balls are
    approximate; prefer source-reported balls whenever present.
    """
    if not isinstance(summary, dict):
        return summary
    if summary.get("balls") is None:
        runs = summary.get("runs")
        strike_rate = summary.get("strikeRate")
        if (
            isinstance(runs, (int, float))
            and isinstance(strike_rate, (int, float))
            and runs >= 0
            and strike_rate > 0
        ):
            summary["balls"] = round(runs * 100 / strike_rate)
            summary["ballsInferred"] = True
    return summary


def scrape_format(fmt, match_class):
    # The legacy player page's supported view is "innings". It also includes
    # the Career averages table above the match-by-match list.
    first_page = fetch(stats_url(match_class, "innings", 1))
    summary = parse_career_summary(first_page)
    innings = parse_innings_page(first_page, fmt)
    career_breakdown = parse_career_breakdown(first_page)
    # Statsguru exposes the grouped Career summary view separately on some
    # responses. Prefer it when the innings page only exposes the overall row.
    if len(career_breakdown) <= 1:
        try:
            summary_page = fetch(stats_url(match_class, None, 1))
            split_rows = parse_career_breakdown(summary_page)
            if len(split_rows) > len(career_breakdown):
                career_breakdown = split_rows
            summary = parse_career_summary(summary_page) or summary
        except Exception as exc:
            print(
                fmt
                + ": optional grouped-summary view unavailable; using innings page:",
                exc,
            )
    for page_number in range(2, 16):
        if len(innings) < (page_number - 1) * 40:
            break
        page = fetch(stats_url(match_class, "innings", page_number))
        batch = parse_innings_page(page, fmt)
        if not batch:
            break
        existing = {
            (x["date"], x["opposition"], x["ground"], x["score"]) for x in innings
        }
        new_rows = [
            x
            for x in batch
            if (x["date"], x["opposition"], x["ground"], x["score"]) not in existing
        ]
        if not new_rows:
            break
        innings.extend(new_rows)
        if len(batch) < 40:
            break
        time.sleep(0.3)
    if not summary and not innings:
        raise RuntimeError(
            "ESPNcricinfo Statsguru returned no recognizable " + fmt + " tables"
        )
    summary = infer_balls_from_strike_rate(summary)
    return {
        "summary": summary,
        "careerBreakdown": career_breakdown,
        "innings": innings,
        "inningsCount": len(innings),
        "source": "ESPNcricinfo Statsguru",
        "careerUrl": stats_url(match_class, "innings"),
        "inningsUrl": stats_url(match_class, "innings"),
        "matchListUrl": stats_url(match_class, "match"),
        "debut": min(
            innings, key=lambda row: date_sort_key(row.get("date")), default=None
        ),
        "lastMatch": max(
            innings, key=lambda row: date_sort_key(row.get("date")), default=None
        ),
    }


def scrape_domestic_profile_summary(fmt):
    """Read only the selected NDTV domestic-format section for FC or List A.

    The NDTV profile has separate against/where/year tab containers. Career
    totals are derived only from the selected format's opponent table, while
    year rows are read only from that format's year tab. ESPNcricinfo scraping
    and URL construction are deliberately untouched.
    """
    ndtv_url = (
        "https://sports.ndtv.com/cricket/players/112645-tilak-varma-playerprofile/stats"
    )
    secondary_url = "https://dujseks5cqq0r.cloudfront.net/player/tilak-varma/stats"
    format_id = 5 if fmt == "List A" else 4
    section_label = "List_A" if fmt == "List A" else "First-class"
    against_class = "against_ " + section_label
    year_class = "yeardata_ " + section_label

    def norm(value):
        return re.sub(r"[^a-z0-9]+", "", clean(value).casefold())

    def extract_div_section(page, class_name):
        """Return one div (including nested divs) identified by its exact class."""
        start_tag = re.compile(
            r"<div\b(?=[^>]*\bclass\s*=\s*(['\"])[^'\"]*"
            + re.escape(class_name)
            + r"[^'\"]*\1)[^>]*>",
            re.IGNORECASE,
        )
        match = start_tag.search(page)
        if not match:
            return ""
        depth = 1
        token_re = re.compile(r"</?div\b[^>]*>", re.IGNORECASE)
        for token in token_re.finditer(page, match.end()):
            if token.group(0).lower().startswith("</div"):
                depth -= 1
                if depth == 0:
                    return page[match.start() : token.end()]
            elif not token.group(0).rstrip().endswith("/>"):
                depth += 1
        return ""

    def parse_format_tables(page, source_name, url, strict_ndtv=False):
        if strict_ndtv:
            against_html = extract_div_section(page, against_class)
            if not against_html:
                return None
            against_tables = parse_tables(against_html)
            year_html = extract_div_section(page, year_class)
            year_tables = parse_tables(year_html) if year_html else []
        else:
            # Secondary profile fallback is retained for compatibility if NDTV
            # does not expose the expected section markup.
            against_tables = parse_tables(page)
            year_tables = []

        def read_rows(tables):
            found = []
            for table in tables:
                header_index = None
                columns = {}
                for ri, row in enumerate(table):
                    headers = [norm(value) for value in cell_text(row)]
                    if {"m", "i", "r", "hs"}.issubset(set(headers)) and "id" in headers:
                        header_index = ri
                        for i, h in enumerate(headers):
                            if h in {"m", "matches"}:
                                columns["matches"] = i
                            elif h in {"i", "inn", "inns", "innings"}:
                                columns["innings"] = i
                            elif h in {"no", "notout", "notouts"}:
                                columns["notOuts"] = i
                            elif h in {"r", "runs"}:
                                columns["runs"] = i
                            elif h in {"hs", "highscore"}:
                                columns["highestScore"] = i
                            elif h in {"100s", "100", "hundreds"}:
                                columns["hundreds"] = i
                            elif h in {"50s", "50", "fifties"}:
                                columns["fifties"] = i
                            elif h in {"4s", "fours"}:
                                columns["fours"] = i
                            elif h in {"6s", "sixes"}:
                                columns["sixes"] = i
                            elif h in {"avg", "average", "batavg"}:
                                columns["average"] = i
                            elif h in {"sr", "strikerate"}:
                                columns["strikeRate"] = i
                            elif h in {"ct", "catches"}:
                                columns["catches"] = i
                            elif h in {"st", "stumpings"}:
                                columns["stumpings"] = i
                            elif h == "id":
                                columns["formatId"] = i
                        break
                required = {"matches", "innings", "runs", "highestScore", "formatId"}
                if header_index is None or not required.issubset(columns):
                    continue
                for row in table[header_index + 1 :]:
                    values = cell_text(row)
                    if len(values) <= max(columns.values()):
                        continue
                    if clean(values[columns["formatId"]]) != str(format_id):
                        continue
                    label = clean(values[0]) if values else ""
                    if not label or norm(label) in {
                        "home",
                        "away",
                        "neutral",
                        "overall",
                        "career",
                        "total",
                        "battingfieldingperformance",
                        "bowlingperformance",
                    }:
                        continue
                    item = {"group": label, "span": "All-time"}
                    for key, column in columns.items():
                        if key == "formatId" or column >= len(values):
                            continue
                        raw = clean(values[column])
                        item[key] = raw if key == "highestScore" else number(raw)
                    if item.get("matches") is not None and item.get("runs") is not None:
                        found.append(item)
            return found

        opponent_rows = read_rows(against_tables)
        if strict_ndtv:
            # The against tab is a disjoint opponent partition, so only its rows
            # may contribute to the domestic career total.
            source_rows = opponent_rows
            yearly_rows = []
            for row in read_rows(year_tables):
                if re.fullmatch(r"\d{4}", str(row.get("group", ""))):
                    yearly_rows.append({**row, "groupType": "year"})
        else:
            # Preserve the secondary source's prior behavior if NDTV markup is absent.
            source_rows = opponent_rows
            yearly_rows = []

        if len(source_rows) < 1:
            return None

        summary = {}
        additive = (
            "matches",
            "innings",
            "notOuts",
            "runs",
            "hundreds",
            "fifties",
            "fours",
            "sixes",
            "catches",
            "stumpings",
        )
        for key in additive:
            values = [row.get(key) for row in source_rows if row.get(key) is not None]
            if values:
                summary[key] = sum(values)
        scores = []
        for row in source_rows:
            raw = clean(row.get("highestScore"))
            match = re.search(r"(\d+)\s*(\*)?", raw)
            if match:
                scores.append((int(match.group(1)), bool(match.group(2)), raw))
        if scores:
            best = max(scores, key=lambda x: (x[0], x[1]))
            summary["highestScore"] = str(best[0]) + ("*" if best[1] else "")
        innings = summary.get("innings")
        not_outs = summary.get("notOuts")
        runs = summary.get("runs")
        if runs is not None and innings is not None and not_outs is not None:
            dismissals = innings - not_outs
            if dismissals > 0:
                summary["average"] = round(runs / dismissals, 2)
        if not summary.get("matches") or summary.get("runs") is None:
            return None
        return {
            "summary": summary,
            "careerBreakdown": [
                {**row, "groupType": "opposition"} for row in source_rows
            ],
            "teamBreakdown": [
                {**row, "groupType": "opposition"} for row in source_rows
            ],
            "yearBreakdown": yearly_rows,
            "innings": [],
            "inningsCount": summary.get("innings") or 0,
            "source": source_name + " (selected domestic format section)",
            "sourceUrl": url,
            "detailStatus": "summary-and-grouped-splits",
            "detailNote": "FC/List A summary uses only the selected format's NDTV opponent table; year breakdown uses that format's year tab. Match-by-match innings are not fabricated.",
            "checkedAt": stamp(),
        }

    # NDTV is the primary domestic fallback. Do not use NDTV's other formats/tabs.
    try:
        page = fetch(ndtv_url)
        result = parse_format_tables(
            page, "NDTV Sports player profile stats", ndtv_url, strict_ndtv=True
        )
        if result:
            return result
    except Exception as exc:
        print(fmt + ": NDTV selected-section fallback failed:", exc)

    # Keep the pre-existing secondary feed as a last resort; ESPNcricinfo logic is
    # not changed. Its format ID is still required before rows can be aggregated.
    try:
        page = fetch(secondary_url)
        result = parse_format_tables(
            page, "Secondary public player profile stats", secondary_url
        )
        if result:
            return result
    except Exception as exc:
        print(fmt + ": secondary domestic profile fallback failed:", exc)
    raise RuntimeError("No verified NDTV/secondary domestic rows for " + fmt)


def parse_fielding_summary(page):
    """Parse the overall fielding totals from a Statsguru fielding table."""
    for table in parse_tables(page):
        for index, row in enumerate(table):
            headers = [
                re.sub(r"[^a-z0-9]+", "", clean(x).casefold()) for x in cell_text(row)
            ]
            if not ({"mat", "matches"} & set(headers)) or not (
                {"ct", "catches"} & set(headers)
            ):
                continue
            cols = {}
            for i, header in enumerate(headers):
                if header in {"mat", "matches"}:
                    cols["matches"] = i
                elif header in {"inns", "inn", "innings"}:
                    cols["innings"] = i
                elif header in {"ct", "catches"}:
                    cols["catches"] = i
                elif header in {"st", "stumpings"}:
                    cols["stumpings"] = i
                elif header in {"ro", "runouts", "runout"}:
                    cols["runOuts"] = i
                elif header in {"dis", "dismissals"}:
                    cols["dismissals"] = i
            if not {"matches", "catches"}.issubset(cols):
                continue
            for candidate in table[index + 1 :]:
                values = cell_text(candidate)
                if len(values) <= max(cols.values()):
                    continue
                if not re.search(
                    r"\b(?:overall|career|total)\b", " ".join(values).casefold()
                ):
                    continue
                result = {key: number(values[i]) for key, i in cols.items()}
                if (
                    result.get("matches") is not None
                    and result.get("catches") is not None
                ):
                    result.setdefault("stumpings", 0)
                    result.setdefault("runOuts", 0)
                    result.setdefault(
                        "dismissals",
                        sum(
                            result.get(k, 0) or 0
                            for k in ("catches", "stumpings", "runOuts")
                        ),
                    )
                    return result
    return None


def parse_fielding_breakdown(page):
    """Parse career fielding split rows, deduplicating by group and span."""
    output, seen = [], set()
    for table in parse_tables(page):
        for index, row in enumerate(table):
            headers = [
                re.sub(r"[^a-z0-9]+", "", clean(x).casefold()) for x in cell_text(row)
            ]
            if "span" not in headers or not ({"ct", "catches"} & set(headers)):
                continue
            cols = {}
            for i, header in enumerate(headers):
                if header in {"group", "grouping", "category"}:
                    cols["group"] = i
                elif header == "span":
                    cols["span"] = i
                elif header in {"mat", "matches"}:
                    cols["matches"] = i
                elif header in {"inns", "inn", "innings"}:
                    cols["innings"] = i
                elif header in {"ct", "catches"}:
                    cols["catches"] = i
                elif header in {"st", "stumpings"}:
                    cols["stumpings"] = i
                elif header in {"ro", "runouts", "runout"}:
                    cols["runOuts"] = i
                elif header in {"dis", "dismissals"}:
                    cols["dismissals"] = i
            if not {"span", "matches", "catches"}.issubset(cols):
                continue
            for candidate in table[index + 1 :]:
                values = cell_text(candidate)
                if len(values) <= max(cols.values()):
                    continue
                group = (
                    clean(values[cols["group"]])
                    if "group" in cols
                    else clean(values[0])
                )
                span = clean(values[cols["span"]])
                if not group or not re.search(r"\d{4}", span):
                    continue
                key = (group, span)
                if key in seen:
                    continue
                item = {"group": group, "span": span}
                for name, column in cols.items():
                    if name not in {"group", "span"}:
                        item[name] = number(values[column])
                if item.get("catches") is None:
                    continue
                item.setdefault("stumpings", 0)
                item.setdefault("runOuts", 0)
                item.setdefault(
                    "dismissals",
                    sum(
                        item.get(k, 0) or 0 for k in ("catches", "stumpings", "runOuts")
                    ),
                )
                seen.add(key)
                output.append(item)
    return output


def parse_fielding_innings(page, fmt):
    """Parse per-innings fielding records from the Statsguru innings table."""
    for table in parse_tables(page):
        header_index, headers = None, []
        for index, row in enumerate(table):
            candidate = [
                re.sub(r"[^a-z0-9]+", "", clean(x).casefold()) for x in cell_text(row)
            ]
            if (
                "opposition" in candidate
                and "ground" in candidate
                and ({"startdate", "date"} & set(candidate))
                and ({"ct", "catches"} & set(candidate))
            ):
                header_index, headers = index, candidate
                break
        if header_index is None:
            continue
        cols = {}
        for i, header in enumerate(headers):
            if header == "opposition":
                cols["opposition"] = i
            elif header == "ground":
                cols["ground"] = i
            elif header in {"startdate", "date"}:
                cols["date"] = i
            elif header in {"inns", "inn", "innings"}:
                cols["innings"] = i
            elif header in {"ct", "catches"}:
                cols["catches"] = i
            elif header in {"st", "stumpings"}:
                cols["stumpings"] = i
            elif header in {"ro", "runouts", "runout"}:
                cols["runOuts"] = i
            elif header in {"dis", "dismissals"}:
                cols["dismissals"] = i
            elif header in {"match", "scorecard", "card"}:
                cols["match"] = i
        if not {"opposition", "ground", "date"}.issubset(cols):
            continue
        records = []
        for row in table[header_index + 1 :]:
            values = cell_text(row)
            if len(values) <= max(cols.values()):
                continue
            date, opposition, ground = (
                clean(values[cols[k]]) for k in ("date", "opposition", "ground")
            )
            if (
                not date
                or not opposition
                or not ground
                or re.sub(r"[^a-z0-9]+", "", date.casefold()) in {"date", "startdate"}
            ):
                continue
            item = {
                "date": date,
                "format": fmt,
                "opposition": opposition,
                "ground": ground,
            }
            for key in ("innings", "catches", "stumpings", "runOuts", "dismissals"):
                if key in cols:
                    item[key] = number(values[cols[key]])
            if not any(
                item.get(key) is not None
                for key in ("catches", "stumpings", "runOuts", "dismissals")
            ):
                continue
            item.setdefault("catches", 0)
            item.setdefault("stumpings", 0)
            item.setdefault("runOuts", 0)
            item.setdefault(
                "dismissals",
                sum(item.get(k, 0) or 0 for k in ("catches", "stumpings", "runOuts")),
            )
            links = []
            if "match" in cols:
                links.extend(row[cols["match"]].get("links", []))
            if not links:
                for cell in row:
                    links.extend(cell.get("links", []))
            match_url = next(
                (
                    url
                    for url in links
                    if "engine/match" in url
                    or "scorecard" in url
                    or "full-scorecard" in url
                ),
                None,
            )
            if match_url:
                item["matchUrl"] = match_url
            item["source"] = "ESPNcricinfo Statsguru"
            records.append(item)
        return records
    return []


def scrape_fielding_format(fmt, match_class):
    first = fetch(stats_url(match_class, "innings", 1, "fielding"))
    summary = parse_fielding_summary(first)
    innings = parse_fielding_innings(first, fmt)
    breakdown = parse_fielding_breakdown(first)
    # Career/series views are sometimes served separately from the innings view.
    try:
        overview = fetch(stats_url(match_class, None, 1, "fielding"))
        summary = parse_fielding_summary(overview) or summary
        grouped = parse_fielding_breakdown(overview)
        if len(grouped) > len(breakdown):
            breakdown = grouped
    except Exception as exc:
        print(fmt + ": optional fielding summary view unavailable:", exc)
    seen = {(r["date"], r["opposition"], r["ground"], r["innings"]) for r in innings}
    for page_no in range(2, 16):
        if len(innings) < (page_no - 1) * 40:
            break
        try:
            page = fetch(stats_url(match_class, "innings", page_no, "fielding"))
        except Exception as exc:
            print(fmt + ": fielding pagination stopped:", exc)
            break
        batch = parse_fielding_innings(page, fmt)
        fresh = [
            r
            for r in batch
            if (r["date"], r["opposition"], r["ground"], r["innings"]) not in seen
        ]
        if not fresh:
            break
        innings.extend(fresh)
        seen.update(
            (r["date"], r["opposition"], r["ground"], r["innings"]) for r in fresh
        )
        if len(batch) < 40:
            break
    if not summary and not innings and not breakdown:
        raise RuntimeError("Statsguru fielding tables could not be parsed for " + fmt)
    summary = summary or {}
    if summary:
        summary.setdefault("catches", sum(r.get("catches", 0) or 0 for r in innings))
        summary.setdefault(
            "stumpings", sum(r.get("stumpings", 0) or 0 for r in innings)
        )
        summary.setdefault("runOuts", sum(r.get("runOuts", 0) or 0 for r in innings))
        summary.setdefault(
            "dismissals",
            sum(summary.get(k, 0) or 0 for k in ("catches", "stumpings", "runOuts")),
        )
    return {
        "summary": summary,
        "careerBreakdown": breakdown,
        "innings": innings,
        "inningsCount": len(innings),
        "source": "ESPNcricinfo Statsguru",
        "careerUrl": stats_url(match_class, None, 1, "fielding"),
        "inningsUrl": stats_url(match_class, "innings", 1, "fielding"),
        "checkedAt": stamp(),
    }


def main():
    if not DATA_FILE.exists():
        raise SystemExit("Missing data/site-data.json")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    saved = data.get("statsguru") if isinstance(data.get("statsguru"), dict) else {}
    old_formats = saved.get("formats") if isinstance(saved.get("formats"), dict) else {}
    new_formats = dict(old_formats)
    success = []
    errors = []
    optional_warnings = []
    optional_formats = {"FC", "List A"}
    for fmt, match_class in FORMATS.items():
        # Avoid bursting consecutive requests into Statsguru, which frequently
        # rate-limits the T20 aggregate endpoint when several formats are fetched.
        if fmt != next(iter(FORMATS)):
            time.sleep(3)
        try:
            result = scrape_format(fmt, match_class)
            previous = old_formats.get(fmt, {})
            # A newly returned empty innings list must never erase a populated verified snapshot.
            if result.get("innings") or not previous.get("innings"):
                new_formats[fmt] = result
            else:
                merged = dict(previous)
                if result.get("summary"):
                    merged["summary"] = result["summary"]
                if result.get("careerBreakdown"):
                    merged["careerBreakdown"] = result["careerBreakdown"]
                merged["checkedAt"] = stamp()
                new_formats[fmt] = merged
            success.append(fmt)
            print(
                fmt
                + ": career summary "
                + ("ok" if result.get("summary") else "not parsed")
                + "; career split rows "
                + str(len(result.get("careerBreakdown", [])))
                + "; innings rows "
                + str(len(result.get("innings", [])))
            )
        except Exception as exc:
            message = fmt + ": " + str(exc)
            if fmt in optional_formats:
                optional_warnings.append(message)
            else:
                errors.append(message)
            print("Could not refresh " + fmt + " from ESPNcricinfo Statsguru:", exc)
            if fmt in {"FC", "List A"}:
                try:
                    fallback = scrape_domestic_profile_summary(fmt)
                    if fallback.get("summary"):
                        # A summary-only fallback must never erase previously verified
                        # match-by-match innings or career breakdown rows.
                        previous = old_formats.get(fmt, {})
                        if isinstance(previous, dict):
                            merged = dict(previous)
                            merged.update(fallback)
                            if not fallback.get("innings") and previous.get("innings"):
                                merged["innings"] = previous["innings"]
                                merged["inningsCount"] = len(previous["innings"])
                            if not fallback.get("careerBreakdown") and previous.get(
                                "careerBreakdown"
                            ):
                                merged["careerBreakdown"] = previous["careerBreakdown"]
                            new_formats[fmt] = merged
                        else:
                            new_formats[fmt] = fallback
                        success.append(fmt + " summary fallback")
                        print(
                            fmt
                            + ": refreshed verified domestic summary from secondary profile feed; preserved any existing detailed innings"
                        )
                except Exception as fallback_exc:
                    # The secondary profile feed can change independently of Statsguru.
                    # If both live sources fail, keep the last saved career summary
                    # visible in the Stats Explorer rather than treating a valid saved
                    # snapshot as missing data. Do not change its original timestamp.
                    target = "First-class" if fmt == "FC" else "List A"
                    saved_career = data.get("careerFormats", {}).get(target, {})
                    previous = old_formats.get(fmt, {})
                    saved_summary = (
                        previous.get("summary") if isinstance(previous, dict) else None
                    )
                    if not isinstance(saved_summary, dict) or not saved_summary:
                        saved_summary = {
                            key: saved_career.get(key)
                            for key in (
                                "matches",
                                "innings",
                                "notOuts",
                                "runs",
                                "highestScore",
                                "average",
                                "strikeRate",
                                "hundreds",
                                "fifties",
                                "fours",
                                "sixes",
                                "balls",
                            )
                            if saved_career.get(key) is not None
                        }
                    if saved_summary:
                        merged = dict(previous) if isinstance(previous, dict) else {}
                        merged["summary"] = saved_summary
                        merged.setdefault("careerBreakdown", [])
                        merged.setdefault("innings", [])
                        merged.setdefault("inningsCount", len(merged["innings"]))
                        merged["source"] = (
                            "Saved verified career summary; live domestic source unavailable"
                        )
                        merged["detailStatus"] = (
                            "saved-summary-only"
                            if not merged.get("innings")
                            else merged.get("detailStatus", "saved-details")
                        )
                        merged["detailNote"] = (
                            "The live Statsguru and secondary profile requests failed. "
                            "Showing the last saved career summary; no new match-by-match "
                            "rows or updated timestamp are claimed."
                        )
                        merged["checkedAt"] = (
                            saved_career.get("updatedAt")
                            or merged.get("checkedAt")
                            or ""
                        )
                        new_formats[fmt] = merged
                        print(
                            fmt
                            + ": live sources unavailable; retained saved career summary:",
                            fallback_exc,
                        )
                    else:
                        optional_warnings.append(
                            fmt + " summary fallback: " + str(fallback_exc)
                        )
                        print(
                            fmt
                            + ": secondary summary fallback unavailable; preserving saved data:",
                            fallback_exc,
                        )
                        if old_formats.get(fmt):
                            new_formats[fmt] = old_formats[fmt]
    if success:
        # Cross-format match index for the Matches section. Preserve recent verified
        # scorecards (including DNB rows) and enrich with Statsguru batting rows.
        recent_rows = data.get("recentInnings", [])
        if not isinstance(recent_rows, list):
            recent_rows = []
        indexed = {}

        def normalize_match_text(value):
            value = clean(value).casefold()
            value = re.sub(r"^v\s+", "", value)
            value = re.sub(r"^india\s+vs\s+", "", value)
            value = re.sub(r"[^a-z0-9]+", " ", value)
            return re.sub(r"\s+", " ", value).strip()

        def match_key(row, fmt):
            raw_date = clean(row.get("date"))
            day = date_sort_key(raw_date)
            opposition = normalize_match_text(row.get("opposition"))
            if not raw_date or not opposition:
                return None
            # Venue names vary between feeds (city vs stadium); date + opposition
            # is the stable identity. Preserve separate FC/Test innings explicitly.
            innings = clean(row.get("innings")) if fmt in {"FC", "Test"} else ""
            return (fmt, day or raw_date.casefold(), opposition, innings)

        def merge_match(existing, incoming, fmt):
            merged = dict(existing or {})
            for field, value in incoming.items():
                if value is None or value == "" or value in {"—", "-"}:
                    continue
                merged[field] = value
            merged["format"] = fmt
            return merged

        saved_match_rows = data.get("playerMatches", [])
        if isinstance(saved_match_rows, list):
            for row in saved_match_rows:
                fmt = clean(row.get("format") or "T20I")
                key = match_key(row, fmt)
                if key:
                    indexed[key] = merge_match(indexed.get(key), row, fmt)
        for fmt, entry in new_formats.items():
            for row in entry.get("innings", []) if isinstance(entry, dict) else []:
                key = match_key(row, fmt)
                if key:
                    indexed[key] = merge_match(
                        indexed.get(key),
                        {**row, "format": fmt, "source": "ESPNcricinfo Statsguru"},
                        fmt,
                    )
        for row in recent_rows:
            fmt = clean(row.get("format") or "T20I")
            key = match_key(row, fmt)
            if key:
                indexed[key] = merge_match(indexed.get(key), row, fmt)
        data["playerMatches"] = sorted(
            indexed.values(),
            key=lambda row: date_sort_key(row.get("date")),
            reverse=True,
        )[:250]
        # Preserve the known debut and advance the last-match record only when a
        # newer verified row is available for that format.
        milestones = data.get("playerMatchMilestones", {})
        if not isinstance(milestones, dict):
            milestones = {}
        for fmt in FORMATS:
            rows = [
                row for row in data["playerMatches"] if clean(row.get("format")) == fmt
            ]
            if not rows:
                continue
            ordered = sorted(rows, key=lambda row: date_sort_key(row.get("date")))
            previous = (
                milestones.get(fmt, {}) if isinstance(milestones.get(fmt), dict) else {}
            )
            debut = previous.get("debut") or {
                "opposition": ordered[0].get("opposition"),
                "ground": ordered[0].get("ground") or ordered[0].get("venue"),
                "date": ordered[0].get("date"),
            }
            latest = {
                "opposition": ordered[-1].get("opposition"),
                "ground": ordered[-1].get("ground") or ordered[-1].get("venue"),
                "date": ordered[-1].get("date"),
            }
            previous_last = previous.get("last")
            if isinstance(previous_last, dict) and date_sort_key(
                previous_last.get("date")
            ) > date_sort_key(latest.get("date")):
                latest = previous_last
            milestones[fmt] = {"debut": debut, "last": latest}
        data["playerMatchMilestones"] = milestones
        data["playerMatchesUpdatedAt"] = stamp()
        data["playerMatchesSource"] = (
            "ESPNcricinfo Statsguru + saved verified recent scorecards"
        )
        data["statsguru"] = {
            **saved,
            "source": "ESPNcricinfo Statsguru",
            "sourceUrl": "https://stats.espncricinfo.com/ci/engine/player/1170265.html",
            "updatedAt": stamp(),
            "formats": new_formats,
            "lastAttemptAt": stamp(),
            "lastAttemptStatus": (
                "partial" if errors or optional_warnings else "success"
            ),
            "lastAttemptErrors": errors,
            "lastAttemptWarnings": optional_warnings,
        }
        # Keep the public career cards in sync with the verified Statsguru
        # summaries. Preserve formats that the current source did not return.
        career_formats = data.get("careerFormats")
        if not isinstance(career_formats, dict):
            career_formats = {}
        format_targets = {
            "T20I": "T20I",
            "ODI": "ODI",
            "T20": "Overall T20 (all competitions)",
            "FC": "First-class",
            "List A": "List A",
        }
        field_map = {
            "matches": "matches",
            "innings": "innings",
            "notOuts": "notOuts",
            "runs": "runs",
            "highestScore": "highestScore",
            "average": "average",
            "strikeRate": "strikeRate",
            "hundreds": "hundreds",
            "fifties": "fifties",
            "fours": "fours",
            "sixes": "sixes",
            "balls": "balls",
        }
        for fmt, target in format_targets.items():
            summary = (new_formats.get(fmt) or {}).get("summary")
            if not isinstance(summary, dict) or not summary:
                continue
            merged = dict(career_formats.get(target) or {})
            for source_key, target_key in field_map.items():
                if source_key in summary and summary[source_key] is not None:
                    merged[target_key] = summary[source_key]
            merged["source"] = (new_formats.get(fmt) or {}).get(
                "source", "ESPNcricinfo Statsguru"
            )
            merged["updatedAt"] = (new_formats.get(fmt) or {}).get(
                "checkedAt"
            ) or stamp()
            career_formats[target] = merged
        data["careerFormats"] = career_formats
        t20i_summary = (new_formats.get("T20I") or {}).get("summary")
        if isinstance(t20i_summary, dict):
            career_stats = data.get("careerStats")
            if not isinstance(career_stats, dict):
                career_stats = {}
            for source_key, target_key in {
                "runs": "t20iRuns",
                "highestScore": "highestScore",
                "average": "average",
                "strikeRate": "strikeRate",
                "fifties": "fifties",
                "hundreds": "hundreds",
            }.items():
                if t20i_summary.get(source_key) is not None:
                    career_stats[target_key] = t20i_summary[source_key]
            data["careerStats"] = career_stats
            data["careerStatsUpdated"] = stamp()

        # Refresh fielding separately from batting. A temporary source/parser failure
        # preserves the last saved fielding snapshot and never invents numbers.
        old_fielding = (
            data.get("fieldingStats")
            if isinstance(data.get("fieldingStats"), dict)
            else {}
        )
        old_field_formats = (
            old_fielding.get("formats")
            if isinstance(old_fielding.get("formats"), dict)
            else {}
        )
        new_field_formats = dict(old_field_formats)
        field_success, field_errors, field_warnings = [], [], []
        for fmt, match_class in FORMATS.items():
            try:
                fresh = scrape_fielding_format(fmt, match_class)
                previous = old_field_formats.get(fmt, {})
                if (
                    fresh.get("summary")
                    or fresh.get("innings")
                    or fresh.get("careerBreakdown")
                ):
                    if not fresh.get("innings") and previous.get("innings"):
                        fresh["innings"] = previous["innings"]
                        fresh["inningsCount"] = previous.get(
                            "inningsCount", len(fresh["innings"])
                        )
                    if not fresh.get("careerBreakdown") and previous.get(
                        "careerBreakdown"
                    ):
                        fresh["careerBreakdown"] = previous["careerBreakdown"]
                    if not fresh.get("summary") and previous.get("summary"):
                        fresh["summary"] = previous["summary"]
                    new_field_formats[fmt] = fresh
                    field_success.append(fmt)
                else:
                    raise RuntimeError("no verified fielding rows returned")
                print(fmt + ": fielding summary/list refreshed")
            except Exception as exc:
                message = fmt + ": " + str(exc)
                if fmt in optional_formats:
                    field_warnings.append(message)
                else:
                    field_errors.append(message)
                print(
                    fmt
                    + ": fielding refresh unavailable; keeping saved fielding snapshot:",
                    exc,
                )
        if field_success or old_fielding:
            data["fieldingStats"] = {
                **old_fielding,
                "source": "ESPNcricinfo Statsguru",
                "sourceUrl": "https://stats.espncricinfo.com/ci/engine/player/1170265.html",
                "updatedAt": (
                    stamp() if field_success else old_fielding.get("updatedAt")
                ),
                "lastAttemptAt": stamp(),
                "lastAttemptStatus": (
                    "partial" if field_errors or field_warnings else "success"
                ),
                "lastAttemptErrors": field_errors,
                "lastAttemptWarnings": field_warnings,
                "formats": new_field_formats,
            }
        DATA_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    else:
        print("All ESPNcricinfo Statsguru requests failed; saved data was not changed.")
        raise SystemExit(
            "No Statsguru formats refreshed. Existing JSON snapshot preserved."
        )


if __name__ == "__main__":
    main()
