#!/usr/bin/env python3
"""Refresh ICC player rankings and record highlights without replacing saved data on source failures."""
import html
import json
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / "data" / "site-data.json"
ICC_URL = "https://www.icc-cricket.com/rankings/70761/tilak-varma"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
}


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def utc_now():
    return datetime.now(timezone.utc)


def stamp(value=None):
    return (value or utc_now()).strftime("%Y-%m-%d %H:%M UTC")


def update_last_updated(data):
    """Use successful section snapshot timestamps, not failed refresh attempts."""
    values = [
        data.get("profileUpdated"),
        data.get("careerStatsUpdated"),
        data.get("recentUpdated"),
        (data.get("iccRankings") or {}).get("updatedAt"),
        data.get("iccRecordsUpdated"),
        (data.get("statsguru") or {}).get("updatedAt"),
        (data.get("bowlingStats") or {}).get("updatedAt"),
        (data.get("fieldingStats") or {}).get("updatedAt"),
    ]
    valid = []
    for value in values:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d %H:%M UTC")
            valid.append((parsed, value))
        except (TypeError, ValueError):
            continue
    if valid:
        data["lastUpdated"] = max(valid)[1]


def parse_stamp(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M UTC").replace(
            tzinfo=timezone.utc
        )
    except (TypeError, ValueError):
        return None


def fetch_page():
    request = urllib.request.Request(ICC_URL, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read().decode("utf-8", "replace")
    parser = TextParser()
    parser.feed(raw)
    text = re.sub(r"\s+", " ", html.unescape(" ".join(parser.parts))).strip()
    return raw, text


def extract_rankings(text):
    match = re.search(r"ICC Rankings(.{0,700}?)See More Rankings", text, re.I)
    section = match.group(1) if match else text[:2500]
    found = re.search(r"\bODI\s+(\d+)(?:\s+\d+)?\s+T20I\s+(\d+)\b", section, re.I)
    if not found:
        return None
    return {"ODI": int(found.group(1)), "T20I": int(found.group(2))}


def extract_rank_from_table(url):
    """Fallback to the ICC's public rankings table if the profile is client-rendered."""
    try:
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read().decode("utf-8", "replace")
        for row_html in re.findall(r"<tr\b[^>]*>(.*?)</tr>", raw, re.I | re.S):
            cells = re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row_html, re.I | re.S)
            row_text = re.sub(
                r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", row_html))
            ).strip()
            if (
                "tilak" not in row_text.casefold()
                or "varma" not in row_text.casefold()
                or not cells
            ):
                continue
            first_cell = re.sub(
                r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cells[0]))
            ).strip()
            match = re.search(r"\b(\d{1,3})\b", first_cell)
            if match:
                return int(match.group(1))
    except Exception as exc:
        print("ICC rankings table unavailable:", url, exc)
    return None


def extract_records(text):
    specs = [
        (
            "T20I Matches",
            "Fastest players to score 1,000 runs in T20 cricket",
            "Fastest Players to Score 1000 In T20",
        ),
        (
            "T20I Matches",
            "Youngest player to score a T20I hundred",
            "Youngest Player to Score T20 Hundred",
        ),
        (
            "Youth ODI Matches",
            "Youngest player to score a Youth ODI hundred",
            "Youngest Player to Score YouthODI Hundred",
        ),
    ]
    records = []
    folded = text.casefold()
    for category, title, needle in specs:
        position = 0
        rank_number = None
        while True:
            position = folded.find(needle.casefold(), position)
            if position < 0:
                break
            snippet = text[position : position + 450]
            rank_pos = snippet.casefold().find("rank")
            if rank_pos >= 0:
                rank_match = re.search(
                    r"\D{0,24}(\d{1,3})", snippet[rank_pos + 4 : rank_pos + 40]
                )
                if rank_match:
                    rank_number = int(rank_match.group(1))
                    break
            position += len(needle)
        if rank_number is not None:
            suffix = (
                "th"
                if 10 <= rank_number % 100 <= 20
                else {1: "st", 2: "nd", 3: "rd"}.get(rank_number % 10, "th")
            )
            records.append(
                {
                    "rank": str(rank_number) + suffix,
                    "category": category,
                    "title": title,
                }
            )
    return records


def main():
    data = json.loads(FILE.read_text(encoding="utf-8"))
    now = utc_now()
    try:
        _, text = fetch_page()
    except Exception as exc:
        print("ICC profile unavailable; retaining saved ranking and records:", exc)
        return

    existing = data.get("iccRankings") or {}
    rank_time = parse_stamp(existing.get("updatedAt"))
    ranking_due = not rank_time or now - rank_time >= timedelta(hours=48)
    if ranking_due:
        ranking = extract_rankings(text)
        if not ranking:
            t20i_rank = extract_rank_from_table(
                "https://www.icc-cricket.com/rankings/batting/mens/t20i"
            )
            odi_rank = extract_rank_from_table(
                "https://www.icc-cricket.com/rankings/batting/mens/odi"
            )
            if t20i_rank is not None and odi_rank is not None:
                ranking = {"T20I": t20i_rank, "ODI": odi_rank}
        if ranking:
            data["iccRankings"] = {
                **ranking,
                "source": ICC_URL,
                "updatedAt": stamp(now),
            }
            print("Updated ICC rankings:", ranking)
        else:
            print("Could not parse ICC rankings; saved ranking values retained.")
    else:
        print("ICC rankings are still within their 48-hour refresh window.")

    records = extract_records(text)
    print(
        "ICC profile text length:",
        len(text),
        "ranking section:",
        "ICC Rankings" in text,
        "records section:",
        "Records" in text,
    )
    data["iccRecordsCheckedAt"] = stamp(now)
    if records:
        data["iccRecords"] = records
        data["iccRecordsUpdated"] = stamp(now)
        print("Updated ICC record highlights:", len(records))
    else:
        print("Could not parse ICC record highlights; saved records retained.")

    update_last_updated(data)
    FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
