#!/usr/bin/env python3
"""Build a web-ready Tilak Varma T20I over-by-over dataset from Cricsheet."""
import io, json, re, urllib.request, zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "death-overs.json"
URL = "https://cricsheet.org/downloads/t20i_json.zip"
ALIASES = {"tilakvarma", "tilakverma", "tilakvardhanvarma"}

def norm(value):
    return re.sub(r"[^a-z]", "", str(value).lower())

def main():
    req = urllib.request.Request(URL, headers={"User-Agent":"TilakVarmaFC/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        raw = response.read()
    if not raw.startswith(b"PK"):
        raise RuntimeError("Cricsheet download was not a valid ZIP archive")
    matches, over_totals, innings, errors = set(), defaultdict(lambda: defaultdict(int)), [], []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        files = [n for n in archive.namelist() if n.lower().endswith(".json")]
        for filename in files:
            try:
                data = json.loads(archive.read(filename).decode("utf-8-sig"))
                info = data.get("info", {})
                if info.get("match_type", "").lower() not in ("t20", "t20i", "it20", "international t20"): continue
                if info.get("gender", "").lower() not in ("male", "men", ""): continue
                if info.get("team_type", "international").lower() != "international": continue
                players = info.get("players", {})
                if not any(norm(p) in ALIASES for team in players.values() for p in team): continue
                match_id = Path(filename).stem
                matches.add(match_id)
                teams = info.get("teams", [])
                date = str((info.get("dates") or [""])[0])
                for inn_no, inn in enumerate(data.get("innings", []), 1):
                    player_team = inn.get("team", "")
                    player_names = [norm(p) for p in players.get(player_team, [])]
                    if not any(p in ALIASES for p in player_names): continue
                    by_over = defaultdict(lambda: {"runs":0,"balls":0,"fours":0,"sixes":0})
                    for over in inn.get("overs", []):
                        over_no = int(over.get("over", -1)) + 1
                        for delivery in over.get("deliveries", []):
                            batter = delivery.get("batter", delivery.get("batsman", ""))
                            if norm(batter) not in ALIASES: continue
                            stat = by_over[over_no]
                            run = delivery.get("runs", {})
                            batter_runs = int(run.get("batter", run.get("batsman", 0)) or 0)
                            extras = delivery.get("extras", {}) or {}
                            stat["runs"] += batter_runs
                            if not int(extras.get("wides", 0) or 0): stat["balls"] += 1
                            if batter_runs == 4: stat["fours"] += 1
                            elif batter_runs == 6: stat["sixes"] += 1
                    if not by_over: continue
                    opposition = next((t for t in teams if t != player_team), "Unknown")
                    innings.append({"date":date,"matchId":match_id,"teams":" vs ".join(teams),
                        "opposition":opposition,"venue":info.get("venue",""),"innings":inn_no,
                        "battingTeam":player_team,"overs":[{"over":o,**v,
                        "strikeRate":round(v["runs"]*100/v["balls"],2) if v["balls"] else 0}
                        for o,v in sorted(by_over.items())]})
                    for over, v in by_over.items():
                        for key in ("runs","balls","fours","sixes"): over_totals[over][key] += v[key]
            except Exception as exc:
                errors.append({"file":filename,"error":str(exc)})
    innings.sort(key=lambda x:(x["date"],x["matchId"],x["innings"]), reverse=True)
    totals = []
    for over in range(1,21):
        v=over_totals[over]
        totals.append({"over":over,**{k:v[k] for k in ("runs","balls","fours","sixes")},
          "strikeRate":round(v["runs"]*100/v["balls"],2) if v["balls"] else 0})
    payload={"updatedAt":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
      "source":URL,"coverageNote":"Cricsheet coverage may be incomplete. This dataset includes only matches present in the archive; missing matches are not treated as zero.",
      "matchesFound":len(matches),"inningsFound":len(innings),"overTotals":totals,
      "innings":innings,"readErrors":len(errors)}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Created {OUT}: {len(matches)} matches, {len(innings)} innings, {len(errors)} read errors")
if __name__=="__main__": main()
