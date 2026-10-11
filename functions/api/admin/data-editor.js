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
    if (!Array.isArray(value.recentInnings))
      return "recentInnings must remain an array.";
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
