#!/usr/bin/env python3
"""Build format-aware Tilak Varma over-by-over data from Cricsheet archives."""
import io,json,re,urllib.request,zipfile
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/"data"/"death-overs.json"
ALIASES={"tilakvarma","tilakverma","tilakvardhanvarma"}
ARCHIVES={"ipl":{"label":"IPL","url":"https://cricsheet.org/downloads/ipl_json.zip","kind":"ipl"},"t20i":{"label":"T20 Internationals","url":"https://cricsheet.org/downloads/t20s_male_json.zip","kind":"t20i"},"t20":{"label":"Other Men's T20","url":"https://cricsheet.org/downloads/t20s_male_json.zip","kind":"t20"},"overall_t20":{"label":"Overall T20 · IPL + T20I + domestic","url":"https://cricsheet.org/downloads/t20s_male_json.zip","kind":"overall_t20"},"odi":{"label":"ODI","url":"https://cricsheet.org/downloads/odis_male_json.zip","kind":"odi"},"test":{"label":"Test (available archive)","url":"https://cricsheet.org/downloads/tests_male_json.zip","kind":"test"},"hyderabad":{"label":"Hyderabad (domestic T20 archive)","url":None,"kind":"hyderabad"}}
def discover_hyderabad_archive():
 req=urllib.request.Request("https://cricsheet.org/downloads/",headers={"User-Agent":"TilakVarmaFC/1.1"})
 with urllib.request.urlopen(req,timeout=45) as r: page=r.read().decode("utf-8","replace")
 for match in re.finditer(r"<tr\b[^>]*>(.*?)</tr>",page,re.I|re.S):
  row=match.group(1)
  text=re.sub(r"<[^>]+>"," ",row)
  text=re.sub(r"\s+"," ",text).strip()
  if "Hyderabad (India)" not in text:continue
  links=re.findall(r'<a\b[^>]*href=([^\s>]+)[^>]*>(.*?)</a>',row,re.I|re.S)
  for href,label in links:
   href=href.strip(chr(34)+chr(39))
   if "json" in re.sub(r"<[^>]+>"," ",label).lower() and ".zip" in href.lower():
    return href if href.startswith("http") else "https://cricsheet.org"+href
 raise RuntimeError("Could not resolve Hyderabad (India) JSON archive link from Cricsheet downloads page")
def norm(v): return re.sub(r"[^a-z]","",str(v).lower())
def target(v): return norm(v) in ALIASES
def download(url):
 req=urllib.request.Request(url,headers={"User-Agent":"TilakVarmaFC/1.1"})
 with urllib.request.urlopen(req,timeout=120) as r: b=r.read()
 if not b.startswith(b"PK"): raise RuntimeError("Not a ZIP archive: "+url)
 return b
def classify(info):
 mt=str(info.get("match_type","")).lower().strip(); tt=str(info.get("team_type","")).lower().strip()
 if mt in {"test","tests"}: return "test"
 if mt in {"odi","one day international"}: return "odi"
 if mt in {"t20","t20i","it20","international t20"}: return "t20i" if tt=="international" else "t20"
 return None
def parse_match(data,filename,key,totals):
 info=data.get("info",{})
 if key=="overall_t20":
  if str(info.get("match_type","")).lower().strip() not in {"t20","t20i","it20","international t20"}:return [],None
 elif key not in {"ipl","overall_t20","hyderabad"} and classify(info)!=key:return [],None
 players=info.get("players",{});teams=info.get("teams",[])
 if not any(target(p) for group in players.values() for p in group):return [],None
 mid=Path(filename).stem;date=str((info.get("dates") or [""])[0]);venue=info.get("venue","");rows=[]
 for innno,inn in enumerate(data.get("innings",[]),1):
  team=inn.get("team","")
  if not any(target(p) for p in players.get(team,[])):continue
  byover=defaultdict(lambda:{"runs":0,"balls":0,"fours":0,"sixes":0})
  for od in inn.get("overs",[]):
   number=int(od.get("over",-1))+1
   for d in od.get("deliveries",[]):
    if not target(d.get("batter",d.get("batsman",""))):continue
    s=byover[number];rd=d.get("runs",{});br=int(rd.get("batter",rd.get("batsman",0)) or 0);ex=d.get("extras",{}) or {}
    s["runs"]+=br
    if not int(ex.get("wides",0) or 0):s["balls"]+=1
    if br==4:s["fours"]+=1
    elif br==6:s["sixes"]+=1
  if not byover:continue
  opposition=next((t for t in teams if t!=team),"Unknown");overs=[]
  for number,v in sorted(byover.items()):
   overs.append({"over":number,**v,"strikeRate":round(v["runs"]*100/v["balls"],2) if v["balls"] else 0})
   for name in ("runs","balls","fours","sixes"):totals[number][name]+=v[name]
  rows.append({"date":date,"matchId":mid,"format":key,"teams":" vs ".join(teams),"opposition":opposition,"venue":venue,"innings":innno,"battingTeam":team,"overs":overs})
 return rows,mid if rows else None
