#!/usr/bin/env python3
"""Refresh the scorecard for the currently live BCCI match in bcci-fixtures-test/."""
import json
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
        raise RuntimeError("BCCI fixtures feed has no current live match")
    live = [m for m in matches if str(m.get("match_status", "")).lower() in {"live", "in progress"}
            or "in play" in str(m.get("live_status_name", "")).lower()
            or str(m.get("live_status_id", "")) == "1"]
    candidates = live
    candidates.sort(key=lambda m: (str(m.get("start_datetime_utc", "")), str(m.get("gid", ""))), reverse=True)
    for match in candidates:
        gid = match.get("gid") or match.get("match_id")
        if gid:
            return str(gid), match, bool(live)
    raise RuntimeError("No match ID found in BCCI live feed")

def main():
    try:
        match_id, live_match, is_live = choose_match()
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
        payload = {
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": url,
            "matchId": match_id,
            "isLive": is_live,
            "liveMatch": live_match,
            "status": "ok",
            "httpStatus": status,
            "contentType": content_type,
            "data": data.get("data", data),
            "error": None,
        }
        temp = OUTPUT.with_suffix(".json.tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(OUTPUT)
        print(f"Wrote {OUTPUT} for {'LIVE' if is_live else 'latest available'} match {match_id}; HTTP {status}")
        return 0
    except (HTTPError, URLError, TimeoutError, ValueError, OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"BCCI scorecard refresh failed: {exc}", file=sys.stderr)
        # Never replace a good scorecard with an empty/error payload.
        return 0 if OUTPUT.exists() else 1

if __name__ == "__main__":
    raise SystemExit(main())
