#!/usr/bin/env python3
"""Fetch BCCI/EllipseData competition squads for India and West Indies."""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "matches" / "bcci-squads.json"
BASE_URL = "https://epr.ellipsedata.com/redirect/1/comp/9060/squads?team_id="
TEAMS = ("6", "4")


def fetch(team_id):
    req = Request(
        BASE_URL + team_id,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClubSquads/1.0)",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.bcci.tv/",
        },
    )
    with urlopen(req, timeout=35) as response:
        payload = json.loads(response.read().decode("utf-8-sig"))
    if not isinstance(payload, dict) or not isinstance(payload.get("teams"), list):
        raise ValueError(f"Unexpected squads response for team_id={team_id}")
    team_rows = [row for row in payload["teams"] if str(row.get("team_id")) == team_id]
    if not team_rows or not any(
        isinstance(row.get("players"), list) and row["players"] for row in team_rows
    ):
        raise ValueError(f"No squad players in response for team_id={team_id}")
    for team in team_rows:
        for player in team["players"]:
            if not isinstance(player, dict) or not (
                player.get("player_id") or player.get("player_name")
            ):
                raise ValueError(f"Invalid player entry for team_id={team_id}")
    return payload


def main():
    try:
        payloads = {team_id: fetch(team_id) for team_id in TEAMS}
        india = payloads["6"]
        west_indies = payloads["4"]
        # Merge squad class entries (ODI/T20I) and preserve original source metadata.
        squads = {}
        for team_id, payload in payloads.items():
            for team in payload.get("teams", []):
                if str(team.get("team_id")) != team_id:
                    continue
                class_id = str(
                    team.get("squad_class_id") or payload.get("class_id") or ""
                )
                key = team_id + ":" + class_id
                squads[key] = {
                    "teamId": team_id,
                    "teamName": team.get("team_name")
                    or ("India" if team_id == "6" else "West Indies"),
                    "classId": class_id,
                    "competitionId": payload.get("comp_id"),
                    "competitionName": payload.get("comp_name"),
                    "season": payload.get("season"),
                    "flagUrl": team.get("flag_url"),
                    "logoUrl": team.get("logo_url"),
                    "players": team.get("players", []),
                    "source": BASE_URL + team_id,
                }
        if not any(row["teamId"] == "6" for row in squads.values()) or not any(
            row["teamId"] == "4" for row in squads.values()
        ):
            raise ValueError("Snapshot missing India or West Indies squads")
        snapshot = {
            "source": "https://epr.ellipsedata.com/redirect/1/comp/9060/squads",
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "status": "updated-from-bcci-squads",
            "competitionId": 9060,
            "competitionName": "West Indies in India",
            "season": india.get("season") or west_indies.get("season"),
            "squads": list(squads.values()),
            "sourceResponses": payloads,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temp = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                newline="",
                dir=OUTPUT.parent,
                prefix=f".{OUTPUT.name}.",
                suffix=".tmp",
                delete=False,
            ) as stream:
                temp = Path(stream.name)
                stream.write(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            candidate = json.loads(temp.read_text(encoding="utf-8"))
            if (
                candidate.get("status") != "updated-from-bcci-squads"
                or len(candidate.get("squads", [])) < 2
            ):
                raise ValueError("Squads snapshot validation failed")
            os.replace(temp, OUTPUT)
            temp = None
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)
        print(
            f"Saved {len(snapshot['squads'])} India/West Indies squad lists to {OUTPUT.relative_to(ROOT)}"
        )
        return 0
    except Exception as exc:
        print(
            f"ERROR: BCCI squads refresh failed; previous snapshot preserved: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
