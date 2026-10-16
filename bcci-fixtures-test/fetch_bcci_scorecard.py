#!/usr/bin/env python3
"""Refresh the dedicated BCCI scorecard snapshot inside bcci-fixtures-test/."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "bcci-scorecard.json"
URL = "https://stats.bcci.tv/match/e0b67c41-cd96-4b62-9281-2636607533a1/scorecard"

def main():
    request = Request(URL, headers={
        "User-Agent": "Mozilla/5.0 (compatible; CricZone-BCCI-Snapshot/1.0)",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://www.bcci.tv/",
    })
    status = 0
    content_type = ""
    try:
        with urlopen(request, timeout=25) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            raw = response.read().decode("utf-8", errors="replace")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("BCCI response was not a JSON object")
        payload = {
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": URL,
            "matchId": "e0b67c41-cd96-4b62-9281-2636607533a1",
            "status": "ok",
            "httpStatus": status,
            "contentType": content_type,
            "data": payload.get("data", payload),
            "error": None,
        }
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        print(f"BCCI scorecard fetch failed: {exc}", file=sys.stderr)
        if OUTPUT.exists():
            print("Keeping the last known good scorecard snapshot.")
            return 0
        payload = {
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": URL,
            "matchId": "e0b67c41-cd96-4b62-9281-2636607533a1",
            "status": "error",
            "httpStatus": status or None,
            "contentType": content_type,
            "data": {},
            "error": str(exc),
        }
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(OUTPUT)
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes), status={payload['status']}")
    return 0 if payload["status"] == "ok" else 1

if __name__ == "__main__":
    raise SystemExit(main())
