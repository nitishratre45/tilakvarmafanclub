import { json, requireAdmin } from "../../_lib/admin.js";

const API = "https://api.github.com";
const REPO_DEFAULT = "nitishratre45/tilakvarmafanclub";
const DATASETS = [
  {
    id: "t20i-batting",
    name: "Tilak Varma · T20I batting",
    file: "data/site-data.json",
    section: "statsguru",
    intervalHours: 24,
    workflow: "refresh-statsguru.yml",
    required: true,
  },
  {
    id: "other-batting",
    name: "ODI / Overall T20 / FC / List A batting",
    file: "data/site-data.json",
    section: "statsguru",
    intervalHours: 24,
    workflow: "refresh-statsguru.yml",
    required: true,
  },
  {
    id: "bowling",
    name: "Bowling stats",
    file: "data/site-data.json",
    section: "bowlingStats",
    intervalHours: 24,
    workflow: "refresh-bowling.yml",
    required: true,
  },
  {
    id: "fielding",
    name: "Fielding stats",
    file: "data/site-data.json",
    section: "fieldingStats",
    intervalHours: 24,
    workflow: "refresh-statsguru.yml",
    required: false,
  },
  {
    id: "profile-career",
    name: "Profile & career snapshot",
    file: "data/site-data.json",
    section: "careerStats",
    intervalHours: 12,
    workflow: "refresh-tilak-data.yml",
    required: true,
  },
  {
    id: "recent-innings",
    name: "Recent innings / match records",
    file: "data/site-data.json",
    section: "recentInnings",
    intervalHours: 12,
    workflow: "refresh-tilak-data.yml",
    required: true,
  },
  {
    id: "news",
    name: "BCCI / ESPNcricinfo news",
    file: "data/tilak-news.json",
    section: "news",
    intervalHours: 12,
    workflow: "refresh-tilak-data.yml",
    required: false,
  },
  {
    id: "death-overs",
    name: "Death-overs / over-by-over stats",
    file: "data/death-overs.json",
    section: "death",
    intervalHours: 12,
    workflow: "refresh-death-overs.yml",
    required: true,
  },
  {
    id: "icc",
    name: "ICC rankings & records",
    file: "data/site-data.json",
    section: "iccRankings",
    intervalHours: 48,
    workflow: "refresh-icc-records.yml",
    required: false,
  },
  {
    id: "bcci-videos",
    name: "Official BCCI video feed",
    file: "assets/bcci-videos.json",
    section: "videos",
    intervalHours: 24,
    workflow: "refresh-bcci-videos.yml",
    required: false,
  },
  {
    id: "bcci-photo",
    name: "Official BCCI profile photo",
    file: "data/bcci-tilak-photo.json",
    section: "photo",
    intervalHours: 720,
    workflow: "refresh-bcci-tilak-photo.yml",
    required: false,
  },
  {
    id: "cricinfo-photos",
    name: "ESPNcricinfo photo gallery",
    file: "data/cricinfo-photos.json",
    section: "photos",
    intervalHours: 24,
    workflow: "refresh-cricinfo-photos.yml",
    required: false,
  },
];
const headers = (env) => ({
  authorization: "Bearer " + env.GITHUB_TOKEN,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "TilakVarmaFanClub-Admin",
});
const repoName = (env) => env.GITHUB_REPOSITORY || REPO_DEFAULT;
async function github(env, path, options = {}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing from Cloudflare Pages secrets.");
  const response = await fetch(API + "/repos/" + repoName(env) + path, {
    ...options,
    headers: { ...headers(env), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error("GitHub API returned " + response.status + " for " + path);
  return response.json();
}
async function readData(env, path) {
  const repo = repoName(env);
  const branch = env.GITHUB_BRANCH || "main";
  const response = await fetch(
    "https://raw.githubusercontent.com/" + repo + "/" + branch + "/" + path,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(path + " could not be read (" + response.status + ")");
  return response.json();
}
function parseDate(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.includes(" UTC") ? value.replace(" ", "T").replace(/ UTC$/, "Z") : value;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}
function iso(value) {
  return value ? value.toISOString() : null;
}
function latestTimestamp(...values) {
  return (
    values
      .filter(Boolean)
      .map((value) => ({ value, date: parseDate(value) }))
      .filter((item) => item.date)
      .sort((a, b) => b.date - a.date)[0]?.value || null
  );
}
function ageHours(date, now) {
  return date ? Math.max(0, (now - date) / 3600000) : null;
}
function compactErrors(value) {
  if (Array.isArray(value)) return value.map(String).slice(0, 8);
  if (typeof value === "string" && value) return [value];
  return [];
}
function getInfo(def, data) {
  if (def.id === "t20i-batting" || def.id === "other-batting") {
    const sg = data.statsguru || {};
    const formats = sg.formats || {};
    const names = def.id === "t20i-batting" ? ["T20I"] : ["ODI", "T20", "FC", "List A"];
    const careerFormats = data.careerFormats || {};
    const fallbackNames = { FC: "First-class", "List A": "List A" };
    const fmt = Object.fromEntries(
      names.map((n) => {
        const live = formats[n] || {};
        const fallback = careerFormats[fallbackNames[n]] || {};
        const f = live.summary ? live : fallback;
        const s = f.summary || f;
        const isStatsguru = Boolean(live.summary);
        return [
          n,
          {
            available: Boolean(live.summary || fallback.runs !== undefined),
            matches: s.matches ?? null,
            innings: s.innings ?? (Array.isArray(f.innings) ? f.innings.length : null),
            runs: s.runs ?? null,
            highestScore: s.highestScore ?? null,
            average: s.average ?? null,
            strikeRate: s.strikeRate ?? null,
            detailedInnings: Array.isArray(f.innings) ? f.innings.length : 0,
            updatedAt: isStatsguru
              ? live.checkedAt || sg.updatedAt || null
              : fallback.updatedAt || null,
            source: isStatsguru
              ? live.source || sg.source || "ESPNcricinfo Statsguru"
              : fallback.source || null,
            sourceUrl: isStatsguru
              ? live.sourceUrl || sg.sourceUrl || null
              : fallback.sourceUrl || null,
            detailStatus: isStatsguru
              ? live.detailStatus || null
              : fallback.detailStatus || "saved summary; refresh timestamp unavailable",
          },
        ];
      }),
    );
    const timestamps = Object.values(fmt)
      .map((entry) => entry.updatedAt)
      .filter(Boolean);
    return {
      updatedAt: timestamps.length ? latestTimestamp(...timestamps) : null,
      attemptAt: sg.lastAttemptAt,
      attemptStatus: sg.lastAttemptStatus,
      errors: compactErrors(sg.lastAttemptErrors),
      count: Object.values(fmt).filter((x) => x.available).length,
      total: names.length,
      summary: fmt,
      source: sg.source || "ESPNcricinfo Statsguru",
      sourceUrl: sg.sourceUrl,
    };
  }
  if (def.id === "bowling" || def.id === "fielding") {
    const section = data[def.section] || {};
    const formats = section.formats || {};
    const summary = Object.fromEntries(
      Object.entries(formats).map(([name, f]) => [
        name,
        {
          available: Boolean(f.summary),
          matches: f.summary?.matches ?? null,
          innings: Array.isArray(f.innings) ? f.innings.length : 0,
          wickets: f.summary?.wickets ?? null,
          catches: f.summary?.catches ?? null,
          dismissals: f.summary?.dismissals ?? null,
        },
      ]),
    );
    return {
      updatedAt: section.updatedAt,
      attemptAt: section.lastAttemptAt,
      attemptStatus: section.lastAttemptStatus,
      errors: compactErrors(section.lastAttemptErrors),
      count: Object.values(summary).filter((x) => x.available).length,
      total: Object.keys(summary).length,
      summary,
      source: section.source || "ESPNcricinfo Statsguru",
      sourceUrl: section.sourceUrl,
    };
  }
  if (def.id === "profile-career")
    return {
      updatedAt: latestTimestamp(data.careerStatsUpdated, data.profileUpdated),
      attemptStatus: "see workflow",
      count: data.careerStats ? Object.keys(data.careerStats).length : 0,
      summary: data.careerStats || {},
      source: "ESPNcricinfo / official profile",
      sourceUrl: data.careerSource,
    };
  if (def.id === "recent-innings")
    return {
      updatedAt: data.recentUpdated,
      attemptAt: data.recentCheckedAt || data.lastChecked,
      attemptStatus: data.recentAttemptStatus || null,
      errors: compactErrors(data.recentAttemptError),
      count: Array.isArray(data.recentInnings) ? data.recentInnings.length : 0,
      summary: (data.recentInnings || []).slice(0, 5).map((x) => ({
        date: x.date,
        opposition: x.opposition,
        format: x.format,
        runs: x.runs,
        balls: x.balls,
        result: x.result,
      })),
      source: data.recentSource || "Cricsheet / saved match-level records",
    };
  if (def.id === "icc") {
    const section = data.iccRankings || {};
    return {
      updatedAt: latestTimestamp(section.updatedAt, data.iccRecordsUpdated),
      attemptAt: data.iccRecordsCheckedAt || section.lastAttemptAt,
      attemptStatus: section.lastAttemptStatus,
      errors: compactErrors(section.lastAttemptErrors),
      count:
        Object.keys(section).length + (data.iccRecords ? Object.keys(data.iccRecords).length : 0),
      summary: { rankings: section, recordsUpdated: data.iccRecordsUpdated || null },
      source: "ICC",
      sourceUrl: section.sourceUrl || "https://www.icc-cricket.com/rankings/70761/tilak-varma",
    };
  }
  if (def.id === "death-overs")
    return {
      updatedAt: data.updatedAt,
      attemptStatus: data.lastAttemptStatus,
      errors: compactErrors(data.lastAttemptError || data.readErrors),
      count: Array.isArray(data.innings) ? data.innings.length : 0,
      summary: {
        matchesFound: data.matchesFound,
        inningsFound: data.inningsFound,
        formats: Object.fromEntries(
          Object.entries(data.formats || {}).map(([k, v]) => [
            k,
            { matchesFound: v.matchesFound, inningsFound: v.inningsFound },
          ]),
        ),
      },
      source: "Cricsheet archives",
    };
  if (def.id === "news")
    return {
      updatedAt: data.updatedAt,
      attemptStatus: data.status,
      errors: compactErrors(data.errors),
      count: Array.isArray(data.items) ? data.items.length : 0,
      summary: (data.items || [])
        .slice(0, 5)
        .map((x) => ({ title: x.title, publisher: x.publisher, published: x.published })),
      source: Array.isArray(data.sources) ? data.sources.join(", ") : "BCCI / ESPNcricinfo",
    };
  if (def.id === "bcci-videos")
    return {
      updatedAt: data.updatedAt,
      count: Array.isArray(data.videos) ? data.videos.length : 0,
      summary: (data.videos || [])
        .slice(0, 5)
        .map((x) => ({ title: x.title, publishedDate: x.publishedDate, format: x.format })),
      source: data.source || "BCCI official video feed",
    };
  if (def.id === "bcci-photo")
    return {
      updatedAt: data.updatedAt,
      attemptAt: data.checkedAt,
      attemptStatus: data.status,
      errors: compactErrors(data.lastAttemptError),
      count: data.image ? 1 : 0,
      summary: { imageAvailable: Boolean(data.image), sourceUrl: data.sourceUrl },
      source: data.source || "BCCI",
      sourceUrl: data.sourceUrl,
    };
  if (def.id === "cricinfo-photos")
    return {
      updatedAt: data.updatedAt,
      attemptAt: data.checkedAt,
      attemptStatus: data.lastAttemptStatus || data.status,
      errors: compactErrors(data.lastAttemptError),
      count: Array.isArray(data.items) ? data.items.length : 0,
      summary: { photos: Array.isArray(data.items) ? data.items.length : 0 },
      source: data.source || "ESPNcricinfo",
      sourceUrl: data.sourceUrl,
    };
  return { updatedAt: null, count: 0, summary: {}, errors: ["No dataset mapping configured"] };
}
export async function onRequest({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request." }, 400);
    }
    if (body.action !== "refresh" || typeof body.workflow !== "string")
      return json({ error: "Unsupported action." }, 400);
    const workflow = body.workflow;
    if (!DATASETS.some((item) => item.workflow === workflow))
      return json({ error: "Workflow is not in the approved dataset refresh list." }, 400);
    try {
      await github(env, "/actions/workflows/" + workflow + "/dispatches", {
        method: "POST",
        body: JSON.stringify({ ref: "main" }),
      });
      return json(
        { ok: true, message: "Refresh workflow queued. Re-check in 30–60 seconds.", workflow },
        202,
      );
    } catch (error) {
      return json({ error: error.message }, 502);
    }
  }
  if (request.method !== "GET")
    return json({ error: "Method not allowed." }, 405, { allow: "GET, POST" });
  try {
    const now = new Date();
    const paths = [...new Set(DATASETS.map((d) => d.file))];
    const loaded = await Promise.all(
      paths.map(async (path) => {
        try {
          return [path, await readData(env, path), null];
        } catch (error) {
          return [path, null, error.message];
        }
      }),
    );
    const dataMap = Object.fromEntries(
      loaded.map(([path, data, error]) => [path, { data, error }]),
    );
    const workflows = await Promise.all(
      [...new Set(DATASETS.map((d) => d.workflow))].map(async (file) => {
        try {
          const payload = await github(env, "/actions/workflows/" + file + "/runs?per_page=8");
          return [
            file,
            (payload.workflow_runs || []).map((run) => ({
              id: run.id,
              name: run.name,
              status: run.status,
              conclusion: run.conclusion,
              createdAt: run.created_at,
              updatedAt: run.updated_at,
              url: run.html_url,
            })),
          ];
        } catch (error) {
          return [file, { error: error.message }];
        }
      }),
    );
    const workflowMap = Object.fromEntries(workflows);
    const datasets = DATASETS.map((def) => {
      const entry = dataMap[def.file];
      const info = entry.data
        ? getInfo(def, entry.data)
        : { errors: [entry.error], count: 0, summary: {} };
      const runs = workflowMap[def.workflow];
      const recentRuns = Array.isArray(runs) ? runs : [];
      const latestRun = recentRuns[0] || null;
      const latestSuccess = recentRuns.find((run) => run.conclusion === "success") || null;
      const dataDate = parseDate(info.updatedAt);
      const attemptDate = parseDate(info.attemptAt);
      const lastSuccessfulRun = latestSuccess;
      const latestFailure = recentRuns.find((run) => run.conclusion === "failure") || null;
      const hoursSinceData = ageHours(dataDate, now);
      const hoursSinceAttempt = ageHours(attemptDate, now);
      const dueAt = dataDate ? new Date(dataDate.getTime() + def.intervalHours * 3600000) : null;
      const isStale = hoursSinceData === null || hoursSinceData > def.intervalHours;
      let status = "current";
      if (entry.error) status = "unavailable";
      else if (latestRun && ["queued", "in_progress"].includes(latestRun.status))
        status = "refreshing";
      else if (
        latestFailure &&
        (!latestSuccess || latestFailure.createdAt > latestSuccess.createdAt)
      )
        status = "error";
      else if (
        info.attemptStatus === "source-unavailable" ||
        info.attemptStatus === "failed" ||
        info.attemptStatus === "error"
      )
        status = "error";
      else if (
        info.attemptStatus === "partial" ||
        info.attemptStatus === "core-ok-optional-formats-partial" ||
        (info.errors || []).length
      )
        status = "partial";
      else if (isStale) status = "stale";
      return {
        id: def.id,
        name: def.name,
        file: def.file,
        intervalHours: def.intervalHours,
        required: def.required,
        source: info.source || "Unknown",
        sourceUrl: info.sourceUrl || null,
        status,
        lastDataUpdate: iso(dataDate),
        lastAttempt: iso(attemptDate),
        dueAt: iso(dueAt),
        ageHours: hoursSinceData === null ? null : Math.round(hoursSinceData * 10) / 10,
        hoursSinceAttempt:
          hoursSinceAttempt === null ? null : Math.round(hoursSinceAttempt * 10) / 10,
        latestRun,
        latestSuccess: lastSuccessfulRun,
        latestFailure,
        recentRuns: recentRuns.slice(0, 4),
        dataCount: info.count ?? null,
        dataSummary: info.summary || {},
        attemptStatus: info.attemptStatus || null,
        errors: [...(info.errors || []), ...(Array.isArray(runs) ? [] : [runs.error])].filter(
          Boolean,
        ),
        workflow: def.workflow,
        workflowUrl: "https://github.com/" + repoName(env) + "/actions/workflows/" + def.workflow,
      };
    });
    return json({ checkedAt: now.toISOString(), repository: repoName(env), datasets });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
