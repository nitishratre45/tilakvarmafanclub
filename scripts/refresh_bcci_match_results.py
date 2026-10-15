#!/usr/bin/env python3
"""Fetch paginated BCCI match results for India and West Indies into a safe JSON snapshot."""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "matches" / "bcci-match-results.json"
BASE_URL = "https://stats.bcci.tv/match/results/"
CLASS_IDS = "36,3,6,13,16,23,26,29,33"
TEAM_IDS = ("6", "4")  # India, West Indies
PAGE_SIZE = 100
MAX_PAGES = 100


def fetch_page(team_id, page_number):
    query = urlencode(
        {
            "team_id": team_id,
            "class_id": CLASS_IDS,
            "page": page_number,
            "size": PAGE_SIZE,
        }
    )
    request = Request(
        BASE_URL + "?" + query,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClubResults/1.0)",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.bcci.tv/",
        },
    )
    with urlopen(request, timeout=35) as response:
        payload = json.loads(response.read().decode("utf-8-sig"))
    if not isinstance(payload, dict) or not isinstance(payload.get("match"), list):
        raise ValueError(
            f"Unexpected BCCI results payload for team_id={team_id}, page={page_number}"
        )
    return payload


def fetch_team(team_id):
    first = fetch_page(team_id, 1)
    page = first.get("page") or {}
    last_page = int(page.get("last_page") or 1)
    total_rows = int(page.get("total_rows") or len(first["match"]))
    if not 1 <= last_page <= MAX_PAGES or total_rows < 0:
        raise ValueError(f"Invalid pagination metadata for team_id={team_id}: {page}")
    matches = list(first["match"])
    for number in range(2, last_page + 1):
        payload = fetch_page(team_id, number)
        matches.extend(payload["match"])
        print(f"team_id={team_id}: fetched page {number}/{last_page}")
    if total_rows and not matches:
        raise ValueError(f"BCCI returned no matches for team_id={team_id}")
    return {
        "teamId": team_id,
        "pagination": page,
        "pagesFetched": last_page,
        "reportedTotalRows": total_rows,
        "matches": matches,
    }


def main():
    try:
        teams = [fetch_team(team_id) for team_id in TEAM_IDS]
        # Preserve the complete original match objects, deduplicated by stable BCCI ID.
        by_id = {}
        for team in teams:
            for match in team["matches"]:
                if not isinstance(match, dict):
                    raise ValueError("BCCI match array contains a non-object record")
                stable_id = str(match.get("gid") or match.get("match_id") or "").strip()
                if not stable_id:
                    raise ValueError(
                        "BCCI match record has neither gid nor match_id; refusing partial snapshot"
                    )
                by_id[stable_id] = match
        if not by_id:
            raise ValueError(
                "No match records received; existing snapshot will be preserved"
            )
        snapshot = {
            "source": BASE_URL,
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "status": "updated-from-bcci-match-results",
            "teamsFetched": [team["teamId"] for team in teams],
            "teamReports": [
                {k: v for k, v in team.items() if k != "matches"} for team in teams
            ],
            "matchCount": len(by_id),
            "matches": sorted(
                by_id.values(),
                key=lambda row: (
                    str(row.get("start_date") or ""),
                    str(row.get("start_datetime_utc") or ""),
                    str(row.get("gid") or row.get("match_id") or ""),
                ),
                reverse=True,
            ),
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=OUTPUT.parent,
                prefix=f".{OUTPUT.name}.",
                suffix=".tmp",
                delete=False,
            ) as stream:
                temp_path = Path(stream.name)
                stream.write(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            candidate = json.loads(temp_path.read_text(encoding="utf-8"))
            if (
                candidate.get("status") != "updated-from-bcci-match-results"
                or not candidate.get("matches")
                or set(candidate.get("teamsFetched", [])) != set(TEAM_IDS)
                or any(
                    not (row.get("gid") or row.get("match_id"))
                    for row in candidate["matches"]
                )
            ):
                raise ValueError("Snapshot validation failed")
            os.replace(temp_path, OUTPUT)
            temp_path = None
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
        print(
            f"Saved {len(by_id)} unique complete BCCI match records to {OUTPUT.relative_to(ROOT)}"
        )
        return 0
    except Exception as exc:
        print(
            f"ERROR: BCCI results refresh failed; previous snapshot preserved: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
