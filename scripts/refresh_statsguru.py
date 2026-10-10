#!/usr/bin/env python3
"""Refresh Tilak Varma batting Statsguru data from ESPNcricinfo every 24 hours.

ESPNcricinfo Statsguru supplies these tables for T20I, ODI, T20, FC and List A.
Optional formats may be blocked; if a source is unavailable or markup changes, the last
successfully saved snapshot is preserved and no values are invented.
"""
import html
import json
import re
import time
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


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8", "replace")


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
    """Fallback for domestic career totals when legacy Statsguru omits FC/List A.

    Only summary rows are imported from the public profile stats table. We
    deliberately do not invent match-by-match innings when they are absent.
    """
    url = "https://dujseks5cqq0r.cloudfront.net/player/tilak-varma/stats"
    page = fetch(url)
    wanted = "listas" if fmt == "List A" else "firstclass"

    def norm(value):
        return re.sub(r"[^a-z0-9]+", "", clean(value).casefold())

    for table in parse_tables(page):
        for index, row in enumerate(table):
            headers = [norm(value) for value in cell_text(row)]
            if not ({"mat", "matches"} & set(headers)) or not (
                {"r", "runs"} & set(headers)
            ):
                continue
            columns = {}
            for i, header in enumerate(headers):
                if header in {"game", "gametype", "format", "type"}:
                    columns["format"] = i
                elif header in {"mat", "matches"}:
                    columns["matches"] = i
                elif header in {"inn", "inns", "innings"}:
                    columns["innings"] = i
                elif header in {"r", "runs"}:
                    columns["runs"] = i
                elif header in {"bf", "balls", "balls_faced"}:
                    columns["balls"] = i
                elif header in {"no", "notout", "notouts"}:
                    columns["notOuts"] = i
                elif header in {"avg", "average"}:
                    columns["average"] = i
                elif header in {"sr", "strikerate"}:
                    columns["strikeRate"] = i
                elif header in {"100", "100s", "hundreds"}:
                    columns["hundreds"] = i
                elif header in {"50", "50s", "fifties"}:
                    columns["fifties"] = i
                elif header in {"h", "hs", "highscore"}:
                    columns["highestScore"] = i
                elif header in {"4s", "fours"}:
                    columns["fours"] = i
                elif header in {"6s", "sixes"}:
                    columns["sixes"] = i
            if not {"matches", "innings", "runs", "highestScore", "format"}.issubset(
                columns
            ):
                continue
            for candidate in table[index + 1 :]:
                values = cell_text(candidate)
                if len(values) <= max(columns.values()):
                    continue
                if wanted not in norm(values[columns["format"]]):
                    continue
                summary = {}
                for key, column in columns.items():
                    if key == "format":
                        continue
                    raw = values[column]
                    summary[key] = raw if key == "highestScore" else number(raw)
                if summary.get("runs") is None or summary.get("matches") is None:
                    continue
                return {
                    "summary": summary,
                    "careerBreakdown": [],
                    "innings": [],
                    "inningsCount": summary.get("matches") or 0,
                    "source": "Secondary public player profile stats (summary only)",
                    "sourceUrl": url,
                    "detailStatus": "summary-only",
                    "detailNote": "Legacy ESPNcricinfo Statsguru did not provide domestic innings rows; match-by-match data is not fabricated.",
                    "checkedAt": stamp(),
                }
    raise RuntimeError(
        "No recognizable " + fmt + " summary row in the fallback profile feed"
    )


