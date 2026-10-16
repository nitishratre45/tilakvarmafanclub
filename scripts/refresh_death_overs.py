#!/usr/bin/env python3
"""Build format-aware Tilak Varma over-by-over data from Cricsheet archives."""
import io, json, re, urllib.request, zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "death-overs.json"
ALIASES = {"tilakvarma", "tilakverma", "tilakvardhanvarma"}
ARCHIVES = {
    "ipl": {
        "label": "IPL",
        "url": "https://cricsheet.org/downloads/ipl_json.zip",
        "fallback_urls": ["https://cricsheet.org/downloads/all_male_json.zip"],
        "kind": "ipl",
    },
    "t20i": {
        "label": "T20 Internationals",
        "url": "https://cricsheet.org/downloads/t20s_male_json.zip",
        "fallback_urls": ["https://cricsheet.org/downloads/all_male_json.zip"],
        "kind": "t20i",
    },
    "t20": {
        "label": "Other Men's T20",
        "url": "https://cricsheet.org/downloads/t20s_male_json.zip",
        "fallback_urls": ["https://cricsheet.org/downloads/all_male_json.zip"],
        "kind": "t20",
    },
    "overall_t20": {
        "label": "Overall T20 · IPL + T20I + domestic",
        "url": "https://cricsheet.org/downloads/t20s_male_json.zip",
        "fallback_urls": ["https://cricsheet.org/downloads/all_male_json.zip"],
        "kind": "overall_t20",
    },
    "odi": {
        "label": "ODI",
        "url": "https://cricsheet.org/downloads/odis_male_json.zip",
        "kind": "odi",
    },
    "test": {
        "label": "Test (available archive)",
        "url": "https://cricsheet.org/downloads/tests_male_json.zip",
        "kind": "test",
    },
    "hyderabad": {
        "label": "Hyderabad (domestic T20 archive)",
        "url": None,
        "kind": "hyderabad",
    },
}


