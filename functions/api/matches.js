/**
 * India-only Match Center API for Cloudflare Pages Functions.
 * Cloudflare secret binding: CRICAPI_KEY. Never expose the key in client code.
 */
const CRICAPI = "https://api.cricapi.com/v1";
const CACHE_SECONDS = 180;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30, s-maxage=120",
    },
  });
}

function getList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.matchList)) return payload.data.matchList;
  if (Array.isArray(payload?.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload?.data?.match)) return payload.data.match;
  if (Array.isArray(payload?.matchList)) return payload.matchList;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function teamNames(match) {
  const teams = Array.isArray(match?.teams) ? match.teams : [];
  const names = teams.map((team) => typeof team === "string" ? team : team?.name || team?.teamName || "");
  if (!names.length) {
    for (const key of ["team1", "team2"]) {
      if (match?.[key]) names.push(typeof match[key] === "string" ? match[key] : match[key]?.name || "");
    }
  }
  if (!names.length && match?.name) {
    const parts = String(match.name).split(/\s+(?:vs?\.?|v)\s+/i);
    if (parts.length >= 2) names.push(parts[0].trim(), parts[1].trim());
  }
  return names.filter(Boolean);
}

function isIndiaName(name) {
  return /^india(?:\s+(?:women|men))?$/i.test(String(name || "").trim());
}

function isIndiaMatch(match) {
  return teamNames(match).some(isIndiaName);
}

function parseDate(match) {
  const value = match?.dateTimeGMT || match?.date || match?.startDate || match?.startTime || null;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalize(match) {
  const names = teamNames(match);
  const score = Array.isArray(match?.score) ? match.score : [];
  const scoreText = (item) => {
    if (!item) return "";
    if (typeof item === "string") return item;
    const runs = item.r ?? item.runs;
    const wickets = item.w ?? item.wickets;
    const innings = [runs, wickets].filter((v) => v != null).join("/");
    const overs = item.o ?? item.overs;
    return innings + (overs != null && overs !== "" ? " (" + overs + " ov)" : "");
  };
  const state = String(match?.status || match?.matchStatus || "").toLowerCase();
  const started = Boolean(match?.matchStarted);
  const ended = Boolean(match?.matchEnded);
  const isLive = (started && !ended) || /live|in progress|innings break|stumps|drinks|lunch|tea/.test(state);
  const isFinished = ended || /won|drawn|tied|no result|abandoned|completed|finished/.test(state);
  const date = parseDate(match);
  const status = isLive ? "Live" : isFinished ? "Result" : "Scheduled";
  const id = match?.id || match?.unique_id || match?.matchId || "";
  const series = typeof match?.series === "string" ? match.series : match?.series?.name || match?.seriesName || "India international cricket";
  return {
    id: String(id || [names.join("-"), match?.date || match?.dateTimeGMT || ""].join("-")),
    matchId: String(id),
    title: match?.name || match?.title || names.join(" vs "),
    series,
    team1: names[0] || "India",
    team2: names[1] || "TBC",
    score1: scoreText(score[0]) || match?.score1 || "",
    score2: scoreText(score[1]) || match?.score2 || "",
    status,
    format: match?.matchType || match?.format || "Cricket",
    venue: match?.venue || "",
    startTime: date ? date.toISOString() : null,
    result: match?.status || "",
    scorecardUrl: id ? "https://www.espncricinfo.com/live-cricket-score" : "https://www.bcci.tv/matches",
    matchUrl: "https://www.bcci.tv/matches",
    bcciUrl: "https://www.bcci.tv/matches",
    source: "CricAPI",
  };
}

async function fetchApi(path, key) {
  const url = new URL(CRICAPI + path);
  url.searchParams.set("apikey", key);
  if (!url.searchParams.has("offset")) url.searchParams.set("offset", "0");
  const response = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
  });
  if (!response.ok) throw new Error("CricAPI HTTP " + response.status);
  const payload = await response.json();
  if (payload?.status === "failure" || payload?.error) {
    throw new Error(String(payload?.reason || payload?.message || payload?.error || "CricAPI request failed"));
  }
  return payload;
}

