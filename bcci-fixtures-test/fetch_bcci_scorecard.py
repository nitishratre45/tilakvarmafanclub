#!/usr/bin/env python3
"""Refresh the scorecard for the currently live BCCI match in bcci-fixtures-test/."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "bcci-scorecard.json"
FIXTURES_FILE = ROOT / "bcci-fixtures.json"
BASE = "https://stats.bcci.tv/match/{}/scorecard"

def read_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)

def choose_match():
    if not FIXTURES_FILE.exists():
        raise RuntimeError("bcci-fixtures.json is missing")
    snapshot = read_json(FIXTURES_FILE)
    data = snapshot.get("data") or snapshot
    matches = data.get("match") or data.get("matches") or []
    if not matches:
        # An empty fixtures snapshot is not evidence of a live match. Preserve the
        # last verified scorecard instead of failing every scheduled no-match run.
        return None
    live = [m for m in matches if str(m.get("match_status", "")).lower() in {"live", "in progress"}
            or "in play" in str(m.get("live_status_name", "")).lower()
            or str(m.get("live_status_id", "")) == "1"]
    if not live:
        # Upcoming/completed fixtures are normal when no match is in progress.
        return None
    candidates = live
    candidates.sort(key=lambda m: (str(m.get("start_datetime_utc", "")), str(m.get("gid", ""))), reverse=True)
    for match in candidates:
        # BCCI /match/{id}/scorecard expects the numeric match_id (e.g. 237261),
        # not the UUID gid used by fixtures/live_scores (e.g. b567f7d4-...).
        match_id = match.get("match_id") or match.get("id")
        gid = match.get("gid") or match.get("match_gid")
        if match_id:
            return str(match_id), match, bool(live)
        if gid:
            # The live_scores feed may omit match_id; resolve it from fixtures,
            # whose records normally contain both gid and numeric match_id.
            fixtures = read_json(FIXTURES_FILE)
            all_matches = (fixtures.get("data") or fixtures).get("match") or []
            resolved = next((m for m in all_matches if str(m.get("gid", "")) == str(gid) and m.get("match_id")), None)
            if resolved:
                return str(resolved["match_id"]), {**resolved, **match}, bool(live)
    raise RuntimeError("No numeric BCCI match_id found in live feed / fixtures")

def main():
    try:
        selection = choose_match()
        if selection is None:
            print("No live BCCI match found; retaining the last verified scorecard.")
            output_path = os.environ.get("GITHUB_OUTPUT")
            if output_path:
                with open(output_path, "a", encoding="utf-8") as output:
                    output.write("no_live_match=true\n")
            return 0
        match_id, live_match, is_live = selection
        url = BASE.format(match_id)
        request = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; CricZone-BCCI-Snapshot/1.0)",
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://www.bcci.tv/",
        })
        with urlopen(request, timeout=25) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            raw = response.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("BCCI scorecard response was not a JSON object")
        if not data or data.get("error") or str(data.get("status", "")).strip().lower() in {
            "error", "failed", "unauthorized", "forbidden"
        }:
            raise ValueError("BCCI scorecard API returned an empty or error payload")
        score_data = data.get("data", data)
        if not isinstance(score_data, dict) or not score_data:
            raise ValueError("BCCI scorecard API returned no scorecard data")
        payload = {
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": url,
            "matchId": match_id,
            "isLive": is_live,
            "liveMatch": live_match,
            "status": "ok",
            "httpStatus": status,
            "contentType": content_type,
            "data": score_data,
            "error": None,
        }
        temp = OUTPUT.with_suffix(".json.tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(OUTPUT)
        print(f"Wrote {OUTPUT} for {'LIVE' if is_live else 'latest available'} match {match_id}; HTTP {status}")
        return 0
    except (HTTPError, URLError, TimeoutError, ValueError, OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"BCCI scorecard refresh failed: {exc}", file=sys.stderr)
        # Never replace a good scorecard with an empty/error payload, but do
        # return failure so Actions alerts on stale snapshots instead of hiding it.
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
