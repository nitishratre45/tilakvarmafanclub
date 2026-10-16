#!/usr/bin/env python3
"""Fetch the BCCI scorecard page into an isolated JSON artifact.

The BCCI scorecard URL is a web page, not guaranteed to be a JSON endpoint.
This script preserves discovered JSON payloads and reports an explicit error
instead of pretending HTML is scorecard JSON. It never edits production data.
"""
from __future__ import annotations
import gzip, json, os, re, sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MATCH_ID = "e0b67c41-cd96-4b62-9281-2636607533a1"
SOURCE_URL = f"https://stats.bcci.tv/match/{MATCH_ID}/scorecard"
OUTPUT = os.environ.get("BCCI_SCORECARD_OUTPUT", "matches/scorecards/bcci-scorecard.json")
class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(); self.capture=False; self.kind=""; self.parts=[]; self.items=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower()=="script":
            attrs=dict(attrs); self.kind=attrs.get("id","") or attrs.get("type",""); self.capture=True; self.parts=[]
    def handle_data(self, data):
        if self.capture: self.parts.append(data)
    def handle_endtag(self, tag):
        if tag.lower()=="script" and self.capture:
            self.items.append((self.kind,"".join(self.parts))); self.capture=False

def main():
    report={"fetchedAt":datetime.now(timezone.utc).isoformat(),"source":SOURCE_URL,"matchId":MATCH_ID,"status":"error","httpStatus":None,"contentType":None,"data":None,"error":None,"note":"Dedicated scorecard diagnostic JSON; production matches/ archives are untouched."}
    try:
        req=Request(SOURCE_URL,headers={"User-Agent":"Mozilla/5.0 (compatible; ScorecardPreview/1.0)","Accept":"application/json,text/html, */*","Referer":"https://www.bcci.tv/"})
        with urlopen(req,timeout=30) as response:
            raw=response.read(); report["httpStatus"]=response.status; report["contentType"]=response.headers.get("Content-Type",""); encoding=response.headers.get("Content-Encoding","").lower()
        if encoding=="gzip" or raw.startswith(b"\x1f\x8b"): raw=gzip.decompress(raw)
        text=raw.decode("utf-8-sig",errors="replace")
        try:
            obj=json.loads(text)
            if isinstance(obj,dict) and any(k in obj for k in ("innings","scorecard","data","match")):
                report["data"]=obj; report["status"]="ok"
            else: raise ValueError("Response is JSON but no recognizable scorecard payload was found.")
        except json.JSONDecodeError:
            parser=Scripts(); parser.feed(text); candidates=[]
            for kind,content in parser.items:
                content=content.strip()
                if not content or kind.lower() in ("application/ld+json","text/javascript"): 
                    if not content: continue
                if content.startswith("{") or content.startswith("["):
                    try:
                        candidate=json.loads(content)
                        candidates.append({"script":kind,"data":candidate})
                    except (ValueError,TypeError): pass
            if candidates:
                report["data"]={"pageTitle":"BCCI Scorecard","embeddedPayloads":candidates}
                report["status"]="ok"
                report["note"]="Embedded script JSON saved. If it does not include innings, inspect source page network requests and add its official JSON endpoint."
            else:
                title=re.search(r"<title[^>]*>(.*?)</title>",text,re.I|re.S)
                report["error"]="BCCI returned HTML without an extractable JSON scorecard payload. "+("Page title: "+re.sub(r"\s+"," ",title.group(1)).strip() if title else "No page title found.")+" The scorecard page may load its data from a separate API endpoint."
    except HTTPError as exc: report["httpStatus"]=exc.code; report["error"]=f"HTTPError: {exc.code} {exc.reason}"
    except (URLError,TimeoutError,OSError,ValueError) as exc: report["error"]=f"{type(exc).__name__}: {exc}"
    os.makedirs(os.path.dirname(OUTPUT) or ".",exist_ok=True)
    with open(OUTPUT,"w",encoding="utf-8") as handle: json.dump(report,handle,ensure_ascii=False,indent=2); handle.write("\n")
    print(json.dumps({k:report[k] for k in ("status","httpStatus","contentType","source","output","error") if k in report} | {"output":OUTPUT},ensure_ascii=False,indent=2))
    return 0 if report["status"]=="ok" else 1
if __name__=="__main__": sys.exit(main())
