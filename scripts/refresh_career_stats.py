#!/usr/bin/env python3
"""Refresh Tilak Varma format-wise career stats from ESPNcricinfo/ICC public pages.
Preserves last-known values when scraping is blocked or the page format changes."""
import html,json,re,urllib.request
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILE=ROOT/"data"/"site-data.json"
ESPN="https://www.espncricinfo.com/cricketers/tilak-varma-1170265"
ICC="https://www.icc-cricket.com/rankings/70761/tilak-varma"
HEAD={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36 TilakVarmaFC/1.0"}
class Tables(HTMLParser):
 def __init__(self): super().__init__(); self.tables=[]; self.t=None; self.r=None; self.c=None
 def handle_starttag(self,tag,attrs):
  if tag=="table": self.t=[]
  elif self.t is not None and tag=="tr": self.r=[]
  elif self.r is not None and tag in ("td","th"): self.c=[]
 def handle_data(self,data):
  if self.c is not None:self.c.append(data)
 def handle_endtag(self,tag):
  if tag in ("td","th") and self.c is not None:self.r.append(re.sub(r"\s+"," "," ".join(self.c)).strip());self.c=None
  elif tag=="tr" and self.r is not None:
   if self.r:self.t.append(self.r)
   self.r=None
  elif tag=="table" and self.t is not None:
   if self.t:self.tables.append(self.t)
   self.t=None
def fetch(url):
 req=urllib.request.Request(url,headers=HEAD)
 with urllib.request.urlopen(req,timeout=45) as r:return r.read().decode("utf-8","replace")
def clean(v):return re.sub(r"\s+"," ",html.unescape(str(v))).strip()
def number(v):
 m=re.search(r"\d+(?:\.\d+)?",clean(v).replace(",",""))
 if not m:return None
 x=float(m.group());return int(x) if x.is_integer() else x
def parse(url):
 try: page=fetch(url)
 except Exception as e: print("Source unavailable:",url,e);return {}
 p=Tables();p.feed(page); found={}
 aliases={"test":"Test","odi":"ODI","t20i":"T20I","first-class":"First-class","first class":"First-class","list a":"List A","ipl":"IPL","t20":"T20 (domestic/franchise)"}
 for table in p.tables:
  for row in table:
   if not row:continue
   key=clean(row[0]).casefold()
   fmt=next((v for k,v in aliases.items() if key==k),None)
   if not fmt or len(row)<8:continue
   # ESPN tables typically: Format, M, Inns, NO, Runs, HS, Ave, BF, SR, 100, 50, 4s, 6s.
   vals=[number(x) for x in row[1:]]
   if len(vals)<6 or vals[0] is None or vals[3] is None:continue
   rec={"matches":vals[0],"innings":vals[1],"notOuts":vals[2],"runs":vals[3],
    "highestScore":clean(row[5]),"average":vals[5],"source":url}
   if len(vals)>7:rec["strikeRate"]=vals[7]
   for i,k in [(8,"hundreds"),(9,"fifties"),(10,"fours"),(11,"sixes")]:
    if len(vals)>i:rec[k]=vals[i]
   found[fmt]=rec
 return found
def main():
 data=json.loads(FILE.read_text(encoding="utf-8"))
 formats=data.setdefault("careerFormats",{})
 scraped=parse(ESPN)
 # ICC page has a format summary; merge only rows parsed as a proper table.
 # ICC international figures are preloaded in the JSON fallback; only use ESPN table parsing here.
 if scraped:
  current_runs = int(formats.get("T20I", {}).get("runs", 0) or 0)
  incoming_runs = int(scraped.get("T20I", {}).get("runs", 0) or 0)
  # Do not let stale/cached source totals roll back a newer verified total.
  if incoming_runs > current_runs:
   formats.update(scraped)
   data["careerSource"]=ESPN
   data["careerStatsUpdated"]=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
  else:
   print(f"Keeping newer T20I total ({current_runs}); ESPN response is stale ({incoming_runs}).")
 else: print("No parseable career table found; retaining existing stats.")
 t=formats.get("T20I",{})
 if t.get("runs") is not None:
  data["careerStats"]={"t20iRuns":t["runs"],"highestScore":t.get("highestScore","120*"),
   "average":t.get("average",44.08),"strikeRate":t.get("strikeRate",145.06),
   "fifties":t.get("fifties",10),"hundreds":t.get("hundreds",2)}

 data.setdefault("lastChecked", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
 FILE.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("Career stats refresh complete; formats:",", ".join(sorted(formats)))
if __name__=="__main__":main()
