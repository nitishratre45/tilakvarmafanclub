/** Fetch detailed scorecard only when a visitor opens a match scoreboard. */
const CRICAPI = "https://api.cricapi.com/v1";
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=15, s-maxage=30" } });
}
export async function onRequestGet({ request, env }) {
  const key = env?.CRICAPI_KEY;
  const id = new URL(request.url).searchParams.get("id");
  if (!key) return json({ ok: false, error: "Scoreboard provider is not configured." }, 503);
  if (!id || id.length > 160 || !/^[\w-]+$/.test(id)) return json({ ok: false, error: "A valid match ID is required." }, 400);
  const url = new URL(CRICAPI + "/match_scorecard");
  url.searchParams.set("apikey", key);
  url.searchParams.set("id", id);
  try {
    const response = await fetch(url.toString(), { headers: { accept: "application/json" }, cf: { cacheTtl: 30, cacheEverything: true } });
    if (!response.ok) return json({ ok: false, error: "Scorecard provider returned HTTP " + response.status }, 502);
    const payload = await response.json();
    if (payload?.status === "failure" || payload?.error) return json({ ok: false, error: String(payload?.reason || payload?.message || "Detailed scorecard is not available for this match.") }, 502);
    return json({ ok: true, data: payload?.data ?? payload, updatedAt: new Date().toISOString() });
  } catch (_) {
    return json({ ok: false, error: "Could not load the detailed scorecard right now." }, 502);
  }
}