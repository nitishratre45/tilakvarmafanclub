#!/usr/bin/env python3
"""Fetch official BCCI squad responses for every fixture in the isolated test folder."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent
FIXTURES_PATH = BASE_DIR / "bcci-fixtures.json"
OUTPUT_DIR = BASE_DIR / "squads"
BASE_URL = "https://epr.ellipsedata.com/redirect/1/comp/{comp_id}/squads"
TIMEOUT_SECONDS = 30
RETRIES = 3


def load_fixtures() -> list[dict]:
    payload = json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("status") != "ok":
        raise ValueError("bcci-fixtures.json is missing or status is not 'ok'.")
    root = payload.get("data") or {}
    matches = root.get("match") or root.get("matches") or root.get("fixtures")
    if not isinstance(matches, list) or not matches:
        raise ValueError("No fixture list found in bcci-fixtures.json.")
    return matches


def valid_response(payload: object) -> bool:
    # Reject empty payloads and API-level error objects: HTTP 200 can still
    # contain an authorization/service error and must never be saved as a squad.
    if payload is None or payload == {} or payload == []:
        return False
    if isinstance(payload, dict):
        if payload.get("error"):
            return False
        status = str(payload.get("status", "")).strip().lower()
        if status in {"error", "failed", "unauthorized", "forbidden"}:
            return False
    return True


def fetch_team_squad(comp_id: str, team_id: str, edak: str) -> object:
    url = BASE_URL.format(comp_id=comp_id) + "?" + urlencode({"team_id": team_id})
    # Match the supplied browser request headers, but keep the API key in
    # the GitHub Actions secret instead of hardcoding it in the repository.
    headers = {
        "accept": "*/*",
        "accept-language": (
            "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7,hi;q=0.6,zh-CN;q=0.5,zh;q=0.4"
        ),
        "cache-control": "no-cache",
        "content-type": "application/json",
        "origin": "https://www.bcci.tv",
        "pragma": "no-cache",
        "referer": "https://www.bcci.tv/",
        "user-agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/155.0.0.0 Safari/537.36"
        ),
        "edak": edak,
    }
    last_error = None
    for attempt in range(1, RETRIES + 1):
        try:
            request = Request(url, headers=headers, method="GET")
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                status = response.status
                raw = response.read()
            if status < 200 or status >= 300:
                raise ValueError(f"Unexpected HTTP status {status}")
            if not raw.strip():
                raise ValueError("API returned an empty response body")
            payload = json.loads(raw.decode("utf-8"))
            if not valid_response(payload):
                raise ValueError("API returned an empty JSON payload")
            return payload
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < RETRIES:
                time.sleep(attempt * 2)
    raise RuntimeError(f"Squad request failed for comp_id={comp_id}, team_id={team_id}: {last_error}")


def write_json_atomically(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> int:
    edak = os.environ.get("ELIPSE_EDAK", "").strip()
    if not edak:
        print(
            "Missing ELIPSE_EDAK secret. Add it in GitHub repository Actions secrets; "
            "the API credential is intentionally not hardcoded.",
            file=sys.stderr,
        )
        return 2

    try:
        fixtures = load_fixtures()
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Cannot load fixtures: {exc}", file=sys.stderr)
        return 2

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    saved = skipped = failed = 0
    seen: set[str] = set()

    for index, match in enumerate(fixtures, start=1):
        if not isinstance(match, dict):
            print(f"[{index}] Skipping non-object fixture.")
            skipped += 1
            continue
        match_id = str(match.get("match_id") or match.get("matchId") or match.get("gid") or "").strip()
        comp_id = str(match.get("comp_id") or "").strip()
        team1_id = str(match.get("team1_id") or match.get("home_team_id") or "").strip()
        team2_id = str(match.get("team2_id") or match.get("away_team_id") or "").strip()
        if not all((match_id, comp_id, team1_id, team2_id)):
            print(f"[{index}] Skipping fixture with missing match/competition/team IDs.")
            skipped += 1
            continue
        if not match_id.isdigit():
            print(f"[{index}] Skipping invalid match ID: {match_id!r}.")
            skipped += 1
            continue
        if match_id in seen:
            print(f"[{index}] Skipping duplicate match ID {match_id}.")
            skipped += 1
            continue
        seen.add(match_id)

        try:
            # Do not write anything until both teams have returned usable JSON.
            team1_payload = fetch_team_squad(comp_id, team1_id, edak)
            team2_payload = fetch_team_squad(comp_id, team2_id, edak)
            output = {
                "status": "ok",
                "match_id": match_id,
                "comp_id": comp_id,
                "match": {
                    "name": match.get("name") or match.get("match_short_name") or match.get("title"),
                    "date": match.get("start_date") or match.get("date_string"),
                    "team1_id": team1_id,
                    "team1_name": match.get("team1_name") or match.get("team1_short_name"),
                    "team2_id": team2_id,
                    "team2_name": match.get("team2_name") or match.get("team2_short_name"),
                },
                "teams": {
                    "team1": {"team_id": team1_id, "response": team1_payload},
                    "team2": {"team_id": team2_id, "response": team2_payload},
                },
                "source": BASE_URL.format(comp_id=comp_id),
                "fetched_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            write_json_atomically(OUTPUT_DIR / f"{match_id}.json", output)
            print(f"[{index}/{len(fixtures)}] Saved squads/{match_id}.json")
            saved += 1
        except Exception as exc:
            # Existing saved files are untouched if either request fails.
            print(f"[{index}/{len(fixtures)}] ERROR match {match_id}: {exc}", file=sys.stderr)
            failed += 1

    print(f"Finished: saved={saved}, skipped={skipped}, failed={failed}, fixtures={len(fixtures)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
