import { json, requireAdmin, saveRepoJson } from "../../_lib/admin.js";

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
const MAX_BYTES = 8 * 1024 * 1024;

async function readFile(env, path) {
  const repo = env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
  const branch = env.GITHUB_BRANCH || "main";
  const response = await fetch(
    "https://raw.githubusercontent.com/" + repo + "/" + branch + "/" + path,
    { headers: { "cache-control": "no-cache" } },
  );
  if (!response.ok) throw new Error("Could not read " + path + " (" + response.status + ").");
  return response.json();
}

function validate(kind, value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Data must be a JSON object.";
  if (kind === "stats") {
    if (!value.statsguru && !value.careerStats && !value.recentInnings)
      return "Stats file is missing its expected statsguru, careerStats, or recentInnings data.";
    if (value.recentInnings !== undefined && !Array.isArray(value.recentInnings))
      return "recentInnings must remain an array.";
    if (value.statsguru !== undefined && typeof value.statsguru !== "object")
      return "statsguru must remain an object.";
  } else {
    const hasKnownData =
      Array.isArray(value.innings) ||
      (value.formats && typeof value.formats === "object") ||
      Array.isArray(value.matches) ||
      Array.isArray(value.records);
    if (!hasKnownData)
      return "Death Overs file must retain its innings, formats, matches, or records data.";
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
    const data = await readFile(env, def.path);
    return json({ kind, path: def.path, label: def.label, data });
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
  const kind = body?.kind;
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
  const validationError = validate(kind, data);
  if (validationError) return json({ error: validationError }, 400);
  const encoded = JSON.stringify(data);
  if (new TextEncoder().encode(encoded).length > MAX_BYTES)
    return json({ error: "Data exceeds the 8 MB Admin Studio save limit." }, 413);
  try {
    const commit = await saveRepoJson(env, def.path, data);
    return json({ ok: true, kind, path: def.path, commit, updatedAt: new Date().toISOString() });
  } catch (error) {
    return json({ error: error.message || "Save failed." }, 502);
  }
}
