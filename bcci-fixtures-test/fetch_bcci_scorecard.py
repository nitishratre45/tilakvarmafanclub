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
LIVE_FILE = ROOT / "live-matches.json"
BASE = "https://stats.bcci.tv/match/{}/scorecard"

def read_json(path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)

def choose_match():
    if not FIXTURES_FILE.exists():
        raise RuntimeError("bcci-fixtures.json is missing")

    fixture_snapshot = read_json(FIXTURES_FILE)
    fixture_data = fixture_snapshot.get("data") or fixture_snapshot
    fixtures = fixture_data.get("match") or fixture_data.get("matches") or []

    # The fixtures snapshot can be hours old and still say "forthcoming" while a
    # match is live. Prefer the dedicated five-minute live-score snapshot.
    if LIVE_FILE.exists():
        live_snapshot = read_json(LIVE_FILE)
        if live_snapshot.get("status") == "updated-from-bcci-live-scores":
            live_rows = live_snapshot.get("matches")
            if not isinstance(live_rows, list):
                raise RuntimeError("BCCI live snapshot has an invalid matches field")
            if not live_rows:
                return None

            candidates = sorted(
                live_rows,
                key=lambda row: str((row.get("raw") or {}).get("start_datetime_utc", "")),
                reverse=True,
            )
            for entry in candidates:
                raw = entry.get("raw") if isinstance(entry.get("raw"), dict) else {}
                gid = raw.get("gid") or raw.get("match_gid") or entry.get("id")
                match_id = raw.get("match_id") or raw.get("id")
                resolved = None
                if not match_id and gid:
                    resolved = next(
                        (
                            item
                            for item in fixtures
                            if str(item.get("gid") or item.get("match_gid") or "") == str(gid)
                            and item.get("match_id")
                        ),
                        None,
                    )
                    if resolved:
                        match_id = resolved.get("match_id") or resolved.get("id")
                if match_id and str(match_id).isdigit():
                    match = {**(resolved or {}), **raw, **entry}
                    match["gid"] = gid or match.get("gid")
                    return str(match_id), match, True

            raise RuntimeError("Live BCCI match found, but its numeric match_id could not be resolved")

    # Backward-compatible fallback for deployments where the live snapshot has
    # not been created yet. Never treat a valid empty live snapshot as stale data.
    live = [
        m for m in fixtures
        if str(m.get("match_status", "")).lower() in {"live", "in progress"}
        or "in play" in str(m.get("live_status_name", "")).lower()
        or str(m.get("live_status_id", "")) == "1"
    ]
    if not live:
        return None
    live.sort(
        key=lambda m: (str(m.get("start_datetime_utc", "")), str(m.get("gid", ""))),
        reverse=True,
    )
    for match in live:
        match_id = match.get("match_id") or match.get("id")
        if match_id and str(match_id).isdigit():
            return str(match_id), match, True
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
