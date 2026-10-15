#!/usr/bin/env python3
"""Refresh BCCI/EllipseData competition squads without losing the last good snapshot.

The provider has been returning a changed/error response for team_id=6. A
refresh is accepted only when both team requests contain identifiable players.
An unavailable/changed provider response exits non-zero and preserves the saved
snapshot, so the five-minute schedule can retry safely.
"""
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "matches" / "bcci-squads.json"
BASE_URL = "https://epr.ellipsedata.com/redirect/1/comp/9060/squads?team_id="
TEAMS = (("6", "India"), ("4", "West Indies"))


def fetch(team_id, expected_name):
    req = Request(
        BASE_URL + team_id,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClubSquads/1.0)",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.bcci.tv/",
        },
    )
    with urlopen(req, timeout=35) as response:
        raw = response.read().decode("utf-8-sig")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Non-JSON response for team_id={team_id}; provider may have changed or returned HTML"
        ) from exc

    # Some redirects/providers return a useful error object or wrap records
    # differently. Fail safely with a short schema summary rather than assuming
    # the response is an official squad.
    if not isinstance(payload, dict):
        raise ValueError(
            f"Unexpected JSON type for team_id={team_id}: {type(payload).__name__}"
        )
    teams = payload.get("teams")
    if not isinstance(teams, list):
        # The endpoint is currently returning {"error": ...} for team_id=6.
        # Treat provider-side errors as a transient refresh failure, retaining
        # the last saved squad snapshot and letting the scheduled job retry.
        if payload.get("error"):
            message = str(payload["error"]).replace("\\n", " ").strip()[:240]
            raise ValueError(
                f"Squads provider error for team_id={team_id}: {message}; saved snapshot preserved"
            )
        keys = ", ".join(sorted(str(k) for k in payload.keys())[:12]) or "no keys"
        raise ValueError(
            f"Unexpected squads response for team_id={team_id} (keys: {keys}); saved snapshot preserved"
        )

    team_rows = [
        row
        for row in teams
        if isinstance(row, dict)
        and str(row.get("team_id", row.get("teamId", ""))) == team_id
    ]
    if not team_rows:
        # If the endpoint responds with teams but omits IDs, do not guess based
        # on response order; assigning the wrong team would corrupt the snapshot.
        raise ValueError(
            f"No explicit {expected_name} team_id={team_id} in provider response"
        )

    valid_rows = []
    for team in team_rows:
        players = team.get("players")
        if not isinstance(players, list) or not players:
            continue
        valid_players = [
            player
            for player in players
            if isinstance(player, dict)
            and (
                player.get("player_id")
                or player.get("playerId")
                or player.get("player_name")
                or player.get("playerName")
            )
        ]
        if not valid_players:
            continue
        # Preserve the provider's player objects; only reject malformed/empty lists.
        valid_rows.append((team, valid_players))
    if not valid_rows:
        raise ValueError(
            f"No valid players in {expected_name} response for team_id={team_id}"
        )
    return payload, valid_rows


def main():
    try:
        payloads = {}
        rows_by_team = {}
        errors = []
        for team_id, team_name in TEAMS:
            try:
                payloads[team_id], rows_by_team[team_id] = fetch(team_id, team_name)
            except Exception as exc:
                # Try both team endpoints even if one is blocked, so diagnostics
                # show which provider routes are actually usable. Never publish
                # a partial snapshot: both teams must have valid player records.
                errors.append((team_id, team_name, exc))
                print(
                    f"WARNING: squad endpoint unavailable for {team_name} "
                    f"(team_id={team_id}): {exc}",
                    file=sys.stderr,
                )
        if errors:
            details = "; ".join(
                f"{name} team_id={team_id}: {exc}" for team_id, name, exc in errors
            )
            raise ValueError(
                f"Could not refresh every required squad ({details}); saved snapshot preserved"
            )

        squads = {}
        for team_id, team_name in TEAMS:
            payload = payloads[team_id]
            for team, players in rows_by_team[team_id]:
                class_id = str(
                    team.get("squad_class_id")
                    or team.get("class_id")
                    or payload.get("class_id")
                    or ""
                )
                key = team_id + ":" + class_id
                squads[key] = {
                    "teamId": team_id,
                    "teamName": team.get("team_name")
                    or team.get("teamName")
                    or team_name,
                    "classId": class_id,
                    "competitionId": payload.get(
                        "comp_id", payload.get("competition_id")
                    ),
                    "competitionName": payload.get(
                        "comp_name", payload.get("competition_name")
                    ),
                    "season": payload.get("season"),
                    "flagUrl": team.get("flag_url") or team.get("flagUrl"),
                    "logoUrl": team.get("logo_url") or team.get("logoUrl"),
                    "players": players,
                    "source": BASE_URL + team_id,
                }
        for team_id, team_name in TEAMS:
            if not any(
                s["teamId"] == team_id and s["players"] for s in squads.values()
            ):
                raise ValueError(f"Snapshot missing non-empty {team_name} squad")

        india = payloads["6"]
        west_indies = payloads["4"]
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
            if candidate.get("status") != "updated-from-bcci-squads" or not all(
                any(
                    s.get("teamId") == team_id and s.get("players")
                    for s in candidate["squads"]
                )
                for team_id, _ in TEAMS
            ):
                raise ValueError("Squads snapshot validation failed")
            os.replace(temp, OUTPUT)
            temp = None
        finally:
            if temp is not None:
                temp.unlink(missing_ok=True)

        print(
            f"Saved {len(snapshot['squads'])} squad lists to {OUTPUT.relative_to(ROOT)}"
        )
        return 0
    except (Exception,) as exc:
        print(
            f"ERROR: BCCI squads refresh failed; previous snapshot preserved: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
