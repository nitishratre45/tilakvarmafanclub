#!/usr/bin/env python3
"""Refresh a small, free Tilak Varma news feed from Google News RSS.
The feed is best-effort: on source/network failure, keep the last good stories.
"""
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "tilak-news.json"
FEED_URL = "https://news.google.com/rss/search?q=%22Tilak+Varma%22&hl=en-IN&gl=IN&ceid=IN:en"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TilakVarmaFC/1.0; +https://tilakvarmafc.pages.dev/)"}
NS = {"media": "http://search.yahoo.com/mrss/"}

class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.images=[]
    def handle_data(self, data):
        value=" ".join(data.split())
        if value:self.parts.append(value)
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag.lower()=="img":
            src=attrs.get("src") or attrs.get("data-src")
            if src and src.startswith("https://"):self.images.append(src)

def clean(value):
    value=html.unescape(value or "")
    return re.sub(r"\s+"," ",value).strip()

def article_image(url):
    """Best-effort publisher Open Graph thumbnail; images are optional."""
    try:
        req=urllib.request.Request(url,headers=HEADERS)
        with urllib.request.urlopen(req,timeout=8) as response:
            page=response.read(700_000).decode("utf-8","replace")
            page_url=response.geturl()
        patterns=[
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)',
        ]
        for pattern in patterns:
            match=re.search(pattern,page,re.I)
            if match:
                candidate=urljoin(page_url,html.unescape(match.group(1)))
                if candidate.startswith("https://"):return candidate
    except Exception:
        pass
    return ""

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    old={"items":[]}
    if OUT.exists():
        try: old=json.loads(OUT.read_text(encoding="utf-8"))
        except (OSError,json.JSONDecodeError): pass
    checked=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    req=urllib.request.Request(FEED_URL,headers=HEADERS)
    try:
        with urllib.request.urlopen(req,timeout=25) as response:
            raw=response.read()
        root=ET.fromstring(raw)
        channel=root.find("channel")
        if channel is None: raise ValueError("RSS channel missing")
        items=[]
        for item in channel.findall("item"):
            title=clean(item.findtext("title"))
            link=clean(item.findtext("link"))
            if not title or not link.startswith("https://"): continue
            source_node=item.find("source")
            publisher=clean(source_node.text if source_node is not None else "")
            description=item.findtext("description") or ""
            parser=TextOnly(); parser.feed(description)
            summary=clean(" ".join(parser.parts))
            if not re.search(r"\b(tilak|varma)\b",title+" "+summary,re.I): continue
            image=""
            media=item.find("media:content",NS)
            if media is None: media=item.find("media:thumbnail",NS)
            if media is not None:image=media.attrib.get("url","")
            if not image and parser.images:image=parser.images[0]
            if not image.startswith("https://"):image=""
            if not image and len(items)<5:image=article_image(link)
            pub=clean(item.findtext("pubDate"))
            items.append({"title":title,"url":link,"publisher":publisher or "Google News","published":pub,"summary":summary[:320],"image":image,"source":"Google News RSS"})
            if len(items)>=10:break
        if not items: raise ValueError("RSS returned no usable Tilak Varma stories")
        result={"updatedAt":checked,"status":"available","source":FEED_URL,"items":items}
        print(f"Refreshed {len(items)} Tilak Varma news stories.")
    except Exception as exc:
        print(f"News refresh failed; preserving previous stories: {exc}")
        result={**old,"updatedAt":checked,"status":"source-unavailable","source":FEED_URL,"error":str(exc)}
        result.setdefault("items",[])
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

if __name__=="__main__":main()
