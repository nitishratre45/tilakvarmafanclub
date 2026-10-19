import json
import time
import os
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent

INPUT_JSON = Path(os.getenv(
    "BCCI_SCOREBOARD_INPUT_JSON",
    str(BASE_DIR / "hyderabad_vijay_hazare_data" / "hyderabad_vijay_hazare_matches.json"),
))

OUTPUT_DIR = BASE_DIR / "hyd_scoreboards" / "json"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

URL = "https://stats.bcci.tv/match/{}/scorecard"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Referer": "https://stats.bcci.tv/",
}


def save_json(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def collect_gids(data):
    gids = []
    seen = set()

    def walk(item):
        if isinstance(item, dict):
            gid = item.get("gid")

            if isinstance(gid, str) and gid.strip():
                gid = gid.strip()

                if gid not in seen:
                    seen.add(gid)
                    gids.append(gid)

            for value in item.values():
                walk(value)

        elif isinstance(item, list):
            for value in item:
                walk(value)

    walk(data)
    return gids


def main():
    print("HYD Scoreboard JSON Downloader")

    if not INPUT_JSON.exists():
        print(f"Input JSON nahi mili:\n{INPUT_JSON}")
        return

    try:
        with INPUT_JSON.open("r", encoding="utf-8-sig") as file:
            source = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        print(f"Input JSON error: {error}")
        return

    gids = collect_gids(source)

    if not gids:
        print("Source JSON mein gid nahi mili.")
        return

    print(f"Total unique GIDs: {len(gids)}")

    results = []
    errors = []

    with requests.Session() as session:
        session.headers.update(HEADERS)

        for number, gid in enumerate(gids, start=1):
            print(f"\n[{number}/{len(gids)}] {gid}")

            try:
                response = session.get(
                    URL.format(gid),
                    timeout=40,
                )
                response.raise_for_status()

                try:
                    data = response.json()
                except ValueError:
                    raise ValueError(
                        "BCCI response valid JSON nahi hai; "
                        "HTML save nahi kiya."
                    )

                output_file = OUTPUT_DIR / f"{gid}.json"
                save_json(output_file, data)

                results.append({
                    "gid": gid,
                    "status": "success",
                    "file": str(output_file),
                    "data_type": type(data).__name__,
                    "keys": (
                        list(data.keys())
                        if isinstance(data, dict)
                        else None
                    ),
                })

                print(f"JSON saved: {output_file}")

            except Exception as error:
                errors.append({
                    "gid": gid,
                    "error": str(error),
                })
                print(f"FAILED: {error}")

            time.sleep(0.5)

    save_json(OUTPUT_DIR / "fetch_report.json", results)
    save_json(OUTPUT_DIR / "errors.json", errors)

    print("\nProcess complete.")
    print(f"Success: {len(results)}")
    print(f"Failed: {len(errors)}")
    print(f"Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()