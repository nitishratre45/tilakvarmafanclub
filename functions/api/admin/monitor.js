import { json, requireAdmin } from "../../_lib/admin.js";

const API = "https://api.github.com";
const headers = (env) => ({
  authorization: "Bearer " + env.GITHUB_TOKEN,
  accept: "application/vnd.github+json",
  "content-type": "application/json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "TilakVarmaFanClub-Admin",
});
const repoName = (env) => env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";

async function github(env, path, options = {}) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing in Cloudflare Pages secrets.");
  let response;
  try {
    response = await fetch(API + "/repos/" + repoName(env) + path, {
      ...options,
      headers: { ...headers(env), ...(options.headers || {}) },
      signal: options.signal || AbortSignal.timeout(12000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError")
      throw new Error("GitHub Actions API timed out after 12 seconds. Try again shortly.");
    throw error;
  }
  if (!response.ok) {
    const detail = await response.text();
    if (
      response.status === 429 ||
      (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      const retryAfter = response.headers.get("retry-after");
      throw new Error(
        "GitHub API rate limit reached." +
          (retryAfter ? " Retry after " + retryAfter + " seconds." : " Wait briefly and retry."),
      );
    }
    if (response.status === 403)
      throw new Error(
        "GitHub denied this action. Check the GITHUB_TOKEN Actions: read/write permission.",
      );
    throw new Error("GitHub API returned " + response.status + ": " + detail.slice(0, 180));
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function onRequest({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  if (request.method === "GET") {
    try {
      const requestUrl = new URL(request.url);
      let runs = [];
      if (requestUrl.searchParams.get("scope") === "bcci") {
        const workflowFiles = [
          "refresh-bcci-live-matches.yml",
          "refresh-bcci-match-results.yml",
          "refresh-bcci-squads.yml",
          "refresh-bcci-stats-fixtures.yml",
          "refresh-bcci-folder-scorecard.yml",
          "refresh-match-scorecards.yml",
          "refresh-bcci-videos.yml",
          "refresh-custom-bcci-fixtures.yml",
          "bcci-squads-refresh.yml",
          "refresh-upcoming-matches.yml",
          "bcci-fixtures-test-health.yml",
          "refresh-bcci-test-recent-match.yml",
          "fetch-bcci-fixtures-json.yml",
          "fetch-bcci-scorecard-json.yml",
          "matches-folder-audit.yml",
        ];
        const batches = await Promise.all(
          workflowFiles.map(async (file) => {
            try {
              const payload = await github(env, "/actions/workflows/" + file + "/runs?per_page=8");
              return (payload.workflow_runs || []).map((run) => ({
                ...run,
                name: run.name || file,
                display_title: run.display_title || file,
              }));
            } catch {
              return [];
            }
          }),
        );
        const unique = new Map();
        batches.flat().forEach((run) => unique.set(run.id, run));
        runs = [...unique.values()]
          .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
          .slice(0, 60);
      } else {
        const payload = await github(env, "/actions/runs?per_page=20");
        runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
      }
      const failed = runs.filter((run) => run.conclusion === "failure").slice(0, 6);
      const failedDetails = await Promise.all(
        failed.map(async (run) => {
          try {
            const jobPayload = await github(env, "/actions/runs/" + run.id + "/jobs?per_page=20");
            const jobs = (jobPayload.jobs || []).map((job) => ({
              name: job.name,
              conclusion: job.conclusion,
              steps: (job.steps || [])
                .filter((step) => step.conclusion === "failure" || step.conclusion === "cancelled")
                .map((step) => ({
                  name: step.name,
                  conclusion: step.conclusion,
                  number: step.number,
                })),
            }));
            return [String(run.id), jobs];
          } catch (error) {
            return [
              String(run.id),
              [
                {
                  name: "Could not load failed steps",
                  conclusion: "error",
                  steps: [{ name: error.message, conclusion: "error" }],
                },
              ],
            ];
          }
        }),
      );
      const details = Object.fromEntries(failedDetails);
      return json({
        checkedAt: new Date().toISOString(),
        repository: repoName(env),
        runs: runs.map((run) => ({
          id: run.id,
          name: run.name || run.display_title || "GitHub Actions",
          title: run.display_title || run.name || "Workflow run",
          status: run.status,
          conclusion: run.conclusion,
          branch: run.head_branch,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          url: run.html_url,
          failedJobs: details[String(run.id)] || [],
        })),
      });
    } catch (error) {
      return json({ error: error.message }, 502);
    }
  }
  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON request." }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Invalid request body." }, 400);
    try {
      if (body.action === "rerun") {
        const id = String(body.runId || "");
        if (!/^\d{1,20}$/.test(id)) return json({ error: "Invalid workflow run ID." }, 400);
        const run = await github(env, "/actions/runs/" + id);
        if (!["failure", "cancelled"].includes(run.conclusion))
          return json({ error: "Only failed or cancelled runs can be re-run." }, 409);
        const rerunPath =
          run.conclusion === "failure"
            ? "/actions/runs/" + id + "/rerun-failed-jobs"
            : "/actions/runs/" + id + "/rerun";
        await github(env, rerunPath, { method: "POST" });
        return json({ ok: true, message: "Workflow re-run queued.", runId: id }, 202);
      }
      if (body.action === "run-all-workflows") {
        const recent = await github(
          env,
          "/actions/workflows/run-all-workflows.yml/runs?per_page=10",
        );
        const active = (recent.workflow_runs || []).find((run) =>
          ["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status),
        );
        if (active) {
          return json(
            {
              error: "A Run All Workflows batch is already active.",
              runUrl: active.html_url,
              runId: active.id,
            },
            409,
          );
        }
        const dispatch = () =>
          github(env, "/actions/workflows/run-all-workflows.yml/dispatches", {
            method: "POST",
            body: JSON.stringify({ ref: "main" }),
          });
        try {
          await dispatch();
        } catch (firstError) {
          // GitHub occasionally returns a transient 5xx for workflow dispatch.
          // Before retrying, check whether the first request actually queued a run.
          const message = String(firstError?.message || "");
          if (!/GitHub API returned 5\\d\\d/.test(message)) throw firstError;
          const verify = await github(
            env,
            "/actions/workflows/run-all-workflows.yml/runs?per_page=10",
          );
          const recentRun = (verify.workflow_runs || []).find((run) => {
            const created = Date.parse(run.created_at || "");
            return (
              Number.isFinite(created) &&
              Date.now() - created < 2 * 60 * 1000 &&
              ["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status)
            );
          });
          if (!recentRun) await dispatch();
        }
        return json(
          {
            ok: true,
            message:
              "Run All Workflows batch queued. It will start 26 manually runnable workflows; the event-driven auto-rerun workflow is excluded.",
          },
          202,
        );
      }
      if (body.action === "diagnostics") {
        await github(env, "/actions/workflows/admin-diagnostics.yml/dispatches", {
          method: "POST",
          body: JSON.stringify({ ref: "main" }),
        });
        return json(
          { ok: true, message: "Python diagnostics queued. Refresh this panel in a moment." },
          202,
        );
      }
      if (body.action === "news-refresh") {
        await github(env, "/actions/workflows/refresh-tilak-news.yml/dispatches", {
          method: "POST",
          body: JSON.stringify({ ref: "main" }),
        });
        return json(
          {
            ok: true,
            message:
              "BCCI-only news refresh queued. BCCI News API pages 1–7 run sequentially; only BCCI article URLs with a Tilak Varma mention are saved.",
          },
          202,
        );
      }
      if (body.action === "bcci-live-refresh-all") {
        const workflows = [
          { file: "refresh-bcci-live-matches.yml", label: "BCCI live grid / scores" },
          { file: "fetch-bcci-fixtures-json.yml", label: "BCCI Fixtures JSON snapshot" },
          { file: "fetch-bcci-scorecard-json.yml", label: "BCCI Fixtures scorecard JSON" },
          { file: "refresh-bcci-folder-scorecard.yml", label: "BCCI folder scorecards" },
          { file: "refresh-match-scorecards.yml", label: "Match Centre scorecards" },
          { file: "refresh-bcci-match-results.yml", label: "BCCI match results" },
          { file: "refresh-bcci-squads.yml", label: "BCCI squads" },
          { file: "bcci-squads-refresh.yml", label: "BCCI fixture squads snapshot" },
          { file: "refresh-custom-bcci-fixtures.yml", label: "Custom BCCI fixtures" },
          { file: "refresh-bcci-stats-fixtures.yml", label: "BCCI stats fixtures" },
          { file: "refresh-bcci-videos.yml", label: "BCCI videos" },
          { file: "refresh-upcoming-matches.yml", label: "Upcoming match details" },
          { file: "bcci-fixtures-test-health.yml", label: "BCCI fixture health checks" },
          {
            file: "refresh-bcci-test-recent-match.yml",
            label: "Cricsheet recent match archive (T20I / ODI / Test)",
          },
          { file: "matches-folder-audit.yml", label: "Matches folder audit" },
        ];
        const results = [];
        for (const item of workflows) {
          try {
            const recent = await github(
              env,
              "/actions/workflows/" + item.file + "/runs?per_page=5",
            );
            const active = (recent.workflow_runs || []).find((run) =>
              ["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status),
            );
            if (active) {
              results.push({
                workflow: item.file,
                label: item.label,
                status: "already_running",
                url: active.html_url,
              });
              continue;
            }
            await github(env, "/actions/workflows/" + item.file + "/dispatches", {
              method: "POST",
              body: JSON.stringify({ ref: "main" }),
            });
            results.push({ workflow: item.file, label: item.label, status: "queued" });
          } catch (error) {
            results.push({
              workflow: item.file,
              label: item.label,
              status: "failed",
              error: error.message,
            });
          }
        }
        const queued = results.filter((item) => item.status === "queued").length;
        const failed = results.filter((item) => item.status === "failed").length;
        return json(
          {
            ok: failed === 0,
            message:
              queued +
              " workflow(s) queued; " +
              results.filter((item) => item.status === "already_running").length +
              " already running; " +
              failed +
              " dispatch error(s).",
            results,
          },
          failed === results.length ? 502 : 202,
        );
      }
      if (body.action === "bcci-fixtures-refresh") {
        const workflow = "fetch-bcci-fixtures-json.yml";
        const recent = await github(env, "/actions/workflows/" + workflow + "/runs?per_page=10");
        const active = (recent.workflow_runs || []).find((run) =>
          ["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status),
        );
        if (active) {
          return json(
            {
              error: "BCCI Fixtures JSON refresh is already queued or running.",
              runUrl: active.html_url,
              runId: active.id,
            },
            409,
          );
        }
        await github(env, "/actions/workflows/" + workflow + "/dispatches", {
          method: "POST",
          body: JSON.stringify({ ref: "main" }),
        });
        return json(
          {
            ok: true,
            message:
              "BCCI Fixtures JSON refresh queued. This refresh updates bcci-fixtures-test/bcci-fixtures.json only; it does not refresh the Matches folder.",
          },
          202,
        );
      }
      if (body.action === "match-scorecards-refresh") {
        const recent = await github(
          env,
          "/actions/workflows/refresh-match-scorecards.yml/runs?per_page=10",
        );
        const active = (recent.workflow_runs || []).find((run) =>
          ["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status),
        );
        if (active) {
          return json(
            {
              error: "A match scorecard refresh is already running.",
              runUrl: active.html_url,
              runId: active.id,
            },
            409,
          );
        }
        await github(env, "/actions/workflows/refresh-match-scorecards.yml/dispatches", {
          method: "POST",
          body: JSON.stringify({ ref: "main" }),
        });
        return json(
          {
            ok: true,
            message:
              "Match scorecard refresh queued. The workflow validates the generated archive and restores the previous verified data if refresh or validation fails.",
          },
          202,
        );
      }
      return json({ error: "Unsupported action." }, 400);
    } catch (error) {
      return json({ error: error.message }, 502);
    }
  }
  return json({ error: "Method not allowed." }, 405, { allow: "GET, POST" });
}