function seriesList(payload) {
  return getList(payload).filter((s) => {
    const name = String(s?.name || s?.seriesName || "");
    const count = s?.matches ?? s?.matchCount ?? s?.totalMatches;
    // CricAPI responses may omit the match count. Only reject an explicit zero.
    return /\bindia\b/i.test(name) && (count == null || Number(count) > 0);
  });
}

export async function onRequestGet({ request, env }) {
  const key = env?.CRICAPI_KEY;
  if (!key) return json({ provider: "CricAPI", providerOk: false, error: "CRICAPI_KEY is not configured in Cloudflare Pages secrets.", total: 0, matches: [], updatedAt: new Date().toISOString() }, 503);

  const view = new URL(request.url).searchParams.get("view") || "all";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byId = new Map();
  const errors = [];
  let providerOk = false;

  const [currentResult, matchResult, seriesResult] = await Promise.allSettled([
    fetchApi("/currentMatches", key),
    fetchApi("/matches", key),
    fetchApi("/series?offset=0", key),
  ]);

  for (const result of [currentResult, matchResult]) {
    if (result.status !== "fulfilled") {
      errors.push(String(result.reason?.message || "CricAPI match list unavailable"));
      continue;
    }
    providerOk = true;
    for (const raw of getList(result.value)) {
      if (!isIndiaMatch(raw)) continue;
      const m = normalize(raw);
      byId.set(m.id, { ...(byId.get(m.id) || {}), ...m });
    }
  }

  if (seriesResult.status === "fulfilled") {
    providerOk = true;
    const upcomingSeries = seriesList(seriesResult.value)
      .map((s) => {
        const dateValue = s.startDate || s.startDateTime || s.date;
        const date = dateValue ? new Date(dateValue).getTime() : null;
        return { ...s, _start: Number.isFinite(date) ? date : null };
      })
      .filter((s) => s._start == null || s._start >= today.getTime() - 60 * 86400000)
      .sort((a, b) => {
        const now = Date.now();
        const aFuture = a._start != null && a._start >= now;
        const bFuture = b._start != null && b._start >= now;
        if (aFuture !== bFuture) return aFuture ? -1 : 1;
        if (a._start == null && b._start != null) return 1;
        if (b._start == null && a._start != null) return -1;
        return (a._start ?? Number.MAX_SAFE_INTEGER) - (b._start ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 12);
    const detailResults = await Promise.allSettled(upcomingSeries.map((s) => {
      const id = s.id || s.seriesId || s.unique_id;
      return id ? fetchApi("/series_info?id=" + encodeURIComponent(id), key) : Promise.resolve(null);
    }));
    for (const result of detailResults) {
      if (result.status !== "fulfilled" || !result.value) {
        if (result.status === "rejected") errors.push(String(result.reason?.message || "Series fixtures unavailable"));
        continue;
      }
      for (const raw of getList(result.value)) {
        if (!isIndiaMatch(raw)) continue;
        const m = normalize(raw);
        const old = byId.get(m.id);
        byId.set(m.id, old ? { ...m, ...old, score1: old.score1 || m.score1, score2: old.score2 || m.score2 } : m);
      }
    }
  } else {
    errors.push(String(seriesResult.reason?.message || "CricAPI series list unavailable"));
  }

  const matches = [...byId.values()].map((m) => {
    const d = parseDate(m);
    if (m.status === "Scheduled" && d && d.getTime() < Date.now() - 5 * 60 * 1000) {
      return { ...m, status: "Result" };
    }
    return m;
  }).sort((a, b) => {
    const order = { Live: 0, Scheduled: 1, Result: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    const da = parseDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = parseDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return a.status === "Result" ? db - da : da - db;
  });

  const filtered = view === "live" ? matches.filter((m) => m.status === "Live")
    : view === "upcoming" ? matches.filter((m) => m.status === "Scheduled")
    : view === "results" ? matches.filter((m) => m.status === "Result")
    : matches;

  return json({
    provider: "CricAPI",
    providerOk,
    updatedAt: new Date().toISOString(),
    total: filtered.length,
    matches: filtered,
    errors: errors.slice(0, 3),
  });
}