def discover_hyderabad_archive():
    req = urllib.request.Request(
        "https://cricsheet.org/downloads/", headers={"User-Agent": "TilakVarmaFC/1.1"}
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        page = r.read().decode("utf-8", "replace")
    for match in re.finditer(r"<tr\b[^>]*>(.*?)</tr>", page, re.I | re.S):
        row = match.group(1)
        text = re.sub(r"<[^>]+>", " ", row)
        text = re.sub(r"\s+", " ", text).strip()
        if "Hyderabad (India)" not in text:
            continue
        links = re.findall(r"<a\b[^>]*href=([^\s>]+)[^>]*>(.*?)</a>", row, re.I | re.S)
        for href, label in links:
            href = href.strip(chr(34) + chr(39))
            if (
                "json" in re.sub(r"<[^>]+>", " ", label).lower()
                and ".zip" in href.lower()
            ):
                return (
                    href if href.startswith("http") else "https://cricsheet.org" + href
                )
    raise RuntimeError(
        "Could not resolve Hyderabad (India) JSON archive link from Cricsheet downloads page"
    )


def norm(v):
    return re.sub(r"[^a-z]", "", str(v).lower())


def target(v):
    return norm(v) in ALIASES


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TilakVarmaFC/1.1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        b = r.read()
    if not b.startswith(b"PK"):
        raise RuntimeError("Not a ZIP archive: " + url)
    return b


def classify(info):
    mt = str(info.get("match_type", "")).lower().strip()
    tt = str(info.get("team_type", "")).lower().strip()
    if mt in {"test", "tests"}:
        return "test"
    if mt in {"odi", "one day international"}:
        return "odi"
    if mt in {"t20", "t20i", "it20", "international t20"}:
        return "t20i" if tt == "international" else "t20"
    return None


def parse_match(data, filename, key, totals, all_male_fallback=False):
    info = data.get("info", {})
    if key == "overall_t20":
        if str(info.get("match_type", "")).lower().strip() not in {
            "t20",
            "t20i",
            "it20",
            "international t20",
        }:
            return [], None
    elif key == "ipl" and all_male_fallback:
        # Filter the broad all-men fallback to IPL only.
        event = info.get("event", {}) or {}
        event_name = str(
            event.get("name", "") if isinstance(event, dict) else event
        ).lower()
        if "indian premier league" not in event_name and event_name.strip() != "ipl":
            return [], None
    elif key not in {"ipl", "overall_t20", "hyderabad"} and classify(info) != key:
        return [], None
    players = info.get("players", {})
    teams = info.get("teams", [])
    if not any(target(p) for group in players.values() for p in group):
        return [], None
    mid = Path(filename).stem
    date = str((info.get("dates") or [""])[0])
    venue = info.get("venue", "")
    rows = []
    for innno, inn in enumerate(data.get("innings", []), 1):
        team = inn.get("team", "")
        if not any(target(p) for p in players.get(team, [])):
            continue
        byover = defaultdict(
            lambda: {"runs": 0, "balls": 0, "fours": 0, "sixes": 0, "deliveries": []}
        )
        for od in inn.get("overs", []):
            number = int(od.get("over", -1)) + 1
            legal_ball_number = 0
            for sequence, d in enumerate(od.get("deliveries", []), 1):
                batter_name = str(d.get("batter", d.get("batsman", "")))
                is_tilak = target(batter_name)
                rd = d.get("runs", {})
                br = int(rd.get("batter", rd.get("batsman", 0)) or 0)
                ex = d.get("extras", {}) or {}
                wide = bool(int(ex.get("wides", 0) or 0))
                no_ball = bool(int(ex.get("noballs", 0) or 0))
                if not wide and not no_ball:
                    legal_ball_number += 1
                dismissed = any(
                    target(w.get("player_out", "")) for w in (d.get("wickets") or [])
                )
                # Only Tilak's batting events contribute to his statistics.
                # Keep the full source over sequence for the delivery log.
                s = byover[number]
                if is_tilak:
                    s["runs"] += br
                    if not wide:
                        s["balls"] += 1
                    if br == 4:
                        s["fours"] += 1
                    elif br == 6:
                        s["sixes"] += 1
                s["deliveries"].append(
                    {
                        "ball": sequence,
                        "legalBall": (
                            legal_ball_number if not wide and not no_ball else None
                        ),
                        "batter": batter_name,
                        "tilak": is_tilak,
                        "batterRuns": br,
                        "totalRuns": int(rd.get("total", br) or 0),
                        "extras": sum(int(x or 0) for x in ex.values()),
                        "four": br == 4,
                        "six": br == 6,
                        "wicket": dismissed,
                        "wide": wide,
                        "noBall": no_ball,
                    }
                )
        # Don't expose an over as a Tilak innings unless he actually faced a delivery in it.
        byover = {
            number: value
            for number, value in byover.items()
            if any(delivery.get("tilak") for delivery in value["deliveries"])
        }
        if not byover:
            continue
        opposition = next((t for t in teams if t != team), "Unknown")
        overs = []
        for number, v in sorted(byover.items()):
            overs.append(
                {
                    "over": number,
                    **v,
                    "strikeRate": (
                        round(v["runs"] * 100 / v["balls"], 2) if v["balls"] else 0
                    ),
                }
            )
            for name in ("runs", "balls", "fours", "sixes"):
                totals[number][name] += v[name]
        rows.append(
            {
                "date": date,
                "matchId": mid,
                "format": key,
                "teams": " vs ".join(teams),
                "opposition": opposition,
                "venue": venue,
                "innings": innno,
                "battingTeam": team,
                "overs": overs,
            }
        )
    return rows, mid if rows else None


def build(payload, key, all_male_fallback=False):
    ids = set()
    totals = defaultdict(lambda: defaultdict(int))
    innings = []
    errors = []
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        for name in (n for n in z.namelist() if n.lower().endswith(".json")):
            try:
                rows, mid = parse_match(
                    json.loads(z.read(name).decode("utf-8-sig")),
                    name,
                    key,
                    totals,
                    all_male_fallback,
                )
                innings.extend(rows)
                if mid:
                    ids.add(mid)
            except Exception as e:
                errors.append({"file": name, "error": str(e)})
    innings.sort(key=lambda x: (x["date"], x["matchId"], x["innings"]), reverse=True)
    maximum = 50 if key == "odi" else 90 if key == "test" else 20
    summary = []
    for n in range(1, maximum + 1):
        v = totals[n]
        r, b = v["runs"], v["balls"]
        summary.append(
            {
                "over": n,
                "runs": r,
                "balls": b,
                "fours": v["fours"],
                "sixes": v["sixes"],
                "strikeRate": round(r * 100 / b, 2) if b else 0,
            }
        )
    return {
        "label": ARCHIVES[key]["label"],
        "source": ARCHIVES[key]["url"],
        "matchesFound": len(ids),
        "inningsFound": len(innings),
        "overTotals": summary,
        "innings": innings,
        "readErrors": len(errors),
    }


def main():
    formats = {}
    failures = {}
    fresh_formats = set()
    cache = {}
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print("WARNING: saved death-overs snapshot could not be read:", exc)

    previous_formats = previous.get("formats", {})
    for key, cfg in ARCHIVES.items():
        try:
            primary_url = cfg["url"] or discover_hyderabad_archive()
            urls = [primary_url, *cfg.get("fallback_urls", [])]
            candidate = None
            selected_url = primary_url
            attempt_errors = []

            # Try the format-specific ZIP first. If it is unavailable, malformed,
            # or has no Tilak innings, fall back to Cricsheet's official all-men ZIP.
            for source_url in dict.fromkeys(urls):
                try:
                    if source_url not in cache:
                        cache[source_url] = download(source_url)
                    trial = build(
                        cache[source_url],
                        cfg["kind"],
                        all_male_fallback=source_url in cfg.get("fallback_urls", []),
                    )
                    # An empty Test archive is expected for Tilak: he has no Test
                    # appearances. Treat a clean zero-match archive as a valid empty
                    # format rather than marking the whole refresh PARTIAL.
                    if (
                        key == "test"
                        and not trial.get("innings")
                        and trial.get("readErrors", 0) == 0
                    ):
                        candidate = trial
                        selected_url = source_url
                        break
                    if trial.get("innings") and trial.get("readErrors", 0) == 0:
                        candidate = trial
                        selected_url = source_url
                        break
                    attempt_errors.append(
                        f"{source_url}: {trial.get('inningsFound', 0)} innings, "
                        f"{trial.get('readErrors', 0)} read errors"
                    )
                    candidate = trial
                    selected_url = source_url
                except Exception as source_error:
                    attempt_errors.append(f"{source_url}: {source_error}")

            old_format = previous_formats.get(key, {})
            if (
                candidate is None
                or (not candidate.get("innings") and key != "test")
                or candidate.get("readErrors", 0) > 0
            ):
                reason = "; ".join(attempt_errors) or "No usable archive response"
                if old_format.get("innings"):
                    failures[key] = (
                        reason + "; retained the previous verified snapshot."
                    )
                    formats[key] = old_format
                    print(f"WARNING {key}: {failures[key]}")
                    continue
                raise RuntimeError(reason)

            cfg["url"] = selected_url
            formats[key] = candidate
            fresh_formats.add(key)
            print(
                f'{cfg["label"]}: {candidate["matchesFound"]} matches, '
                f'{candidate["inningsFound"]} innings (source: {selected_url})'
            )
        except Exception as e:
            failures[key] = str(e)
            if previous_formats.get(key, {}).get("innings"):
                formats[key] = previous_formats[key]
                failures[key] += "; retained the previous verified snapshot."
            print(f"WARNING {key}: {failures[key]}")
    # Overall T20 combines the broad men's T20 archive with IPL deliveries.
    # Always merge the separate IPL/Hyderabad archives, even if the broad
    # men's T20 archive failed or returned no Tilak innings.
    if "overall_t20" in formats:
        overall = formats["overall_t20"]
        overall.setdefault("innings", [])
        existing = {str(row.get("matchId", "")) for row in overall["innings"]}
        # Keep a base-ID set too, so the same match found in the broad T20
        # archive and the separate IPL archive is not counted twice.
        existing_base_ids = {value.split(":", 1)[-1] for value in existing}
        for source_key in ("ipl", "hyderabad"):
            for row in formats.get(source_key, {}).get("innings", []):
                source_id = str(row.get("matchId", ""))
                if source_id in existing_base_ids:
                    continue
                clone = dict(row)
                clone["format"] = "overall_t20"
                clone["matchId"] = source_key + ":" + source_id
                if clone["matchId"] not in existing:
                    overall["innings"].append(clone)
                    existing.add(clone["matchId"])
                    existing_base_ids.add(source_id)
        totals = defaultdict(lambda: {"runs": 0, "balls": 0, "fours": 0, "sixes": 0})
        for row in overall["innings"]:
            for over in row.get("overs", []):
                for metric in ("runs", "balls", "fours", "sixes"):
                    totals[int(over["over"])][metric] += int(over.get(metric, 0) or 0)
        overall["innings"].sort(
            key=lambda row: (
                row.get("date", ""),
                row.get("matchId", ""),
                row.get("innings", 0),
            ),
            reverse=True,
        )
        overall["matchesFound"] = len(existing)
        overall["inningsFound"] = len(overall["innings"])
        overall["overTotals"] = [
            {
                "over": n,
                **totals[n],
                "strikeRate": (
                    round(totals[n]["runs"] * 100 / totals[n]["balls"], 2)
                    if totals[n]["balls"]
                    else 0
                ),
            }
            for n in range(1, 21)
        ]
    # Add manually verified recent T20I ball-by-ball records that are not yet
    # present in the downloadable Cricsheet archive. Keep these in all-over views,
    # never silently fold them into death-over-only figures.
    manual_path = ROOT / "data" / "manual-t20i-match-overrides.json"
    try:
        manual_data = json.loads(manual_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        manual_data = {}

    for match in manual_data.get("matches", []):
        ball_rows = match.get("ballByBall") or []
        if not match.get("includeInAllOvers") or not ball_rows:
            continue
        if str(match.get("format", "")).lower() != "t20i":
            continue
        grouped = defaultdict(lambda: {"runs": 0, "balls": 0, "fours": 0, "sixes": 0, "deliveries": []})
        for ball in ball_rows:
            over_no = int(ball["over"])
            br = int(ball.get("batterRuns", ball.get("runs", 0)) or 0)
            g = grouped[over_no]
            g["runs"] += br
            g["balls"] += 1
            g["fours"] += int(br == 4)
            g["sixes"] += int(br == 6)
            g["deliveries"].append({
                "ball": int(ball.get("ball", 0)),
                "legalBall": int(ball.get("ball", 0)),
                "displayOver": ball.get("displayOver", ""),
                "batter": "Tilak Varma",
                "tilak": True,
                "batterRuns": br,
                "totalRuns": int(ball.get("runs", br) or 0),
                "extras": 0,
                "four": br == 4,
                "six": br == 6,
                "wicket": bool(ball.get("dismissal")),
                "wide": False,
                "noBall": False,
                "bowler": ball.get("bowler", ""),
                "commentary": ball.get("commentary", ""),
                "scoring": ball.get("scoring", str(br)),
            })
        overs = []
        for over_no, values in sorted(grouped.items()):
            overs.append({
                "over": over_no,
                **values,
                "strikeRate": round(values["runs"] * 100 / values["balls"], 2) if values["balls"] else 0,
            })
        match_id = "manual-afin09172026273950"
        row = {
            "date": match.get("date", ""),
            "matchId": match_id,
            "format": "t20i",
            "teams": match.get("teams", "India vs Afghanistan"),
            "opposition": match.get("opposition", "Afghanistan"),
            "venue": "Arun Jaitley Stadium, Delhi",
            "innings": 1,
            "battingTeam": "India",
            "sourceStatus": match.get("sourceStatus", "Manual ball-by-ball record"),
            "overs": overs,
        }
        for target_key in ("t20i", "overall_t20"):
            target_format = formats.get(target_key)
            if not target_format:
                continue
            existing = any(
                str(existing_row.get("date", "")) == row["date"]
                and str(existing_row.get("opposition", "")).lower() == row["opposition"].lower()
                and any(str(o.get("matchId", "")).startswith("manual-") for o in [existing_row])
                for existing_row in target_format.get("innings", [])
            )
            official_match_exists = any(
                str(existing_row.get("date", "")) == row["date"]
                and str(existing_row.get("opposition", "")).lower() == row["opposition"].lower()
                for existing_row in target_format.get("innings", [])
            )
            if official_match_exists:
                continue
            if not existing:
                target_row = dict(row)
                target_row["format"] = target_key
                if target_key == "overall_t20":
                    target_row["matchId"] = "manual:afin09172026273950"
                target_format.setdefault("innings", []).append(target_row)
                target_format["matchesFound"] = int(target_format.get("matchesFound", 0)) + 1
        
    # Recompute over totals after the supplemental T20I rows are appended.
    for target_key in ("t20i", "overall_t20"):
        target_format = formats.get(target_key)
        if not target_format:
            continue
        target_totals = defaultdict(lambda: {"runs": 0, "balls": 0, "fours": 0, "sixes": 0})
        unique_ids = set()
        for row in target_format.get("innings", []):
            unique_ids.add(str(row.get("matchId", "")))
            for over in row.get("overs", []):
                n = int(over.get("over", 0) or 0)
                for metric in ("runs", "balls", "fours", "sixes"):
                    target_totals[n][metric] += int(over.get(metric, 0) or 0)
        maximum = 20
        target_format["overTotals"] = [
            {
                "over": n,
                **target_totals[n],
                "strikeRate": round(target_totals[n]["runs"] * 100 / target_totals[n]["balls"], 2) if target_totals[n]["balls"] else 0,
            }
            for n in range(1, maximum + 1)
        ]
        target_format["innings"].sort(
            key=lambda row: (row.get("date", ""), row.get("matchId", ""), row.get("innings", 0)),
            reverse=True,
        )
        target_format["inningsFound"] = len(target_format["innings"])
        target_format["matchesFound"] = len(unique_ids)

    if not fresh_formats:
        raise RuntimeError(
            "No archive refresh succeeded; existing death-overs JSON was left unchanged."
        )
    if not formats or not any(v.get("innings") for v in formats.values()):
        raise RuntimeError("No Tilak innings found; refusing to publish empty data.")
    default = next(
        (
            k
            for k in ("t20i", "ipl", "t20", "hyderabad", "odi", "test")
            if formats.get(k, {}).get("innings")
        ),
        next(iter(formats)),
    )
    d = formats[default]
    attempted_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = {
        "updatedAt": attempted_at,
        "lastAttemptAt": attempted_at,
        "lastAttemptStatus": "partial" if failures else "success",
        "lastAttemptError": failures,
        "player": "Tilak Varma",
        "defaultFormat": default,
        "formats": formats,
        "sourceErrors": failures,
        "source": d["source"],
        "coverageNote": "Only Tilak Varma deliveries found in available Cricsheet archives are included. Coverage varies by format; Test archive data is not a complete first-class career record.",
        "matchesFound": d["matchesFound"],
        "inningsFound": d["inningsFound"],
        "overTotals": d["overTotals"],
        "innings": d["innings"],
        "readErrors": sum(x["readErrors"] for x in formats.values()),
    }
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
            if prev.get("featuredMatch"):
                out["featuredMatch"] = prev["featuredMatch"]
        except (OSError, json.JSONDecodeError):
            pass
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("Wrote formats:", ", ".join(formats))


if __name__ == "__main__":
    main()
