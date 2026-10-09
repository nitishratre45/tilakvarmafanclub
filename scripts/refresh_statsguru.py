#!/usr/bin/env python3
"""Refresh Tilak Varma batting Statsguru data from ESPNcricinfo every 24 hours.

Only ESPNcricinfo Statsguru is used for these tables. If a source is blocked or its
markup changes, the last successfully saved snapshot is preserved; no values are invented.
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
BASE = "https://stats.cricinfo.com/ci/engine/player/" + PLAYER_ID + ".html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
FORMATS = {"T20I": 3, "ODI": 2, "Test": 1, "T20": 6}

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
    def __init__(self):
        super().__init__()
        self.tables, self.table, self.row, self.cell = [], None, None, None
        self.in_anchor = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table":
            self.table = []
        elif self.table is not None and tag == "tr":
            self.row = []
        elif self.row is not None and tag in ("td", "th"):
            self.cell = {"text": [], "links": []}
        elif self.cell is not None and tag == "a":
            href = attrs.get("href")
            if href:
                self.cell["links"].append(urllib.parse.urljoin("https://stats.espncricinfo.com", href))
            self.in_anchor = True
    def handle_data(self, data):
        if self.cell is not None:
            self.cell["text"].append(data)
    def handle_endtag(self, tag):
        if tag == "a":
            self.in_anchor = False
        elif tag in ("td", "th") and self.cell is not None:
            self.row.append({"text": clean(" ".join(self.cell["text"])), "links": self.cell["links"]})
            self.cell = None
        elif tag == "tr" and self.row is not None:
            if self.row:
                self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            if self.table:
                self.tables.append(self.table)
            self.table = None

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8", "replace")

def stats_url(match_class, view, page=1):
    # Statsguru's legacy engine expects the semicolon-separated filters encoded
    # as one class query value; unescaped semicolons can return HTTP 400.
    query = str(match_class) + ";template=results;type=batting;view=" + view
    if page > 1:
        query += ";page=" + str(page)
    return BASE + "?class=" + urllib.parse.quote(query, safe="")

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
            if not any(x in {"mat", "matches"} for x in headers) or not any(x in {"runs", "r"} for x in headers):
                continue
            col = {}
            for i, h in enumerate(headers):
                if h in {"mat", "matches"}: col["matches"] = i
                elif h in {"inns", "inn"}: col["innings"] = i
                elif h in {"no", "not out"}: col["notOuts"] = i
                elif h in {"runs", "r"}: col["runs"] = i
                elif h in {"hs", "high score"}: col["highestScore"] = i
                elif h in {"ave", "avg", "bat av"}: col["average"] = i
                elif h in {"bf", "balls"}: col["balls"] = i
                elif h in {"sr", "strike rate"}: col["strikeRate"] = i
                elif h in {"100", "100s"}: col["hundreds"] = i
                elif h in {"50", "50s"}: col["fifties"] = i
                elif h in {"4s", "fours"}: col["fours"] = i
                elif h in {"6s", "sixes"}: col["sixes"] = i
            if not {"matches", "runs", "highestScore"}.issubset(col):
                continue
            for candidate in table[index + 1:]:
                values = cell_text(candidate)
                if len(values) <= max(col.values()):
                    continue
                joined = " ".join(values).casefold()
                if "overall" not in joined and not re.search(r"\b(?:career|total)\b", joined):
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
            if (any("opposition" in x for x in headers)
                and any("ground" in x for x in headers)
                and any("date" in x for x in headers)
                and any(x in {"bat1", "batting", "score", "runs"} for x in headers)):
                return table, i, headers
    return None, None, None

def parse_innings_page(page, fmt):
    tables = parse_tables(page)
    table, header_index, headers = find_innings_table(tables)
    if table is None:
        return []
    indexes = {}
    for i, header in enumerate(headers):
        h = header.casefold()
        if h in {"bat1", "batting", "score", "runs"}: indexes["score"] = i
        elif "opposition" in h: indexes["opposition"] = i
        elif "ground" in h: indexes["ground"] = i
        elif "date" in h: indexes["date"] = i
        elif h in {"wkts", "wickets"}: indexes["wickets"] = i
        elif h in {"ct", "catches"}: indexes["catches"] = i
        elif h in {"st", "stumpings"}: indexes["stumpings"] = i
        elif h in {"match", "scorecard", "card"}: indexes["match"] = i
    required = {"score", "opposition", "ground", "date"}
    if not required.issubset(indexes):
        return []
    rows = []
    for row in table[header_index + 1:]:
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
        if date.casefold() in {"start date", "date"} or opposition.casefold() == "opposition":
            continue
        runs, not_out = score(raw_score)
        match_url = None
        if "match" in indexes and indexes["match"] < len(row):
            links = row[indexes["match"]].get("links", [])
            match_url = next((url for url in links if "engine/match" in url or "scorecard" in url or "full-scorecard" in url), None)
        if not match_url:
            for cell in row:
                for url in cell.get("links", []):
                    if "engine/match" in url or "scorecard" in url or "full-scorecard" in url:
                        match_url = url
                        break
                if match_url:
                    break
        item = {"date": date, "format": fmt, "opposition": opposition, "ground": ground,
                "score": raw_score or "—", "runs": runs, "notOut": not_out,
                "wickets": values[indexes["wickets"]] if "wickets" in indexes and indexes["wickets"] < len(values) else "—",
                "catches": values[indexes["catches"]] if "catches" in indexes and indexes["catches"] < len(values) else "—",
                "stumpings": values[indexes["stumpings"]] if "stumpings" in indexes and indexes["stumpings"] < len(values) else "—",
                "source": "ESPNcricinfo Statsguru"}
        if match_url:
            item["matchUrl"] = match_url
        rows.append(item)
    return rows

def scrape_format(fmt, match_class):
    summary_page = fetch(stats_url(match_class, "career"))
    summary = parse_career_summary(summary_page)
    innings = []
    # Statsguru uses 50-row pages for long career lists. Continue while rows are found.
    for page_number in range(1, 16):
        page = fetch(stats_url(match_class, "innings", page_number))
        batch = parse_innings_page(page, fmt)
        if not batch:
            break
        existing = { (x["date"], x["opposition"], x["ground"], x["score"]) for x in innings }
        new_rows = [x for x in batch if (x["date"], x["opposition"], x["ground"], x["score"]) not in existing]
        if not new_rows:
            break
        innings.extend(new_rows)
        if len(batch) < 40:
            break
        time.sleep(0.3)
    if not summary and not innings:
        raise RuntimeError("ESPNcricinfo Statsguru returned no recognizable " + fmt + " tables")
    return {"summary": summary, "innings": innings, "inningsCount": len(innings),
            "source": "ESPNcricinfo Statsguru",
            "careerUrl": stats_url(match_class, "career"),
            "inningsUrl": stats_url(match_class, "innings")}

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
                merged["checkedAt"] = stamp()
                new_formats[fmt] = merged
            success.append(fmt)
            print(fmt + ": career summary " + ("ok" if result.get("summary") else "not parsed")
                  + "; innings rows " + str(len(result.get("innings", []))))
        except Exception as exc:
            errors.append(fmt + ": " + str(exc))
            print("Could not refresh " + fmt + "; keeping saved data:", exc)
    if success:
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
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        print("All ESPNcricinfo Statsguru requests failed; saved data was not changed.")
        raise SystemExit("No Statsguru formats refreshed. Existing JSON snapshot preserved.")

if __name__ == "__main__":
    main()