def parse_fielding_summary(page):
    """Parse the official Statsguru fielding career total when present."""
    for table in parse_tables(page):
        for idx, row in enumerate(table):
            headers = [
                re.sub(r"[^a-z0-9]+", "", clean(x).casefold()) for x in cell_text(row)
            ]
            if not ({"mat", "matches"} & set(headers)) or not (
                {"ct", "catches"} & set(headers)
            ):
                continue
            cols = {}
            for i, h in enumerate(headers):
                if h in {"mat", "matches"}:
                    cols["matches"] = i
                elif h in {"inns", "innings"}:
                    cols["innings"] = i
                elif h in {"ct", "catches"}:
                    cols["catches"] = i
                elif h in {"st", "stumpings"}:
                    cols["stumpings"] = i
                elif h in {"ro", "runouts", "runout"}:
                    cols["runOuts"] = i
                elif h in {"dismissals", "total"}:
                    cols["dismissals"] = i
            for candidate in table[idx + 1 :]:
                vals = cell_text(candidate)
                if len(vals) <= max(cols.values(), default=0):
                    continue
                if not any(
                    re.search(r"\b(overall|career|total)\b", v, re.I) for v in vals
                ):
                    continue
                out = {k: number(vals[i]) for k, i in cols.items()}
                if out.get("catches") is not None:
                    out.setdefault("stumpings", 0)
                    out.setdefault("runOuts", 0)
                    out["dismissals"] = (
                        out.get("dismissals")
                        if out.get("dismissals") is not None
                        else sum(
                            out.get(k) or 0 for k in ("catches", "stumpings", "runOuts")
                        )
                    )
                    return out
    return None


def parse_fielding_breakdown(page):
    """Read verified grouped fielding figures (series/year/opposition etc.)."""
    out, seen, columns = [], set(), None
    for table in parse_tables(page):
        header_idx = None
        for i, row in enumerate(table):
            hs = [
                re.sub(r"[^a-z0-9]+", "", clean(x).casefold()) for x in cell_text(row)
            ]
            if {"span", "mat"} <= set(hs) and ({"ct", "catches"} & set(hs)):
                header_idx, columns = i, {}
                for j, h in enumerate(hs):
                    if h in {"group", "grouping", "category"}:
                        columns["group"] = j
                    elif h == "span":
                        columns["span"] = j
                    elif h in {"mat", "matches"}:
                        columns["matches"] = j
                    elif h in {"ct", "catches"}:
                        columns["catches"] = j
                    elif h in {"st", "stumpings"}:
                        columns["stumpings"] = j
                    elif h in {"ro", "runouts", "runout"}:
                        columns["runOuts"] = j
                    elif h in {"dismissals", "total"}:
                        columns["dismissals"] = j
                break
        if header_idx is None or columns is None:
            continue
        for row in table[header_idx + 1 :]:
            vals = cell_text(row)
            if len(vals) <= max(columns.values(), default=0):
                continue
            group = vals[columns.get("group", 0)].strip()
            span = vals[columns["span"]].strip() if "span" in columns else ""
            if not group or not re.search(r"\d{4}", span):
                continue
            item = {"group": group, "span": span}
            for k, j in columns.items():
                if k not in {"group", "span"} and j < len(vals):
                    item[k] = number(vals[j])
            if item.get("catches") is None:
                continue
            item.setdefault("stumpings", 0)
            item.setdefault("runOuts", 0)
            item["dismissals"] = (
                item.get("dismissals")
                if item.get("dismissals") is not None
                else sum(item.get(k) or 0 for k in ("catches", "stumpings", "runOuts"))
            )
            key = (
                group,
                span,
                item.get("matches"),
                item.get("catches"),
                item.get("stumpings"),
                item.get("runOuts"),
            )
            if key not in seen:
                seen.add(key)
                out.append(item)
    return out


