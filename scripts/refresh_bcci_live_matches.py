#!/usr/bin/env python3
"""Refresh the official BCCI live-score JSON safely; never publish an unverified payload."""
import json
import os
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "bcci-fixtures-test" / "live-matches.json"
SOURCE_URL = "https://stats.bcci.tv/match/live_scores/?comp_gid=65d2b784-4a75-41ca-8415-a345042030d6&comp_gid=34154bc1-ebbf-4109-ba78-67cf9cf7aafa&comp_gid=6a64053e-55fc-47ed-9cae-4c58e9b0e551&comp_gid=9a12946b-9277-4b5f-ba94-34d02355bf03&comp_gid=2c9a58d0-365c-4301-839e-b1d2a0803b2b&comp_gid=04d7f468-3b06-4dcc-88de-594afd83c561&comp_gid=52f44249-0afd-41aa-bb88-c6e7778a4f0d&comp_gid=97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2&comp_gid=5cd3ede8-16d7-4914-9d4c-2eb59671fe50&comp_gid=39a2078a-2e87-4f90-86eb-53696579466c&comp_gid=7ca2538b-b8e8-4221-b76f-4705cb75af1f&comp_gid=ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc&comp_gid=13de0d47-83d7-4351-8e6a-57d28a18be48&comp_gid=1cf7ed18-0c14-452c-840b-447aeb5dd020&comp_gid=96f00b0b-c06b-4764-bbc3-7ed388abb24b&comp_gid=dd82f86a-6aa4-477c-b0de-2706a677d0d2&team_gid=71790c66-0e3c-4d0b-96a5-e04526040f94&team_gid=cf9ec6b2-8d90-41a9-a834-f2f120b37811&team_gid=83151b98-bbed-42ba-b397-944059ef5830&team_gid=0f99bbe0-3198-4f82-8520-e18a9e24545f&team_gid=f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8&team_gid=4eb0e97b-6e43-47f3-8e46-bedf6de77cea&team_gid=611a0e16-280f-4fe2-98e8-366ba9719962&team_gid=01d41b53-68f6-48f8-a8d0-c9ec2f338749&team_gid=eb81d735-6436-4dac-9a7a-15a7a347d5e6&team_gid=08dc4ba8-22a1-4e5a-9862-20f8a8643f99"

LIVE_WORDS = (
    "pre-match",
    "pre match",
    "live",
    "in play",
    "playing",
    "in progress",
    "innings",
    "stumps",
    "lunch",
    "tea",
    "drinks",
    "rain delay",
    "match delayed",
    "delayed",
    "break",
)
NOT_LIVE_WORDS = (
    "upcoming",
    "scheduled",
    "not started",
    "completed",
    "result",
    "finished",
    "abandoned",
    "cancelled",
    "canceled",
    "no result",
    "won by",
    "drawn",
    "tied",
)


