import { json, requireAdmin, saveRepoJson, fetchWithTimeout } from "../../_lib/admin.js";

const PATH = "matches/manual-upcoming-fixtures.json";
const repoName = (env) => env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
async function readSnapshot(env) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing from Cloudflare Pages secrets.");
  const branch = env.GITHUB_BRANCH || "main";
  const response = await fetchWithTimeout(
    "https://api.github.com/repos/" +
      repoName(env) +
      "/contents/" +
      PATH +
      "?ref=" +
      encodeURIComponent(branch),
    {
      headers: {
        authorization: "Bearer " + env.GITHUB_TOKEN,
        accept: "application/vnd.github+json",
        "user-agent": "TilakVarmaFanClub-Admin",
      },
    },
    15000,
  );
  if (response.status === 404) return { data: { fixtures: [] }, sha: null };
  if (!response.ok) throw new Error("Could not load manual fixtures (" + response.status + ").");
  const file = await response.json();
  const bytes = Uint8Array.from(atob((file.content || "").replace(/\s/g, "")), (c) =>
    c.charCodeAt(0),
  );
  return { data: JSON.parse(new TextDecoder().decode(bytes)), sha: file.sha };
}
function validate(data) {
  if (!data || !Array.isArray(data.fixtures)) return "Fixtures must be an array.";
  if (data.fixtures.length > 200) return "Maximum 200 manual fixtures are allowed.";
  const seen = new Set();
  for (const [i, f] of data.fixtures.entries()) {
    if (!f || typeof f !== "object") return "Fixture " + (i + 1) + " is invalid.";
    for (const key of ["date", "match", "opponent", "venue", "time"]) {
      if (typeof f[key] !== "string" || !f[key].trim())
        return "Fixture " + (i + 1) + " needs " + key + ".";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || Number.isNaN(Date.parse(f.date + "T12:00:00Z")))
      return "Fixture " + (i + 1) + " has an invalid date.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time))
      return "Fixture " + (i + 1) + " has an invalid IST time.";
    for (const key of ["match", "opponent", "venue", "date", "time"])
      if (f[key].length > 160) return "Fixture " + (i + 1) + " has an overly long " + key + ".";
    if (
      f.newsUrl &&
      !(f.newsUrl.startsWith("/News-details/index.html?id=") || /^https:\/\//i.test(f.newsUrl))
    )
      return "News link must be a Fan Club article path or HTTPS URL.";
    const key = f.date + "|" + f.match.toLowerCase() + "|" + f.opponent.toLowerCase();
    if (seen.has(key)) return "Duplicate manual fixture: " + f.match + " on " + f.date + ".";
    seen.add(key);
  }
  return null;
}
export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  try {
    const snapshot = await readSnapshot(env);
    return json({ ...snapshot.data, sha: snapshot.sha, path: PATH });
  } catch (error) {
    return json({ error: error.message || "Could not load fixtures." }, 502);
  }
}
export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }
  const data = {
    fixtures: Array.isArray(body?.fixtures) ? body.fixtures : null,
    updatedAt: new Date().toISOString(),
    source: "Admin manual override",
  };
  const problem = validate(data);
  if (problem) return json({ error: problem }, 400);
  try {
    const current = await readSnapshot(env);
    if (typeof body.expectedSha === "string" && body.expectedSha !== (current.sha || ""))
      return json({ error: "Fixture data changed in another session. Reload before saving." }, 409);
    const commit = await saveRepoJson(env, PATH, data, current.sha);
    return json({ ok: true, fixtures: data.fixtures, commit, updatedAt: data.updatedAt });
  } catch (error) {
    return json({ error: error.message || "Could not save manual fixtures." }, error.status || 502);
  }
}
