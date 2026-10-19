import json
import time
from pathlib import Path
import requests

BASE_DIR = Path(__file__).resolve().parent
INPUT_JSON = BASE_DIR / "data" / "hyderabad_smat_data" / "hyderabad_smat_matches.json"
OUTPUT_DIR = BASE_DIR / "data" / "hyd_scoreboards" / "json"
URL = "https://stats.bcci.tv/match/{}/scorecard"
HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://stats.bcci.tv/"}


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def collect_gids(data):
    gids, seen = [], set()
    def walk(item):
        if isinstance(item, dict):
            gid = item.get("gid")
            if isinstance(gid, str) and gid.strip() and gid not in seen:
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
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not INPUT_JSON.exists():
        print(f"Input JSON missing: {INPUT_JSON}. Run smat.py first.")
        return
    source = json.loads(INPUT_JSON.read_text(encoding="utf-8-sig"))
    gids = collect_gids(source)
    results, errors = [], []
    with requests.Session() as session:
        session.headers.update(HEADERS)
        for number, gid in enumerate(gids, 1):
            print(f"[{number}/{len(gids)}] {gid}")
            try:
                response = session.get(URL.format(gid), timeout=40)
                response.raise_for_status()
                data = response.json()
                save_json(OUTPUT_DIR / f"{gid}.json", data)
                results.append({"gid": gid, "status": "success", "keys": list(data) if isinstance(data, dict) else None})
            except Exception as error:
                errors.append({"gid": gid, "error": str(error)})
            time.sleep(0.5)
    save_json(OUTPUT_DIR / "fetch_report.json", results)
    save_json(OUTPUT_DIR / "errors.json", errors)
    print(f"Scorecards success: {len(results)}; failed: {len(errors)}")


if __name__ == "__main__":
    main()