def parse_fielding_innings(page, fmt):
    """Parse fielding innings list from the player-specific Statsguru response."""
    output = []
    for table in parse_tables(page):
        header_idx = None
        cols = {}
        for i, row in enumerate(table):
            hs = [
                re.sub(r"[^a-z0-9]+", "", clean(x).casefold()) for x in cell_text(row)
            ]
            has_date = any(h in {"startdate", "date"} for h in hs)
            has_opp = any("opposition" in h or h == "oppo" for h in hs)
            has_ground = any("ground" in h or "venue" in h for h in hs)
            has_fielding = bool(
                {"ct", "catches", "st", "stumpings", "ro", "runouts", "runout"}
                & set(hs)
            )
            if has_date and has_opp and has_ground and has_fielding:
                header_idx = i
                for j, h in enumerate(hs):
                    if h in {"startdate", "date"}:
                        cols["date"] = j
                    elif "opposition" in h or h == "oppo":
                        cols["opposition"] = j
                    elif "ground" in h or "venue" in h:
                        cols["ground"] = j
                    elif h in {"ct", "catches"}:
                        cols["catches"] = j
                    elif h in {"st", "stumpings"}:
                        cols["stumpings"] = j
                    elif h in {"ro", "runouts", "runout"}:
                        cols["runOuts"] = j
                    elif h in {"inns", "inn", "innings"}:
                        cols["innings"] = j
                    elif h in {"match", "scorecard", "card"}:
                        cols["match"] = j
                break
        if header_idx is None:
            continue
        for row in table[header_idx + 1 :]:
            vals = cell_text(row)
            if len(vals) <= max(cols.values(), default=0):
                continue
            date, opp, ground = (
                vals[cols[k]] for k in ("date", "opposition", "ground")
            )
            if (
                not date
                or not opp
                or not ground
                or date.casefold() in {"date", "start date"}
            ):
                continue

            def field_value(key):
                return (
                    number(vals[cols[key]])
                    if key in cols and cols[key] < len(vals)
                    else 0
                )

            match_url = None
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
                "opposition": opp,
                "ground": ground,
                "catches": field_value("catches"),
                "stumpings": field_value("stumpings"),
                "runOuts": field_value("runOuts"),
                "innings": (
                    vals[cols["innings"]]
                    if "innings" in cols and cols["innings"] < len(vals)
                    else "—"
                ),
                "source": "ESPNcricinfo Statsguru",
            }
            if match_url:
                item["matchUrl"] = match_url
            item["dismissals"] = sum(
                item[k] or 0 for k in ("catches", "stumpings", "runOuts")
            )
            output.append(item)
    return output


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
    for fmt, match_class in FORMATS.items():
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
            errors.append(fmt + ": " + str(exc))
            print("Could not refresh " + fmt + " from ESPNcricinfo Statsguru:", exc)
            if fmt in {"FC", "List A"}:
                try:
                    fallback = scrape_domestic_profile_summary(fmt)
                    if fallback.get("summary"):
                        new_formats[fmt] = fallback
                        success.append(fmt + " summary fallback")
                        print(
                            fmt
                            + ": refreshed verified domestic summary from secondary profile feed; innings not fabricated"
                        )
                except Exception as fallback_exc:
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
        saved_match_rows = data.get("playerMatches", [])
        if isinstance(saved_match_rows, list):
            for row in saved_match_rows:
                fmt = clean(row.get("format") or "T20I")
                key = (
                    fmt,
                    clean(row.get("date")),
                    clean(row.get("opposition")),
                    clean(row.get("ground") or row.get("venue")),
                )
                if all(key[1:]):
                    indexed[key] = dict(row)
        for fmt, entry in new_formats.items():
            for row in entry.get("innings", []) if isinstance(entry, dict) else []:
                key = (
                    fmt,
                    clean(row.get("date")),
                    clean(row.get("opposition")),
                    clean(row.get("ground")),
                )
                if all(key[1:]):
                    indexed[key] = {
                        **row,
                        "format": fmt,
                        "source": "ESPNcricinfo Statsguru",
                    }
        for row in recent_rows:
            fmt = clean(row.get("format") or "T20I")
            key = (
                fmt,
                clean(row.get("date")),
                clean(row.get("opposition")),
                clean(row.get("venue") or row.get("ground")),
            )
            if all(key[1:]):
                indexed[key] = {**indexed.get(key, {}), **row, "format": fmt}
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
            "lastAttemptStatus": "partial" if errors else "success",
            "lastAttemptErrors": errors,
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
        field_success, field_errors = [], []
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
                field_errors.append(fmt + ": " + str(exc))
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
                "lastAttemptStatus": "partial" if field_errors else "success",
                "lastAttemptErrors": field_errors,
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
