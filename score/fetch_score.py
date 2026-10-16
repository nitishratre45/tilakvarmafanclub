#!/usr/bin/env python3
"""Fetch the BCCI scorecard into score/score.json only; do not touch production match archives."""
import gzip, json, os, re, sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MATCH_ID = "e0b67c41-cd96-4b62-9281-2636607533a1"
SOURCE_URL = f"https://stats.bcci.tv/match/{MATCH_ID}/scorecard"
OUTPUT = os.path.join(os.path.dirname(__file__), "score.json")

class ScriptParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.active=False; self.kind=""; self.buf=[]; self.scripts=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower()=="script":
            a=dict(attrs); self.kind=a.get("id","") or a.get("type",""); self.active=True; self.buf=[]
    def handle_data(self, data):
        if self.active: self.buf.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=="script" and self.active:
            self.scripts.append((self.kind,"".join(self.buf))); self.active=False

def main():
    report={"fetchedAt":datetime.now(timezone.utc).isoformat(),"source":SOURCE_URL,"matchId":MATCH_ID,"status":"error","httpStatus":None,"contentType":None,"data":None,"error":None}
    try:
        req=Request(SOURCE_URL,headers={"User-Agent":"Mozilla/5.0 (compatible; CricZoneScorecard/1.0)","Accept":"application/json,text/html,*/*","Referer":"https://www.bcci.tv/"})
        with urlopen(req,timeout=30) as res:
            raw=res.read(); report["httpStatus"]=res.status; report["contentType"]=res.headers.get("Content-Type",""); encoding=res.headers.get("Content-Encoding","").lower()
        if encoding=="gzip" or raw.startswith(b"\x1f\x8b"): raw=gzip.decompress(raw)
        body=raw.decode("utf-8-sig",errors="replace")
        try:
            obj=json.loads(body)
            if isinstance(obj,dict) and any(k in obj for k in ("innings","scorecard","data","match")):
                report["data"]=obj; report["status"]="ok"
            else: raise ValueError("JSON response did not contain recognizable scorecard fields")
        except json.JSONDecodeError:
            parser=ScriptParser(); parser.feed(body); found=[]
            for kind,content in parser.scripts:
                content=content.strip()
                if content.startswith(("{","[")):
                    try:
                        obj=json.loads(content)
                        if isinstance(obj,dict) and any(k in obj for k in ("innings","scorecard","data","match")): found.append({"script":kind,"data":obj})
                    except (ValueError,TypeError): pass
            if found: report["data"]=found[0]["data"]; report["status"]="ok"
            else:
                title=re.search(r"<title[^>]*>(.*?)</title>",body,re.I|re.S)
                report["error"]="BCCI page returned HTML without extractable scorecard JSON"+(": "+re.sub(r"\s+"," ",title.group(1)).strip() if title else "")
    except HTTPError as e:
        report["httpStatus"]=e.code; report["error"]=f"HTTPError: {e.code} {e.reason}"
    except (URLError,TimeoutError,OSError,ValueError) as e:
        report["error"]=f"{type(e).__name__}: {e}"
    os.makedirs(os.path.dirname(OUTPUT),exist_ok=True)
    with open(OUTPUT,"w",encoding="utf-8") as f: json.dump(report,f,ensure_ascii=False,indent=2); f.write("\n")
    print(json.dumps({"status":report["status"],"httpStatus":report["httpStatus"],"output":OUTPUT,"error":report["error"]},ensure_ascii=False,indent=2))
    return 0 if report["status"]=="ok" else 1
if __name__=="__main__": sys.exit(main())
