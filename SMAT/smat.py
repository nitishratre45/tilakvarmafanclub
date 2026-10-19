import json
import time
from pathlib import Path
from datetime import datetime, timezone

import requests

# Adapted from the user's supplied smat.py: retain its BCCI results parsing,
# retry logic, raw page snapshots, deduplication, and Hyderabad filtering.
API_URL = "https://stats.bcci.tv/match/results/"
COMPETITIONS = [
    {"name": "SMAT 2024-25", "gid": "123347c2-3f0c-4636-b9de-c4487ed15f9f", "start": "2024-01-01"},
    {"name": "SMAT 2023-24", "gid": "b1c39c31-5bc9-4b26-9d79-5921a0585b40", "start": "2023-01-01"},
    {"name": "SMAT 2022-23", "gid": "9c75fa98-d7b0-4767-b101-5ee418bd14c1", "start": "2022-01-01"},
]
FIRST_PAGE = 1
LAST_PAGE = 100
PAGE_SIZE = 12
OUTPUT_DIR = Path(__file__).resolve().parent / "data" / "hyderabad_smat_data"
PAGES_DIR = OUTPUT_DIR / "pages"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://stats.bcci.tv/",
}


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def find_records(obj):
    if isinstance(obj, list):
        dictionaries = [x for x in obj if isinstance(x, dict)]
        if dictionaries and any(
            any(k in x for k in ("comp_name", "match_id", "match_gid", "match_start_date", "match_date", "gid"))
            for x in dictionaries
        ):
            return dictionaries
        for item in obj:
            result = find_records(item)
            if result:
                return result
    elif isinstance(obj, dict):
        for value in obj.values():
            if isinstance(value, list):
                result = find_records(value)
                if result:
                    return result
        for value in obj.values():
            if isinstance(value, dict):
                result = find_records(value)
                if result:
                    return result
    return []


def normalise(value):
    return "".join(c for c in str(value or "").lower() if c.isalnum())


def find_hyderabad(record):
    names = []

    def walk(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                k = normalise(key)
                if isinstance(value, str):
                    if "team" in k and ("name" in k or k in {"team", "team1", "team2"}):
                        names.append(value)
                elif isinstance(value, dict):
                    if "team" in k or k in {"home", "away"}:
                        for name_key in ("team_name", "teamName", "name", "short_name", "team_short_name"):
                            if isinstance(value.get(name_key), str):
                                names.append(value[name_key])
                    walk(value)
                elif isinstance(value, list):
                    walk(value)

    walk(record)
    return any(normalise(n) in {"hyderabad", "hyd"} for n in names)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    all_records, failed_pages, successful_pages = [], [], []
    session = requests.Session()
    session.headers.update(HEADERS)

    for comp in COMPETITIONS:
        for page in range(FIRST_PAGE, LAST_PAGE + 1):
            params = {"comp_gid": comp["gid"], "min_start_date": comp["start"], "page": page, "size": PAGE_SIZE}
            data = None
            for attempt in range(1, 4):
                try:
                    response = session.get(API_URL, params=params, timeout=40)
                    response.raise_for_status()
                    data = response.json()
                    save_json(PAGES_DIR / f'{comp["gid"]}_page_{page:03d}.json', {
                        "competition": comp, "page": page, "url": response.url,
                        "saved_at_utc": datetime.now(timezone.utc).isoformat(), "response": data,
                    })
                    break
                except (requests.RequestException, ValueError) as error:
                    print(f'{comp["name"]} page {page}, attempt {attempt}: {error}')
                    time.sleep(attempt * 2)
            if data is None:
                failed_pages.append({"competition": comp["name"], "page": page})
                continue
            successful_pages.append({"competition": comp["name"], "page": page})
            records = find_records(data)
            for record in records:
                record.setdefault("_collector_competition", comp["name"])
                record.setdefault("_collector_comp_gid", comp["gid"])
            all_records.extend(records)
            print(f'{comp["name"]} page {page}: {len(records)} records')
            if not records or len(records) < PAGE_SIZE:
                break
            time.sleep(0.4)

    unique = {}
    for record in all_records:
        key = str(record.get("gid") or record.get("match_gid") or record.get("match_id") or record.get("matchId") or json.dumps(record, sort_keys=True))
        unique.setdefault(key, record)
    records = list(unique.values())
    hyd = [r for r in records if find_hyderabad(r)]
    save_json(OUTPUT_DIR / "smat_results.json", records)
    save_json(OUTPUT_DIR / "hyderabad_smat_matches.json", hyd)
    save_json(OUTPUT_DIR / "smat_download_report.json", {
        "competitions": COMPETITIONS, "successful_pages": successful_pages,
        "failed_pages": failed_pages, "unique_records": len(records),
        "hyderabad_matches": len(hyd), "completed_at_utc": datetime.now(timezone.utc).isoformat(),
    })
    print(f"Unique records: {len(records)}; Hyderabad matches: {len(hyd)}; failed pages: {len(failed_pages)}")


if __name__ == "__main__":
    main()
