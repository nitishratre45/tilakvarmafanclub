(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const WORKFLOW_HINTS = ["BCCI", "bcci", "match", "Matches folder audit", "fixture"];
  const SNAPSHOTS = [
    { label: "Live matches JSON", path: "/bcci-fixtures-test/live-matches.json", type: "matches" },
    {
      label: "BCCI fixtures JSON",
      path: "/bcci-fixtures-test/bcci-fixtures.json",
      type: "fixtures",
    },
    {
      label: "BCCI scorecard JSON",
      path: "/bcci-fixtures-test/bcci-scorecard.json",
      type: "scorecard",
    },
    { label: "BCCI match results", path: "/matches/results/match-results.json", type: "generic" },
    { label: "Matches live JSON", path: "/matches/live/live-matches.json", type: "matches" },
  ];
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const dateLabel = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };
  const statusLabel = (run) => {
    if (run.status && run.status !== "completed") return "running";
    return run.conclusion || run.status || "unknown";
  };
  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    let data = {};
    try {
      data = await response.json();
    } catch {}
    if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ")");
    return data;
  }
  function message(text, error = false) {
    const el = $("bcci-live-message");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("error", error);
  }
  function relevant(run) {
    const name = String(run.name || "") + " " + String(run.title || "");
    return WORKFLOW_HINTS.some((term) => name.toLowerCase().includes(term.toLowerCase()));
  }
  function renderRuns(data) {
    const runs = (data.runs || []).filter(relevant);
    const success = runs.filter((r) => r.conclusion === "success").length;
    const failed = runs.filter(
      (r) =>
        r.conclusion === "failure" ||
        r.conclusion === "timed_out" ||
        r.conclusion === "action_required",
    ).length;
    const running = runs.filter((r) => r.status && r.status !== "completed").length;
    $("bcci-live-success").textContent = String(success);
    $("bcci-live-failed").textContent = String(failed);
    $("bcci-live-running").textContent = String(running);
    $("bcci-live-checked-at").textContent = "Checked " + dateLabel(data.checkedAt);
    const host = $("bcci-live-runs");
    if (!runs.length) {
      host.innerHTML =
        '<div class="empty">No matching BCCI / match workflow runs in the latest 20 repository runs.</div>';
      return;
    }
    host.innerHTML = runs
      .map((run) => {
        const state = statusLabel(run);
        const kind =
          state === "success"
            ? "success"
            : state === "failure" || state === "timed_out"
              ? "error"
              : state === "running" || state === "queued"
                ? "warning"
                : "";
        const steps = (run.failedJobs || []).flatMap((job) =>
          (job.steps || []).map((step) => job.name + ": " + step.name),
        );
        return (
          '<article class="run-item bcci-run-item"><div class="run-main"><strong>' +
          esc(run.title || run.name) +
          "</strong><span>" +
          esc(dateLabel(run.updatedAt || run.createdAt)) +
          " · " +
          esc(run.branch || "main") +
          "</span>" +
          (steps.length
            ? '<small class="bcci-run-error">' + esc(steps.join(" · ")) + "</small>"
            : "") +
          '</div><div class="run-actions"><span class="pill ' +
          kind +
          '">' +
          esc(state.toUpperCase()) +
          '</span><a class="btn small" href="' +
          esc(run.url) +
          '" target="_blank" rel="noopener noreferrer">Details ↗</a></div></article>'
        );
      })
      .join("");
  }
  async function checkSnapshots() {
    const host = $("bcci-live-snapshots");
    const results = await Promise.all(
      SNAPSHOTS.map(async (item) => {
        try {
          const response = await fetch(
            item.path + (item.path.includes("?") ? "&" : "?") + "t=" + Date.now(),
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error("HTTP " + response.status);
          const data = await response.json();
          let count = null;
          if (item.type === "matches")
            count = Array.isArray(data.live_matches)
              ? data.live_matches.length
              : Array.isArray(data.matches)
                ? data.matches.length
                : Array.isArray(data.live_scores)
                  ? data.live_scores.length
                  : null;
          if (item.type === "fixtures") {
            const d = data.data || data;
            const list = d.match || d.matches || d.fixtures;
            count = Array.isArray(list) ? list.length : null;
          }
          if (item.type === "scorecard") count = data.match ? 1 : data.gid ? 1 : null;
          return {
            ...item,
            ok: true,
            count,
            savedAt:
              data.updated_at ||
              data.generated_at ||
              data.last_updated ||
              data.refreshed_at ||
              data.updatedAt ||
              null,
            message: "JSON valid",
          };
        } catch (error) {
          return { ...item, ok: false, message: error.message };
        }
      }),
    );
    $("bcci-live-saved-count").textContent =
      results.filter((x) => x.ok).length + "/" + results.length;
    host.innerHTML = results
      .map(
        (item) =>
          '<article class="run-item bcci-snapshot-item"><div class="run-main"><strong>' +
          esc(item.label) +
          "</strong><span>" +
          esc(item.path) +
          "</span><small>" +
          esc(item.message) +
          (item.count === null ? "" : " · " + item.count + " record(s)") +
          (item.savedAt ? " · saved " + dateLabel(item.savedAt) : "") +
          '</small></div><span class="pill ' +
          (item.ok ? "success" : "error") +
          '">' +
          (item.ok ? "READABLE" : "MISSING / INVALID") +
          "</span></article>",
      )
      .join("");
  }
  async function refreshStatus() {
    message("Checking GitHub Actions and saved JSON…");
    try {
      const data = await api("/api/admin/monitor");
      renderRuns(data);
      await checkSnapshots();
      message(
        "Status refreshed. Workflow result and saved JSON availability are shown separately.",
      );
    } catch (error) {
      message(error.message, true);
      await checkSnapshots().catch(() => {});
    }
  }
  async function refreshAll() {
    const button = $("bcci-live-refresh-all");
    if (
      !window.confirm(
        "Queue all configured BCCI fixture, live-score, result, squad, scorecard and audit workflows? Already-running workflows will be skipped.",
      )
    )
      return;
    button.disabled = true;
    message("Dispatching BCCI workflows…");
    try {
      const result = await api("/api/admin/monitor", {
        method: "POST",
        body: JSON.stringify({ action: "bcci-live-refresh-all" }),
      });
      const lines = (result.results || []).map(
        (item) => item.label + ": " + item.status + (item.error ? " — " + item.error : ""),
      );
      message(
        (result.message || "BCCI workflow refresh requested.") +
          (lines.length ? " " + lines.join(" | ") : ""),
        !result.ok,
      );
      await refreshStatus();
    } catch (error) {
      message("Refresh request failed: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  }
  const checkButton = $("bcci-live-check");
  const refreshButton = $("bcci-live-refresh-all");
  if (checkButton) checkButton.addEventListener("click", refreshStatus);
  if (refreshButton) refreshButton.addEventListener("click", refreshAll);
  document
    .querySelectorAll('[data-view="bcci-live-monitor"]')
    .forEach((link) => link.addEventListener("click", () => refreshStatus()));
  if (document.getElementById("bcci-live-monitor")) {
    refreshStatus();
    window.setInterval(() => {
      const section = $("bcci-live-monitor");
      if (section && !section.hidden) refreshStatus();
    }, 60000);
  }
})();