def rows_from(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in (
            "matches",
            "match",
            "live_scores",
            "liveScores",
            "data",
            "results",
            "score",
        ):
            value = payload.get(key)
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                nested = rows_from(value)
                if nested:
                    return nested
        # Some BCCI responses return a single match object.
        if any(
            k in payload
            for k in (
                "team1",
                "team1_name",
                "team1Name",
                "match_status",
                "status",
                "match_status_str",
            )
        ):
            return [payload]
    raise ValueError(
        "BCCI live-score response has an unknown schema; previous JSON preserved"
    )


def value(row, *keys):
    for key in keys:
        v = row.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def status_of(row):
    return value(
        row,
        "live_status_name",
        "match_status_name",
        "match_status_str",
        "match_status",
        "status_str",
        "status",
        "state",
        "matchStatus",
        "match_state",
    )


def is_live(row):
    status = status_of(row).lower()
    if not status:
        # Some BCCI live-score payloads expose only numeric status IDs. Keep
        # unknown states out of the live grid rather than guessing.
        return False
    if any(word in status for word in NOT_LIVE_WORDS):
        return False
    return any(word in status for word in LIVE_WORDS)


def main():
    try:
        request = Request(
            SOURCE_URL,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFanClubLive/1.0)",
                "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.bcci.tv/",
            },
        )
        with urlopen(request, timeout=25) as response:
            raw = response.read()
            http_status = response.status
            content_type = response.headers.get("Content-Type", "")
            print(
                f"BCCI_FETCH http_status={http_status} content_type={content_type!r} bytes={len(raw)}"
            )
            if http_status != 200:
                raise ValueError(f"BCCI returned HTTP {http_status}")
        payload = json.loads(raw.decode("utf-8-sig"))
        if isinstance(payload, dict):
            print(f"BCCI_SCHEMA top_level_keys={sorted(payload.keys())[:60]}")
        elif isinstance(payload, list):
            print("BCCI_SCHEMA top_level_type=list")
        else:
            print(f"BCCI_SCHEMA top_level_type={type(payload).__name__}")
        rows = rows_from(payload)
        print(f"BCCI_RECORDS total={len(rows)}")
        if not all(isinstance(row, dict) for row in rows):
            raise ValueError(
                "BCCI live-score rows are not objects; previous JSON preserved"
            )
        status_counts = Counter(status_of(row) or "<empty>" for row in rows)
        print(
            f"BCCI_STATUS_COUNTS {json.dumps(dict(status_counts.most_common(30)), ensure_ascii=False, sort_keys=True)}"
        )
        if rows:
            print(
                f"BCCI_SAMPLE_ROW_KEYS {json.dumps([sorted(row.keys())[:60] for row in rows[:3]], ensure_ascii=False)}"
            )
        live = []
        for row in rows:
            if not is_live(row):
                continue
            team1_id = value(row, "team1_id", "team1Id", "team_a_id")
            team2_id = value(row, "team2_id", "team2Id", "team_b_id")
            summary = row.get("summary") if isinstance(row.get("summary"), dict) else {}
            innings = (
                summary.get("innings")
                if isinstance(summary.get("innings"), list)
                else []
            )
            innings_by_team = {
                str(item.get("batting_team_id", "")): item
                for item in innings
                if isinstance(item, dict) and item.get("batting_team_id") is not None
            }

            def innings_score(team_id):
                item = innings_by_team.get(str(team_id))
                if not item:
                    return ""
                runs = value(item, "runs")
                wickets = value(item, "wickets")
                overs = value(item, "overs")
                if not runs:
                    return ""
                score = runs + ("/" + wickets if wickets else "")
                if overs:
                    score += " (" + overs + " ov)"
                return score

            live.append(
                {
                    "id": value(row, "gid", "match_id", "matchId", "id", "fixture_id"),
                    "team1": value(
                        row,
                        "team1_name",
                        "team1Name",
                        "team1",
                        "home_team_name",
                        "team_a_name",
                        "team1_short_name",
                    )
                    or "Team 1",
                    "team2": value(
                        row,
                        "team2_name",
                        "team2Name",
                        "team2",
                        "away_team_name",
                        "team_b_name",
                        "team2_short_name",
                    )
                    or "Team 2",
                    "team1_id": team1_id,
                    "team2_id": team2_id,
                    "score1": value(
                        row,
                        "team1_score",
                        "team1Score",
                        "team1_scores",
                        "score1",
                        "team_a_score",
                        "team1_innings",
                    )
                    or innings_score(team1_id),
                    "score2": value(
                        row,
                        "team2_score",
                        "team2Score",
                        "team2_scores",
                        "score2",
                        "team_b_score",
                        "team2_innings",
                    )
                    or innings_score(team2_id),
                    "status": status_of(row),
                    "match": value(
                        row,
                        "name",
                        "match_name",
                        "matchName",
                        "match",
                        "title",
                        "match_title",
                    ),
                    "series": value(
                        row,
                        "series_name",
                        "seriesName",
                        "competition_name",
                        "comp_name",
                    ),
                    "venue": value(row, "venue", "venue_name", "ground_name"),
                    "raw": row,
                }
            )
        print(
            f"BCCI_FILTER_RESULT total={len(rows)} live={len(live)} rejected={len(rows) - len(live)}"
        )
        snapshot = {
            "source": SOURCE_URL,
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "status": "updated-from-bcci-live-scores",
            "matchCount": len(live),
            "matches": live,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=OUTPUT.parent,
                prefix=".live-matches.",
                suffix=".tmp",
                delete=False,
            ) as stream:
                temp_path = Path(stream.name)
                json.dump(snapshot, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            check = json.loads(temp_path.read_text(encoding="utf-8"))
            if check.get("status") != "updated-from-bcci-live-scores" or not isinstance(
                check.get("matches"), list
            ):
                raise ValueError("Live snapshot validation failed")
            os.replace(temp_path, OUTPUT)
            temp_path = None
        finally:
            if temp_path:
                temp_path.unlink(missing_ok=True)
        print(
            f"Saved {len(live)} verified live match(es) to bcci-fixtures-test/live-matches.json"
        )
        return 0
    except Exception as exc:
        print(f"ERROR: live refresh failed; old JSON preserved: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
