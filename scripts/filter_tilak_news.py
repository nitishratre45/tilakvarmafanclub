#!/usr/bin/env python3
"""Scan all fetched BCCI article page text and publish only Tilak Varma matches."""
from __future__ import annotations
import json, re
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/"News"/"raw-news-pages.json"
OUT=ROOT/"News"/"newsjson.json"
NAME=re.compile(r"\\btilak\\s+varma\\b",re.I)

def main():
    doc=json.loads(RAW.read_text(encoding="utf-8"))
    articles=doc.get("articles",[])
    if not articles:
        raise RuntimeError("No enriched article pages found. Run scripts/newsreader.py first.")
    matches=[]
    for a in articles:
        title=str(a.get("title") or "")
        page_text=str(a.get("pageText") or "")
        description=str(a.get("description") or "")
        page_title=str(a.get("pageTitle") or "")
        if not NAME.search(" ".join((title,page_text,description,page_title))):
            continue
        paragraphs=[p.strip() for p in re.split(r"(?<=[.!?])\\s+|\\n+",page_text) if p.strip()]
        clean={k:v for k,v in a.items() if k not in {"meta","jsonLd","apiRecord"}}
        clean["fullText"]=page_text
        clean["articleText"]=paragraphs[:500]
        clean["matchedLines"]=[p[:1200] for p in paragraphs if NAME.search(p)][:50]
        fields=[("title",title),("pageText",page_text),("description",description),("pageTitle",page_title)]
        clean["matchFoundIn"]=[label for label,value in fields if NAME.search(value)]
        clean["sourceName"]="BCCI"
        matches.append(clean)
    matches.sort(key=lambda x:str(x.get("publishedAt") or ""),reverse=True)
    result={"player":"Tilak Varma","source":"BCCI News API only","updatedAt":datetime.now(timezone.utc).isoformat(),"candidateCount":len(articles),"matchedCount":len(matches),"newMatches":len(matches),"sourceErrors":doc.get("errors",[]),"readErrors":doc.get("articleFetchErrors",[]),"news":matches}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
    print(f"Scanned {len(articles)} full BCCI pages; saved {len(matches)} Tilak Varma matches.",flush=True)
if __name__=="__main__": main()
