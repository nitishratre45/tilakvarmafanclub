import { json, requireAdmin, saveRepoJson, fetchWithTimeout } from "../../_lib/admin.js";

const FILES = {
  stats: {
    path: "data/site-data.json",
    label: "Stats, profile, innings, records and rankings",
  },
  death: {
    path: "data/death-overs.json",
    label: "Death Overs ball-by-ball and over summaries",
  },
};
// Death Overs snapshot is larger than 8 MB; allow the verified current dataset with headroom.
const MAX_BYTES = 12 * 1024 * 1024;

async function readFile(env, path) {
  if (!env.GITHUB_TOKEN)
    throw new Error("GITHUB_TOKEN is missing from Cloudflare Pages environment variables.");
  const repo = env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
  const branch = env.GITHUB_BRANCH || "main";
  const headers = {
    authorization: "Bearer " + env.GITHUB_TOKEN,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "TilakVarmaFanClub-Admin",
  };
  const response = await fetchWithTimeout(
    "https://api.github.com/repos/" +
      repo +
      "/contents/" +
      path +
      "?ref=" +
      encodeURIComponent(branch),
    { headers },
    15000,
  );
  if (!response.ok) throw new Error("Could not read " + path + " (" + response.status + ").");
  const file = await response.json();
  if (!file.sha || typeof file.content !== "string")
    throw new Error("GitHub did not return a versioned file snapshot for " + path + ".");
  let encoded = file.content;
  if (!encoded) {
    const blobResponse = await fetchWithTimeout(
      "https://api.github.com/repos/" + repo + "/git/blobs/" + file.sha,
      { headers },
      20000,
    );
    if (!blobResponse.ok)
      throw new Error("Could not read the full file contents (" + blobResponse.status + ").");
    const blob = await blobResponse.json();
    if (blob.encoding !== "base64" || typeof blob.content !== "string")
      throw new Error("GitHub did not return a readable file snapshot for " + path + ".");
    encoded = blob.content;
  }
  const binary = atob(encoded.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return { data, sha: file.sha };
}

function validate(kind, value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Data must be a JSON object.";
  if (kind === "stats") {
    // This editor replaces the complete JSON file, not a partial patch.
    // Require the core sections so a truncated paste cannot erase site features.
    const requiredObjects = [
      "profile",
      "careerStats",
      "careerFormats",
      "statsguru",
      "bowlingStats",
      "fieldingStats",
    ];
    for (const key of requiredObjects) {
      if (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key]))
        return "Stats file must retain its " + key + " object; refusing an incomplete replacement.";
    }
    if (!Array.isArray(value.recentInnings)) return "recentInnings must remain an array.";
    if (
      !value.statsguru.formats ||
      typeof value.statsguru.formats !== "object" ||
      Array.isArray(value.statsguru.formats) ||
      !Object.keys(value.statsguru.formats).length
    )
      return "statsguru.formats must retain the saved format data.";
    for (const format of ["T20I", "ODI", "T20", "IPL"]) {
      const snapshot = value.statsguru.formats[format];
      if (
        !snapshot ||
        !snapshot.summary ||
        typeof snapshot.summary !== "object" ||
        !Array.isArray(snapshot.innings) ||
        !snapshot.innings.length
      )
        return "Stats file must retain verified " + format + " summary and innings data.";
    }
  } else {
    if (
      !value.formats ||
      typeof value.formats !== "object" ||
      Array.isArray(value.formats) ||
      !Object.keys(value.formats).length
    )
      return "Death Overs file must retain its non-empty formats object.";
    if (
      !Array.isArray(value.innings) ||
      !value.innings.length ||
      !Array.isArray(value.overTotals) ||
      !value.overTotals.length
    )
      return "Death Overs file must retain non-empty innings and overTotals arrays.";
    const hasFormatInnings = Object.values(value.formats).some(
      (format) => Array.isArray(format?.innings) && format.innings.length > 0,
    );
    if (!hasFormatInnings)
      return "Death Overs formats must retain at least one format with verified innings.";
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "stats";
  const def = FILES[kind];
  if (!def) return json({ error: "Choose Stats or Death Overs data." }, 400);
  try {
    const snapshot = await readFile(env, def.path);
    return json({ kind, path: def.path, label: def.label, data: snapshot.data, sha: snapshot.sha });
  } catch (error) {
    return json({ error: error.message || "Could not load data." }, 502);
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
  if (!body || typeof body !== "object" || Array.isArray(body))
    return json({ error: "Invalid request body." }, 400);
  const kind = body.kind;
  const def = FILES[kind];
  if (!def) return json({ error: "Choose Stats or Death Overs data." }, 400);
  let data = body.data;
  if (typeof data === "string") {
    if (new TextEncoder().encode(data).length > MAX_BYTES)
      return json({ error: "JSON is too large to save through Admin Studio." }, 413);
    try {
      data = JSON.parse(data);
    } catch (error) {
      return json({ error: "JSON syntax error: " + error.message }, 400);
    }
  }
  if (typeof body.expectedSha !== "string" || !body.expectedSha)
    return json(
      { error: "Missing saved file version. Reload the latest data before saving." },
      400,
    );
  const validationError = validate(kind, data);
  if (validationError) return json({ error: validationError }, 400);
  const encoded = JSON.stringify(data);
  if (new TextEncoder().encode(encoded).length > MAX_BYTES)
    return json({ error: "Data exceeds the 8 MB Admin Studio save limit." }, 413);
  try {
    const expectedSha = typeof body.expectedSha === "string" ? body.expectedSha : null;
    const commit = await saveRepoJson(env, def.path, data, expectedSha);
    return json({ ok: true, kind, path: def.path, commit, updatedAt: new Date().toISOString() });
  } catch (error) {
    return json({ error: error.message || "Save failed." }, error.status || 502);
  }
}