def build(payload,key):
 ids=set();totals=defaultdict(lambda:defaultdict(int));innings=[];errors=[]
 with zipfile.ZipFile(io.BytesIO(payload)) as z:
  for name in (n for n in z.namelist() if n.lower().endswith(".json")):
   try:
    rows,mid=parse_match(json.loads(z.read(name).decode("utf-8-sig")),name,key,totals);innings.extend(rows)
    if mid:ids.add(mid)
   except Exception as e:errors.append({"file":name,"error":str(e)})
 innings.sort(key=lambda x:(x["date"],x["matchId"],x["innings"]),reverse=True)
 maximum=50 if key=="odi" else 90 if key=="test" else 20
 summary=[]
 for n in range(1,maximum+1):
  v=totals[n];r,b=v["runs"],v["balls"]
  summary.append({"over":n,"runs":r,"balls":b,"fours":v["fours"],"sixes":v["sixes"],"strikeRate":round(r*100/b,2) if b else 0})
 return {"label":ARCHIVES[key]["label"],"source":ARCHIVES[key]["url"],"matchesFound":len(ids),"inningsFound":len(innings),"overTotals":summary,"innings":innings,"readErrors":len(errors)}
def main():
 formats={};failures={};cache={}
 for key,cfg in ARCHIVES.items():
  try:
   url=cfg["url"] or discover_hyderabad_archive()
   if url not in cache:cache[url]=download(url)
   cfg["url"]=url
   formats[key]=build(cache[url],cfg["kind"])
   print(f'{cfg["label"]}: {formats[key]["matchesFound"]} matches, {formats[key]["inningsFound"]} innings')
  except Exception as e:failures[key]=str(e);print(f'WARNING {key}: {e}')
 # Overall T20 combines the broad men's T20 archive with IPL deliveries.
 if formats.get("overall_t20",{}).get("innings"):
  overall=formats["overall_t20"]
  existing={str(row.get("matchId","")) for row in overall["innings"]}
  for source_key in ("ipl","hyderabad"):
   for row in formats.get(source_key,{}).get("innings",[]):
    clone=dict(row);clone["format"]="overall_t20";clone["matchId"]=source_key+":"+str(row.get("matchId",""))
    if clone["matchId"] not in existing:
     overall["innings"].append(clone);existing.add(clone["matchId"])
  totals=defaultdict(lambda:{"runs":0,"balls":0,"fours":0,"sixes":0})
  for row in overall["innings"]:
   for over in row.get("overs",[]):
    for metric in ("runs","balls","fours","sixes"):totals[int(over["over"])][metric]+=int(over.get(metric,0) or 0)
  overall["innings"].sort(key=lambda row:(row.get("date",""),row.get("matchId",""),row.get("innings",0)),reverse=True)
  overall["matchesFound"]=len(existing);overall["inningsFound"]=len(overall["innings"])
  overall["overTotals"]=[{"over":n,**totals[n],"strikeRate":round(totals[n]["runs"]*100/totals[n]["balls"],2) if totals[n]["balls"] else 0} for n in range(1,21)]
 if not formats or not any(v["innings"] for v in formats.values()):raise RuntimeError("No Tilak innings found; refusing to publish empty data.")
 default=next((k for k in ("t20i","ipl","t20","hyderabad","odi","test") if formats.get(k,{}).get("innings")),next(iter(formats)));d=formats[default]
 out={"updatedAt":datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),"player":"Tilak Varma","defaultFormat":default,"formats":formats,"sourceErrors":failures,"source":d["source"],"coverageNote":"Only Tilak Varma deliveries found in available Cricsheet archives are included. Coverage varies by format; Test archive data is not a complete first-class career record.","matchesFound":d["matchesFound"],"inningsFound":d["inningsFound"],"overTotals":d["overTotals"],"innings":d["innings"],"readErrors":sum(x["readErrors"] for x in formats.values())}
 if OUT.exists():
  try:
   prev=json.loads(OUT.read_text(encoding="utf-8"))
   if prev.get("featuredMatch"):out["featuredMatch"]=prev["featuredMatch"]
  except (OSError,json.JSONDecodeError):pass
 OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("Wrote formats:",", ".join(formats))
if __name__=="__main__":main()
