#!/usr/bin/env python3
"""Refresh Tilak Varma bowling Statsguru data from ESPNcricinfo every 24 hours.

Only ESPNcricinfo Statsguru is used. Failed or unrecognizable source responses
never replace the last verified snapshot; this script does not invent figures.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from refresh_statsguru import clean, number, parse_tables, cell_text, fetch, stats_url

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "site-data.json"
FORMATS = {"T20I": 3, "ODI": 2, "List A": 5, "FC": 4, "T20": 6}


def stamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


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


def norm(value):
    return re.sub(r"[^a-z0-9]+", "", clean(value).casefold())


def numeric_or_text(value):
    value = clean(value)
    parsed = number(value)
    return parsed if parsed is not None else (value or None)


def overs_to_balls(value):
    if value is None:
        return None
    match = re.fullmatch(r"\s*(\d+)(?:\.(\d+))?\s*", str(value))
    if not match:
        return None
    whole = int(match.group(1))
    extra = int(match.group(2) or 0)
    return whole * 6 + extra if 0 <= extra <= 5 else None


def parse_summary(page):
    for table in parse_tables(page):
        for i, row in enumerate(table):
            headers = [norm(x) for x in cell_text(row)]
            if not ({"mat", "matches"} & set(headers)) or not (
                {"wkts", "wickets", "wkt"} & set(headers)
            ):
                continue
            cols = {}
            for j, h in enumerate(headers):
                if h in {"mat", "matches"}:
                    cols["matches"] = j
                elif h in {"inns", "innings", "inn"}:
                    cols["innings"] = j
                elif h in {"overs", "o"}:
                    cols["overs"] = j
                elif h in {"mdns", "maidens", "m"}:
                    cols["maidens"] = j
                elif h in {"balls", "deliveries"}:
                    cols["balls"] = j
                elif h in {"runs", "r"}:
                    cols["runsConceded"] = j
                elif h in {"wkts", "wickets", "wkt"}:
                    cols["wickets"] = j
                elif h in {"bbi", "bb"}:
                    cols["bestBowling"] = j
                elif h == "bbm":
                    cols["bestMatchBowling"] = j
                elif h in {"ave", "avg", "average"}:
                    cols["average"] = j
                elif h in {"econ", "economy"}:
                    cols["economy"] = j
                elif h in {"sr", "strikerate"}:
                    cols["strikeRate"] = j
                elif h in {"4", "4w", "fourwickets"}:
                    cols["fourWicketHauls"] = j
                elif h in {"5", "5w", "fivewickets"}:
                    cols["fiveWicketHauls"] = j
                elif h in {"10", "10w", "tenwickets"}:
                    cols["tenWicketHauls"] = j
            if not {"matches", "runsConceded", "wickets"}.issubset(cols):
                continue
            for candidate in table[i + 1 :]:
                values = cell_text(candidate)
                if len(values) <= max(cols.values()):
                    continue
                if not re.search(
                    r"\b(?:overall|career|total)\b", " ".join(values).casefold()
                ):
                    continue
                result = {}
                for key, j in cols.items():
                    value = values[j]
                    result[key] = (
                        (clean(value) or None)
                        if key in {"bestBowling", "bestMatchBowling"}
                        else number(value)
                    )
                if (
                    result.get("matches") is not None
                    and result.get("wickets") is not None
                ):
                    if result.get("balls") is None and result.get("overs") is not None:
                        result["balls"] = overs_to_balls(result["overs"])
                    return result
    return None


def parse_breakdown(page):
    output, seen = [], set()
    for table in parse_tables(page):
        for i, row in enumerate(table):
            headers = [norm(x) for x in cell_text(row)]
            if not {"span", "mat"}.issubset(set(headers)) or not (
                {"wkts", "wickets", "wkt"} & set(headers)
            ):
                continue
            cols = {}
            for j, h in enumerate(headers):
                if h in {"group", "grouping", "category"}:
                    cols["group"] = j
                elif h == "span":
                    cols["span"] = j
                elif h in {"mat", "matches"}:
                    cols["matches"] = j
                elif h in {"inns", "innings", "inn"}:
                    cols["innings"] = j
                elif h in {"overs", "o"}:
                    cols["overs"] = j
                elif h in {"mdns", "maidens", "m"}:
                    cols["maidens"] = j
                elif h in {"runs", "r"}:
                    cols["runsConceded"] = j
                elif h in {"wkts", "wickets", "wkt"}:
                    cols["wickets"] = j
                elif h in {"bbi", "bb"}:
                    cols["bestBowling"] = j
                elif h == "bbm":
                    cols["bestMatchBowling"] = j
                elif h in {"ave", "avg", "average"}:
                    cols["average"] = j
                elif h in {"econ", "economy"}:
                    cols["economy"] = j
                elif h in {"sr", "strikerate"}:
                    cols["strikeRate"] = j
                elif h in {"4", "4w", "fourwickets"}:
                    cols["fourWicketHauls"] = j
                elif h in {"5", "5w", "fivewickets"}:
                    cols["fiveWicketHauls"] = j
                elif h in {"10", "10w", "tenwickets"}:
                    cols["tenWicketHauls"] = j
            if not {"span", "matches", "wickets"}.issubset(cols):
                continue
            for candidate in table[i + 1 :]:
                values = cell_text(candidate)
                if len(values) <= max(cols.values()):
                    continue
                group = values[cols["group"]] if "group" in cols else values[0]
                span = values[cols["span"]]
                if not group or not re.search(r"\d{4}", span):
                    continue
                key = (group, span)
                if key in seen:
                    continue
                item = {}
                for name, j in cols.items():
                    val = values[j]
                    item[name] = (
                        (clean(val) or None)
                        if name in {"group", "span", "bestBowling", "bestMatchBowling"}
                        else number(val)
                    )
                if item.get("wickets") is None:
                    continue
                seen.add(key)
                if item.get("balls") is None and item.get("overs") is not None:
                    item["balls"] = overs_to_balls(item["overs"])
                output.append(item)
    return output


def parse_innings(page, fmt):
    for table in parse_tables(page):
        header_index, headers = None, []
        for i, row in enumerate(table):
            candidate = [norm(x) for x in cell_text(row)]
            if (
                ("opposition" in candidate)
                and ("ground" in candidate)
                and ({"startdate", "date"} & set(candidate))
                and ({"wkts", "wickets", "wkt"} & set(candidate))
            ):
                header_index, headers = i, candidate
                break
        if header_index is None:
            continue
        cols = {}
        for j, h in enumerate(headers):
            if h == "opposition":
                cols["opposition"] = j
            elif h == "ground":
                cols["ground"] = j
            elif h in {"startdate", "date"}:
                cols["date"] = j
            elif h in {"overs", "o"}:
                cols["overs"] = j
            elif h in {"mdns", "maidens", "m"}:
                cols["maidens"] = j
            elif h in {"runs", "r"}:
                cols["runsConceded"] = j
            elif h in {"wkts", "wickets", "wkt"}:
                cols["wickets"] = j
            elif h in {"econ", "economy"}:
                cols["economy"] = j
            elif h in {"inns", "inn", "innings"}:
                cols["innings"] = j
            elif h in {"bbi", "bowl", "bowling", "figures"}:
                cols["figures"] = j
            elif h in {"match", "scorecard", "card"}:
                cols["match"] = j
        if not {"opposition", "ground", "date", "wickets"}.issubset(cols):
            continue
        rows = []
        for row in table[header_index + 1 :]:
            values = cell_text(row)
            if len(values) <= max(cols.values()):
                continue
            date, opposition, ground = (
                values[cols["date"]],
                values[cols["opposition"]],
                values[cols["ground"]],
            )
            if (
                not date
                or not opposition
                or not ground
                or norm(date) in {"date", "startdate"}
            ):
                continue
            item = {
                "date": date,
                "format": fmt,
                "opposition": opposition,
                "ground": ground,
            }
            for name in (
                "overs",
                "maidens",
                "runsConceded",
                "wickets",
                "economy",
                "innings",
                "figures",
            ):
                if name not in cols:
                    continue
                value = values[cols[name]]
                item[name] = (
                    (clean(value) or None) if name == "figures" else number(value)
                )
            if not any(
                item.get(field) is not None
                for field in ("overs", "maidens", "runsConceded", "wickets")
            ):
                continue
            if item.get("overs") is not None:
                item["balls"] = overs_to_balls(item["overs"])
            if (
                item.get("figures") is None
                and item.get("wickets") is not None
                and item.get("runsConceded") is not None
            ):
                item["figures"] = str(item["wickets"]) + "/" + str(item["runsConceded"])
            links = []
            if "match" in cols and cols["match"] < len(row):
                links.extend(row[cols["match"]].get("links", []))
            if not links:
                for cell in row:
                    links.extend(cell.get("links", []))
            match_url = next(
                (
                    u
                    for u in links
                    if "engine/match" in u or "scorecard" in u or "full-scorecard" in u
                ),
                None,
            )
            if match_url:
                item["matchUrl"] = match_url
            item["source"] = "ESPNcricinfo Statsguru"
            rows.append(item)
        return rows
    return []


def scrape(fmt, match_class):
    innings_page = fetch(stats_url(match_class, "innings", 1, "bowling"))
    summary = parse_summary(innings_page)
    innings = parse_innings(innings_page, fmt)
    breakdown = parse_breakdown(innings_page)

    # Statsguru paginates long match lists. Collect all available pages (up to
    # 20) and deduplicate rows so the site shows more than just page one.
    seen = {
        (row.get("date"), row.get("opposition"), row.get("ground"), row.get("innings"))
        for row in innings
    }
    for page_number in range(2, 21):
        try:
            page = fetch(stats_url(match_class, "innings", page_number, "bowling"))
        except Exception as exc:
            print(
                fmt + ": pagination stopped at page " + str(page_number - 1) + ":", exc
            )
            break
        page_rows = parse_innings(page, fmt)
        if not page_rows:
            break
        fresh = []
        for row in page_rows:
            key = (
                row.get("date"),
                row.get("opposition"),
                row.get("ground"),
                row.get("innings"),
            )
            if key not in seen:
                seen.add(key)
                fresh.append(row)
        if not fresh:
            break
        innings.extend(fresh)

    if not summary or (not innings and fmt != "ODI") or len(breakdown) <= 1:
        summary_page = fetch(stats_url(match_class, None, 1, "bowling"))
        summary = parse_summary(summary_page) or summary
        split = parse_breakdown(summary_page)
        if len(split) > len(breakdown):
            breakdown = split
        if not innings:
            innings = parse_innings(summary_page, fmt)
    if not summary:
        raise RuntimeError(
            fmt + ": ESPNcricinfo bowling career summary could not be parsed"
        )
    return {
        "summary": summary,
        "careerBreakdown": breakdown,
        "innings": innings,
        "inningsCount": len(innings),
        "source": "ESPNcricinfo Statsguru",
        "careerUrl": stats_url(match_class, None, 1, "bowling"),
        "inningsUrl": stats_url(match_class, "innings", 1, "bowling"),
    }


def main():
    if not DATA_FILE.exists():
        raise SystemExit("Missing data/site-data.json")
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    old = data.get("bowlingStats") if isinstance(data.get("bowlingStats"), dict) else {}
    old_formats = old.get("formats") if isinstance(old.get("formats"), dict) else {}
    new_formats, errors = dict(old_formats), []
    for fmt, match_class in FORMATS.items():
        try:
            result = scrape(fmt, match_class)
            previous = old_formats.get(fmt, {})
            if not result.get("innings") and previous.get("innings"):
                result["innings"] = previous["innings"]
                result["inningsCount"] = previous.get(
                    "inningsCount", len(result["innings"])
                )
            if not result.get("careerBreakdown") and previous.get("careerBreakdown"):
                result["careerBreakdown"] = previous["careerBreakdown"]
            if (
                fmt in {"FC", "List A"}
                and not result.get("careerBreakdown")
                and not result.get("innings")
            ):
                result["unavailableReason"] = (
                    "Career summary is available, but ESPNcricinfo Statsguru did not return "
                    "verified match-by-match bowling rows for this format."
                )
            new_formats[fmt] = result
            print(
                fmt
                + ": verified summary; "
                + str(len(result["careerBreakdown"]))
                + " breakdown rows; "
                + str(len(result["innings"]))
                + " bowling innings"
            )
        except Exception as exc:
            print("Could not refresh " + fmt + " from the Statsguru endpoint:", exc)
            if fmt in {"T20I", "ODI", "T20"}:
                errors.append(fmt + ": " + str(exc))
                if fmt not in old_formats:
                    raise SystemExit(
                        "No previous required "
                        + fmt
                        + " bowling snapshot and fresh parse failed."
                    )
            elif fmt not in old_formats:
                # Keep the UI honest when Statsguru rejects a domestic format:
                # publish an explicit unavailable state rather than inventing stats.
                new_formats[fmt] = {
                    "summary": None,
                    "careerBreakdown": [],
                    "innings": [],
                    "inningsCount": 0,
                    "source": "ESPNcricinfo Statsguru",
                    "unavailableReason": "This format is not exposed by the current Statsguru endpoint.",
                }
            else:
                print("Keeping the last saved optional-format snapshot for", fmt)
    if errors:
        raise SystemExit(
            "Bowling refresh incomplete; saved snapshot not updated: "
            + "; ".join(errors)
        )
    unavailable_details = [
        fmt
        for fmt in ("FC", "List A")
        if fmt in new_formats
        and not new_formats[fmt].get("careerBreakdown")
        and not new_formats[fmt].get("innings")
    ]
    attempt_errors = [
        fmt
        + ": summary available, but verified detailed bowling rows were not returned by Statsguru."
        for fmt in unavailable_details
    ]
    data["bowlingStats"] = {
        **old,
        "source": "ESPNcricinfo Statsguru",
        "sourceUrl": "https://stats.espncricinfo.com/ci/engine/player/1170265.html?type=bowling",
        "updatedAt": stamp(),
        "formats": new_formats,
        "lastAttemptAt": stamp(),
        "lastAttemptStatus": "success",
        "lastAttemptErrors": [],
        "lastAttemptWarnings": attempt_errors,
    }
    update_last_updated(data)
    DATA_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Published verified bowling snapshot at", data["bowlingStats"]["updatedAt"])


if __name__ == "__main__":
    main()
