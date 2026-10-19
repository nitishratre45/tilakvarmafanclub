
import json
import time
import os
from pathlib import Path
from datetime import datetime, timezone

import requests

# =============== CONFIG ===============
API_URL = "https://stats.bcci.tv/match/results/"
COMP_GID = os.getenv("BCCI_COMP_GID", "c0e6546e-e782-411e-9a38-6387eeaa5bc2")

START_DATE = os.getenv("BCCI_MIN_START_DATE", "2019-01-01")
FIRST_PAGE = int(os.getenv("BCCI_FIRST_PAGE", "1"))
LAST_PAGE = int(os.getenv("BCCI_LAST_PAGE", "20"))
PAGE_SIZE = int(os.getenv("BCCI_PAGE_SIZE", "12"))

OUTPUT_DIR = Path(os.getenv("BCCI_RESULTS_OUTPUT_DIR", "hyderabad_vijay_hazare_data"))
PAGES_DIR = OUTPUT_DIR / "pages"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://stats.bcci.tv/",
}


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def find_records(obj):
    """Locate lists of match objects in nested API JSON."""
    if isinstance(obj, list):
        dictionaries = [x for x in obj if isinstance(x, dict)]
        if dictionaries and any(
            any(k in x for k in (
                "comp_name", "match_id", "match_gid",
                "match_start_date", "match_date"
            ))
            for x in dictionaries
        ):
            return dictionaries

        for item in obj:
            result = find_records(item)
            if result:
                return result

    elif isinstance(obj, dict):
        # Direct list-valued properties first.
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
    return "".join(
        c for c in str(value).lower() if c.isalnum()
    )


def find_hyderabad(record):
    """Check team-specific fields and nested team objects."""
    names = []
    team_ids = []

    def walk(obj, parent_key=""):
        if isinstance(obj, dict):
            for key, value in obj.items():
                k = normalise(key)

                if isinstance(value, str):
                    if (
                        "team" in k
                        and ("name" in k or k in {"team", "team1", "team2"})
                    ):
                        names.append(value)

                elif isinstance(value, (dict, list)):
                    if isinstance(value, dict):
                        if "team" in k or k in {"home", "away"}:
                            for name_key in (
                                "team_name", "teamName", "name",
                                "short_name", "team_short_name"
                            ):
                                if isinstance(value.get(name_key), str):
                                    names.append(value[name_key])

                            for id_key in ("team_id", "team_gid", "id"):
                                if value.get(id_key) is not None:
                                    team_ids.append(str(value[id_key]))

                    walk(value, k)

        elif isinstance(obj, list):
            for item in obj:
                walk(item, parent_key)

    walk(record)

    if any(normalise(n) in {"hyderabad", "hyd"} for n in names):
        return True

    # No guessed team ID: names are used until the real ID is verified.
    return False


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update(HEADERS)

    all_records = []
    failed_pages = []
    successful_pages = 0

    for page in range(FIRST_PAGE, LAST_PAGE + 1):
        params = {
            "comp_gid": COMP_GID,
            "min_start_date": START_DATE,
            "page": page,
            "size": PAGE_SIZE,
        }

        data = None
        url = None

        for attempt in range(1, 4):
            try:
                response = session.get(
                    API_URL, params=params, timeout=40
                )
                response.raise_for_status()
                data = response.json()
                url = response.url
                break
            except (requests.RequestException, ValueError) as error:
                print(f"Page {page}, attempt {attempt}: {error}")
                time.sleep(attempt * 2)

        if data is None:
            failed_pages.append(page)
            continue

        successful_pages += 1

        # Save complete raw response before parsing.
        save_json(
            PAGES_DIR / f"page_{page:03d}.json",
            {
                "page": page,
                "url": url,
                "saved_at_utc": datetime.now(
                    timezone.utc
                ).isoformat(),
                "response": data,
            },
        )

        records = find_records(data)
        all_records.extend(records)

        print(
            f"Page {page}/{LAST_PAGE}: "
            f"{len(records)} records"
        )

        if page == FIRST_PAGE and not records:
            save_json(
                OUTPUT_DIR / "response_structure.json",
                {
                    "top_level_type": type(data).__name__,
                    "top_level_keys": (
                        list(data.keys())
                        if isinstance(data, dict) else []
                    ),
                    "response_preview": str(data)[:5000],
                },
            )
            print(
                "WARNING: No match list detected. "
                "Raw response and structure diagnostic saved."
            )

        time.sleep(0.4)

    # Deduplicate records.
    unique = {}
    for record in all_records:
        match_id = (
            record.get("match_id")
            or record.get("match_gid")
            or record.get("matchId")
            or record.get("gid")
        )
        key = str(match_id) if match_id else json.dumps(
            record, sort_keys=True, ensure_ascii=False
        )
        unique.setdefault(key, record)

    records = list(unique.values())

    # Keep only records explicitly identifying Hyderabad as a team.
    hyderabad = [
        record for record in records
        if find_hyderabad(record)
    ]

    save_json(OUTPUT_DIR / "vijay_hazare_results.json", records)
    save_json(
        OUTPUT_DIR / "hyderabad_vijay_hazare_matches.json",
        hyderabad,
    )

    save_json(
        OUTPUT_DIR / "vijay_hazare_download_report.json",
        {
            "competition_id": COMP_GID,
            "start_date": START_DATE,
            "requested_pages": LAST_PAGE - FIRST_PAGE + 1,
            "successful_pages": successful_pages,
            "failed_pages": failed_pages,
            "unique_records": len(records),
            "hyderabad_matches": len(hyderabad),
            "completed_at_utc": datetime.now(
                timezone.utc
            ).isoformat(),
        },
    )

    print("\n========== COMPLETE ==========")
    print(f"Successful pages: {successful_pages}/{LAST_PAGE}")
    print(f"Unique records: {len(records)}")
    print(f"Hyderabad matches: {len(hyderabad)}")
    print(f"Failed pages: {failed_pages}")
    print(f"Output: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
