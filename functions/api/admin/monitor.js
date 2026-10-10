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
  const response = await fetch(API + "/repos/" + repoName(env) + path, {
    ...options,
    headers: { ...headers(env), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
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
      const payload = await github(env, "/actions/runs?per_page=20");
      const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
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
      return json({ error: "Unsupported action." }, 400);
    } catch (error) {
      return json({ error: error.message }, 502);
    }
  }
  return json({ error: "Method not allowed." }, 405, { allow: "GET, POST" });
}
