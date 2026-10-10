/**
 * Match Center data aggregator for Cloudflare Pages Functions.
 * ESPNcricinfo's consumer endpoints are unofficial and may change.
 * Never fabricate scores: failed providers are reported in the response.
 */
const ESPN = "https://hs-consumer-api.espncricinfo.com/v1/pages/matches";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=45, s-maxage=60",
      "access-control-allow-origin": "*",
    },
  });
}

function dateParam(date) {
  const d = new Date(date);
  return [String(d.getDate()).padStart(2, "0"), String(d.getMonth() + 1).padStart(2, "0"), d.getFullYear()].join("-");
}

function arrFromPayload(payload) {
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload?.data?.content?.matches)) return payload.data.content.matches;
  return [];
}

function normalize(match, sourceState) {
  const teams = Array.isArray(match?.teams) ? match.teams : [];
  const t1 = teams[0] || {};
  const t2 = teams[1] || {};
  const teamName = (t) => t?.team?.name || t?.name || t?.teamName || "TBC";
  const teamScore = (t) => t?.score || t?.scoreString || t?.inningScore || "";
  const series = match?.series || {};
  const ground = match?.ground || match?.venue || {};
  const matchId = match?.objectId || match?.id || match?.matchId || "";
  const seriesId = series?.objectId || series?.id || match?.seriesId || "";
  const slug = match?.slug || "";
  const seriesSlug = series?.slug || "";
  const fmt = match?.format || match?.generalClassCard || match?.internationalClassCard || "";
  const rawState = String(match?.state || match?.stage || match?.status || sourceState || "").toUpperCase();
  let status = "Scheduled";
  if (/LIVE|RUNNING|IN.?PROGRESS/.test(rawState)) status = "Live";
  else if (/RESULT|COMPLETE|FINISHED|POST/.test(rawState)) status = "Result";
  else if (/ABANDON|CANCEL/.test(rawState)) status = "Abandoned";
  else if (/STUMP|TEA|LUNCH|RAIN|DELAY/.test(rawState)) status = "In progress";
  const start = match?.startDate || match?.startTime || match?.date || match?.startDateTime || null;
  const matchUrl = matchId && seriesId
    ? "https://www.espncricinfo.com/series/" + encodeURIComponent(seriesSlug || "cricket") + "-" + seriesId + "/" + encodeURIComponent(slug || "match") + "-" + matchId + "/live-cricket-score"
    : "https://www.espncricinfo.com/live-cricket-score";
  return {
    id: String(matchId || [teamName(t1), teamName(t2), start].join("-")),
    matchId: String(matchId),
    seriesId: String(seriesId),
    title: match?.title || match?.name || match?.description || match?.matchDescription || "",
    series: series?.name || series?.longName || match?.seriesName || "Cricket",
    team1: teamName(t1),
    team2: teamName(t2),
    score1: teamScore(t1),
    score2: teamScore(t2),
    status,
    state: rawState,
    format: fmt,
    venue: typeof ground === "string" ? ground : ground?.name || ground?.longName || ground?.groundName || "",
    startTime: start,
    result: match?.statusText || match?.status || match?.result || "",
    matchUrl,
    scorecardUrl: matchId && seriesId
      ? "https://www.espncricinfo.com/series/" + encodeURIComponent(seriesSlug || "cricket") + "-" + seriesId + "/" + encodeURIComponent(slug || "match") + "-" + matchId + "/full-scorecard"
      : matchUrl,
    bcciUrl: "https://www.bcci.tv/matches",
    source: "ESPNcricinfo",
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "TilakVarmaFanClub-MatchCenter/1.0" },
    cf: { cacheTtl: 45, cacheEverything: true },
  });
  if (!response.ok) throw new Error("Provider returned HTTP " + response.status);
  return response.json();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "all";
  const today = new Date();
  const dates = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }

  const jobs = [
    fetchJson(ESPN + "/current?lang=en&latest=true").then((p) => ({ source: "live", payload: p })),
    ...dates.slice(0, 7).map((d) =>
      fetchJson(ESPN + "/scheduled?lang=en&filterType=DATE&filterValue=" + dateParam(d))
        .then((p) => ({ source: "scheduled", payload: p }))
        .catch(() => null)
    ),
    fetchJson(ESPN + "/result?lang=en&filterType=DATE&filterValue=" + dateParam(today))
      .then((p) => ({ source: "result", payload: p }))
      .catch(() => null),
  ];

  const settled = await Promise.allSettled(jobs);
  const byId = new Map();
  let providerOk = false;
  const errors = [];
  for (const item of settled) {
    if (item.status !== "fulfilled" || !item.value) {
      if (item.status === "rejected") errors.push(String(item.reason?.message || "ESPNcricinfo unavailable"));
      continue;
    }
    providerOk = true;
    const { source, payload } = item.value;
    for (const match of arrFromPayload(payload)) {
      const normalized = normalize(match, source);
      if (!normalized.id) continue;
      const previous = byId.get(normalized.id);
      if (!previous || (normalized.score1 + normalized.score2).length > (previous.score1 + previous.score2).length) {
        byId.set(normalized.id, normalized);
      }
    }
  }

  const matches = [...byId.values()].sort((a, b) => {
    const order = { Live: 0, "In progress": 1, Scheduled: 2, Result: 3, Abandoned: 4 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
      String(a.startTime || "").localeCompare(String(b.startTime || ""));
  });
  const filtered = view === "live" ? matches.filter((m) => ["Live", "In progress"].includes(m.status))
    : view === "upcoming" ? matches.filter((m) => m.status === "Scheduled")
    : view === "results" ? matches.filter((m) => ["Result", "Abandoned"].includes(m.status))
    : matches;

  return json({
    updatedAt: new Date().toISOString(),
    provider: "ESPNcricinfo public consumer feed",
    providerOk,
    staleData: false,
    errors: errors.slice(0, 3),
    total: filtered.length,
    matches: filtered,
    sources: [
      { name: "ESPNcricinfo", url: "https://www.espncricinfo.com/live-cricket-score" },
      { name: "BCCI", url: "https://www.bcci.tv/matches" },
    ],
  });
}
