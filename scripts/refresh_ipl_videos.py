#!/usr/bin/env python3
"""Refresh the official BCCI IPL video catalogue into a static JSON cache."""
from __future__ import annotations
import hashlib, json, re, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

API = "https://www.bcci.tv/api/bff/cms/videos"
OUT = Path("assets/ipl-videos.json")
REPORT = Path("assets/ipl-video-refresh-report.json")
HEADERS = {"Accept": "application/json", "User-Agent": "TilakVarmaFanClub/1.0 (+https://tilakvarmafc.pages.dev/)"}

def fetch(params):
    endpoint = API + "/latest" if "tag" in params else API
    url = endpoint + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))

def walk(node):
    if isinstance(node, dict):
        keys = ("playbackUrl","playback_url","playUrl","play_url","streamUrl","stream_url","videoUrl","video_url","thumbnailUrl","slug")
        if any(k in node for k in keys): yield node
        for value in node.values(): yield from walk(value)
    elif isinstance(node, list):
        for value in node: yield from walk(value)

def text(*values):
    for value in values:
        if isinstance(value, str) and value.strip(): return value.strip()
        if isinstance(value, (int,float)): return str(value)
        if isinstance(value, dict):
            for key in ("url","src","href","path","large","xlarge","medium","small"):
                v = value.get(key)
                if isinstance(v,str) and v.strip(): return v.strip()
    return ""

def media_url(url):
    try:
        p = urllib.parse.urlparse(url)
        return p.scheme == "https" and bool(p.hostname) and p.path.lower().endswith((".m3u8",".mpd",".mp4"))
    except ValueError: return False

def normalize(item):
    title = text(item.get("title"), item.get("name"), item.get("videoTitle"))
    if not title: return None
    # Every request sent to this normalizer is scoped to the official IPL-tagged
    # catalogue. Individual clip titles often omit the league name, so do not
    # incorrectly discard match highlights whose title only names the teams.
    playback = text(item.get("playbackUrl"), item.get("playback_url"), item.get("playUrl"), item.get("play_url"), item.get("streamUrl"), item.get("stream_url"), item.get("videoUrl"), item.get("video_url"))
    if not media_url(playback): return None
    category_raw = text(item.get("category"), item.get("videoType"), item.get("contentType"), item.get("type")).lower()
    if "highlight" in category_raw: category = "Highlights"
    elif "feature" in category_raw or "interview" in category_raw: category = "Features & Interviews"
    elif "press" in category_raw or "conference" in category_raw: category = "Press Conferences"
    else: category = "IPL"
    thumbs = item.get("thumbnailUrlSet") if isinstance(item.get("thumbnailUrlSet"),dict) else {}
    thumbset = {size:text(thumbs.get(size)) for size in ("small","medium","large","xlarge")}
    published = text(item.get("publishedDate"), item.get("publishedAt"), item.get("createdAt"))
    slug = text(item.get("slug"))
    return {"id":text(item.get("id"),item.get("externalId"),slug,title),"title":title,"slug":slug,
      "thumbnailUrl":text(item.get("thumbnailUrl"),item.get("thumbnail"),thumbset.get("large"),thumbset.get("xlarge")),
      "thumbnailUrlSet":thumbset,"publishedDate":published,"year":published[:4] if re.match(r"^\d{4}",published) else "",
      "duration":text(item.get("duration")),"format":category,"playbackUrl":playback,"source":"BCCI"}

def main():
    year = datetime.now(timezone.utc).year
    queries = []
    for season in range(2008, year+1):
        queries.append((f"IPL season {season}", {"tags":f"ipl,season:{season}"}))
        queries.append((f"IPL men season {season}", {"tags":f"ipl,men,season:{season}"}))
        for category in ("highlights","features-and-interviews","press-conferences"):
            queries.append((f"{category} season {season}", {"category":category,"tags":f"ipl,season:{season}"}))
    queries += [
      ("IPL catalogue", {"tags":"ipl"}), ("IPL men's catalogue", {"tags":"ipl,men"}),
      ("IPL highlights", {"category":"highlights","tags":"ipl"}),
      ("IPL features", {"category":"features-and-interviews","tags":"ipl"}),
      ("IPL press conferences", {"category":"press-conferences","tags":"ipl"}),
    ]
    collected = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch,p):(label,p) for label,p in queries}
        for future in as_completed(futures):
            label, params = futures[future]
            try: payload = future.result()
            except Exception as exc:
                print(f"Skipping {label}: {exc}")
                continue
            for item in walk(payload):
                video = normalize(item)
                if video: collected[video["id"]] = video
    old = {}
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
        if isinstance(data,dict):
            for video in data.get("videos",[]):
                if isinstance(video,dict) and video.get("id") and video.get("title") and media_url(text(video.get("playbackUrl"))):
                    old.setdefault(str(video["id"]),video)
    except (OSError,json.JSONDecodeError): pass
    for key, video in old.items(): collected.setdefault(key,video)
    videos = sorted(collected.values(), key=lambda v:(v.get("publishedDate",""),v.get("title","").lower()), reverse=True)
    unique, seen = [], set()
    for v in videos:
        path = urllib.parse.urlparse(text(v.get("playbackUrl")))
        slug = re.sub(r"[^a-z0-9]+","-",text(v.get("slug")).lower()).strip("-")
        identity = "slug:"+slug if slug else "media:"+((path.hostname or "")+path.path).lower()
        if identity in seen: continue
        seen.add(identity); unique.append(v)
    if not unique: raise RuntimeError("No playable IPL videos found; refusing to overwrite the existing feed.")
    old_ids = set(old)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps({"source":"BCCI official IPL video API","updatedAt":now,"count":len(unique),"videos":unique},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    REPORT.write_text(json.dumps({"source":"BCCI official IPL video refresh","updatedAt":now,"totalVideos":len(unique),"previousTotal":len(old_ids),"addedCount":sum(1 for v in unique if str(v["id"]) not in old_ids),"historyPreserved":sum(1 for k in old if k not in {str(v["id"]) for v in unique})},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Saved {len(unique)} unique IPL videos; {sum(1 for v in unique if str(v['id']) not in old_ids)} new.")
if __name__ == "__main__": main()
