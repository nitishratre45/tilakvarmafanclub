/**
 * India-only Match Center API for Cloudflare Pages Functions.
 * Secret binding required: CRICAPI_KEY (set in Cloudflare Pages > Settings > Variables and Secrets).
 * API keys must never be committed to the repository or sent to the browser.
 */
const CRICAPI = "https://api.cricapi.com/v1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30, s-maxage=45",
      "access-control-allow-origin": "*",
    },
  });
}

function getList(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function teamNames(match) {
  const teams = Array.isArray(match?.teams) ? match.teams : [];
  const names = teams.map((team) => typeof team === "string" ? team : team?.name || team?.teamName || "");
  if (!names.length) {
    if (match?.team1) names.push(typeof match.team1 === "string" ? match.team1 : match.team1?.name || "");
    if (match?.team2) names.push(typeof match.team2 === "string" ? match.team2 : match.team2?.name || "");
  }
  return names.filter(Boolean);
}

function isIndiaMatch(match) {
  const names = teamNames(match);
  // Only matches involving the senior India men's or women's national teams.
  // Excludes India A, India U19 and domestic teams such as Mumbai/Hyderabad.
  return names.some((name) => /^india(?:\s+(?:women|men))?$/i.test(String(name).trim()));
}

function normalize(match) {
  const names = teamNames(match);
  const score = Array.isArray(match?.score) ? match.score : [];
  const scoreText = (item) => {
    if (!item) return "";
    if (typeof item === "string") return item;
    const innings = [item.r != null ? item.r : item.runs, item.w != null ? item.w : item.wickets]
      .filter((v) => v != null).join("/");
    const overs = item.o != null ? item.o : item.overs;
    return innings + (overs != null && overs !== "" ? " (" + overs + " ov)" : "");
  };
  const state = String(match?.status || match?.matchStatus || "").toLowerCase();
  const isLive = Boolean(match?.matchStarted && !match?.matchEnded) ||
    /live|in progress|innings break|stumps|day d+|drinks|lunch|tea/.test(state);
  const isFinished = Boolean(match?.matchEnded) || /won|drawn|tied|no result|abandoned|completed|finished/.test(state);
  let status = isLive ? "Live" : isFinished ? "Result" : "Scheduled";
  const id = match?.id || match?.unique_id || match?.matchId || "";
  return {
    id: String(id || [names.join("-"), match?.date || match?.dateTimeGMT || ""].join("-")),
    matchId: String(id),
    title: match?.name || match?.title || names.join(" vs "),
    series: match?.series || match?.seriesName || "India international cricket",
    team1: names[0] || "TBC",
    team2: names[1] || "TBC",
    score1: scoreText(score[0]) || match?.score1 || "",
    score2: scoreText(score[1]) || match?.score2 || "",
    status,
    format: match?.matchType || match?.format || "Cricket",
    venue: match?.venue || "",
    startTime: match?.dateTimeGMT || match?.date || null,
    result: match?.status || "",
    matchUrl: id ? "https://cricketdata.org/" : "https://www.bcci.tv/matches",
    scorecardUrl: id ? "https://api.cricapi.com/v1/match_scorecard?id=" + encodeURIComponent(id) : "https://www.bcci.tv/matches",
    bcciUrl: "https://www.bcci.tv/matches",
    source: "CricAPI",
  };
}

async function fetchApi(path, key) {
  const url = new URL(CRICAPI + path);
  url.searchParams.set("apikey", key);
  url.searchParams.set("offset", "0");
  const response = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 30, cacheEverything: true },
  });
  if (!response.ok) throw new Error("CricAPI HTTP " + response.status);
  const payload = await response.json();
  if (payload?.status === "failure" || payload?.error) {
    throw new Error(String(payload?.reason || payload?.message || payload?.error || "CricAPI request failed"));
  }
  return payload;
}

export async function onRequestGet({ request, env }) {
  const key = env?.CRICAPI_KEY;
  if (!key) {
    return json({
      provider: "CricAPI",
      providerOk: false,
      error: "CRICAPI_KEY is not configured in Cloudflare Pages environment variables.",
      total: 0,
      matches: [],
      updatedAt: new Date().toISOString(),
    }, 503);
  }

  const view = new URL(request.url).searchParams.get("view") || "all";
  const results = await Promise.allSettled([
    fetchApi("/currentMatches", key),
    fetchApi("/matches", key),
  ]);
  const byId = new Map();
  const errors = [];
  let providerOk = false;

  for (const result of results) {
    if (result.status !== "fulfilled") {
      errors.push(String(result.reason?.message || "CricAPI unavailable"));
      continue;
    }
    providerOk = true;
    for (const raw of getList(result.value)) {
      if (!isIndiaMatch(raw)) continue;
      const match = normalize(raw);
      const previous = byId.get(match.id);
      if (!previous || (match.score1 + match.score2).length > (previous.score1 + previous.score2).length) {
        byId.set(match.id, match);
      }
    }
  }

  const matches = [...byId.values()].sort((a, b) => {
    const order = { Live: 0, Scheduled: 1, Result: 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      String(a.startTime || "").localeCompare(String(b.startTime || ""));
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
    errors: errors.slice(0, 2),
  });
}
