/* Admin Match section: upcoming-fixture workflow status and manual corrections. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { fixtures: [], manual: [], sha: "", report: null, runs: [] };
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const key = (f) =>
    [f.date, f.match, f.opponent]
      .map((x) =>
        String(x || "")
          .trim()
          .toLowerCase(),
      )
      .join("|");
  const sourceKey = (f) =>
    String(f.date || "") +
    "|" +
    String(f.match || "")
      .trim()
      .toLowerCase();
  const dateLabel = (d) => {
    const x = new Date(String(d || "") + "T12:00:00Z");
    return Number.isNaN(x.getTime())
      ? d
      : x.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  const status = (message, error = false) => {
    const el = $("admin-matches-status");
    if (el) {
      el.textContent = message;
      el.classList.toggle("error", error);
    }
  };
  const formStatus = (message, error = false) => {
    const el = $("admin-fixture-status");
    if (el) {
      el.textContent = message;
      el.classList.toggle("error", error);
    }
  };
  async function api(url, options = {}) {
    const r = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    let d = {};
    try {
      d = await r.json();
    } catch {}
    if (!r.ok) throw new Error(d.error || "Request failed (" + r.status + ")");
    return d;
  }
  function mergedFixtures() {
    const map = new Map(state.manual.map((f) => [f.overrideKey || key(f), f]));
    const rows = state.fixtures.map((f) => ({
      ...f,
      ...(map.get(sourceKey(f)) || map.get(key(f)) || {}),
    }));
    const keys = new Set(state.fixtures.map(key));
    state.manual.forEach((f) => {
      if (f.overrideKey) return;
      if (!keys.has(key(f))) rows.push(f);
    });
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  function renderFixtures() {
    const host = $("admin-matches-list");
    if (!host) return;
    const rows = mergedFixtures();
    $("admin-match-count").textContent = String(rows.length);
    $("admin-fixture-count").textContent =
      rows.length + " fixtures · " + state.manual.length + " manual corrections";
    if (!rows.length) {
      host.innerHTML = '<div class="empty">No fixtures found. Add one using the form above.</div>';
      return;
    }
    host.innerHTML = rows
      .map((f) => {
        const manual = state.manual.some(
          (m) => key(m) === key(f) || m.overrideKey === sourceKey(f),
        );
        return (
          '<article class="admin-match-card"><div class="admin-match-card-head"><span class="admin-match-date">' +
          esc(dateLabel(f.date)) +
          '</span><span class="admin-match-format">' +
          (manual ? "MANUAL / CORRECTED" : "NEWS JSON") +
          '</span></div><div class="admin-match-teams"><strong>India</strong><span>VS</span><strong>' +
          esc(f.opponent) +
          '</strong></div><p class="admin-match-venue">' +
          esc(f.match) +
          " · " +
          esc(f.venue) +
          " · " +
          esc(f.time) +
          ' IST</p><div class="actions"><button type="button" class="btn small" data-edit="' +
          esc(key(f)) +
          '">Edit / correct</button>' +
          (manual
            ? '<button type="button" class="btn small" data-remove="' +
              esc(key(f)) +
              '">Remove manual correction</button>'
            : "") +
          "</div></article>"
        );
      })
      .join("");
    host
      .querySelectorAll("[data-edit]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          editFixture(mergedFixtures().find((f) => key(f) === b.dataset.edit)),
        ),
      );
    host.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.remove;
        state.manual = state.manual.filter((f) => key(f) !== id);
        try {
          await saveManual();
          renderFixtures();
          formStatus("Manual correction removed. The News JSON fixture is shown again if present.");
        } catch (e) {
          formStatus(e.message, true);
          await loadManual();
        }
      }),
    );
  }
  function editFixture(f) {
    if (!f) return;
    $("admin-fixture-original-date").value = f.date || "";
    $("admin-fixture-original-match").value = f.match || "";
    $("admin-fixture-date").value = f.date || "";
    $("admin-fixture-match").value = f.match || "";
    $("admin-fixture-opponent").value = f.opponent || "";
    $("admin-fixture-venue").value = f.venue || "";
    $("admin-fixture-time").value = f.time || "19:00";
    $("admin-fixture-news-url").value = f.newsUrl || "";
    $("admin-fixture-form-title").textContent = "Correct upcoming match";
    $("admin-fixture-save").textContent = "Save correction";
    $("admin-fixture-form").scrollIntoView({ behavior: "smooth", block: "start" });
    formStatus("Editing " + f.match + " · " + dateLabel(f.date));
  }
  function clearForm() {
    $("admin-fixture-form").reset();
    $("admin-fixture-time").value = "19:00";
    $("admin-fixture-original-date").value = "";
    $("admin-fixture-original-match").value = "";
    $("admin-fixture-form-title").textContent = "Add upcoming match";
    $("admin-fixture-save").textContent = "Save upcoming match";
  }
  async function loadManual() {
    const d = await api("/api/admin/upcoming-matches");
    state.manual = Array.isArray(d.fixtures) ? d.fixtures : [];
    state.sha = d.sha || "";
  }
  async function saveManual() {
    const d = await api("/api/admin/upcoming-matches", {
      method: "POST",
      body: JSON.stringify({ fixtures: state.manual, expectedSha: state.sha }),
    });
    state.sha = d.commit?.content?.sha || state.sha;
    await loadManual();
  }
  function renderRuns() {
    const host = $("admin-match-workflows");
    if (!host) return;
    const names = [
      "Refresh BCCI Fixtures JSON - BCCI Folder Only",
      "Refresh BCCI Fixtures Scorecard JSON",
      "BCCI Match Squads Refresh",
    ];
    const rows = state.runs
      .filter((r) => names.some((n) => (r.name || "").includes(n) || (r.title || "").includes(n)))
      .slice(0, 8);
    host.innerHTML =
      '<div class="admin-match-results-line"><strong>Match workflow runs</strong><a href="https://github.com/nitishratre45/tilakvarmafanclub/actions" target="_blank" rel="noopener">All Runs ↗</a></div>' +
      (rows.length
        ? rows
            .map(
              (r) =>
                '<article class="admin-match-card"><div class="admin-match-card-head"><strong>' +
                esc(r.name || r.title) +
                '</strong><span class="admin-match-format">' +
                esc(r.conclusion || r.status || "unknown").toUpperCase() +
                '</span></div><p class="admin-match-venue">Updated ' +
                esc(r.updatedAt ? new Date(r.updatedAt).toLocaleString("en-IN") : "—") +
                '</p><a class="btn small" href="' +
                esc(r.url) +
                '" target="_blank" rel="noopener">View run ↗</a></article>',
            )
            .join("")
        : '<div class="empty">No matching workflow runs found in the latest 20 runs.</div>');
  }
  async function load() {
    const button = $("admin-matches-refresh");
    if (button) {
      button.disabled = true;
      button.textContent = "Checking…";
    }
    try {
      const [report, manual] = await Promise.all([
        fetch("/matches/upcoming-fixtures-refresh.json?v=admin-status2", {
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),
        loadManual(),
      ]);
      state.report = report;
      state.fixtures = Array.isArray(report?.fixtures) ? report.fixtures : [];
      $("admin-match-updated").textContent = report?.checkedAt
        ? new Date(report.checkedAt).toLocaleString("en-IN")
        : "Not available";
      $("admin-match-source").textContent = report?.status || "No report";
      status(
        "Source: " +
          (report?.source || "News JSON") +
          " · " +
          state.fixtures.length +
          " News JSON fixtures · " +
          state.manual.length +
          " manual corrections.",
      );
      try {
        const data = await api("/api/admin/monitor?scope=bcci-fixtures");
        state.runs = Array.isArray(data.runs) ? data.runs : [];
      } catch (e) {
        state.runs = [];
      }
      renderRuns();
      renderFixtures();
    } catch (e) {
      status(e.message || "Could not load match workflow status.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "↻ Refresh status";
      }
    }
  }
  $("admin-fixture-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fixture = {
      date: $("admin-fixture-date").value,
      label: dateLabel($("admin-fixture-date").value),
      match: $("admin-fixture-match").value.trim(),
      opponent: $("admin-fixture-opponent").value.trim(),
      venue: $("admin-fixture-venue").value.trim(),
      time: $("admin-fixture-time").value,
      newsUrl: $("admin-fixture-news-url").value.trim(),
      source: "admin-manual",
    };
    const originalDate = $("admin-fixture-original-date").value;
    const originalMatch = $("admin-fixture-original-match").value;
    if (originalDate && originalMatch) {
      const originalKey = originalDate + "|" + originalMatch.trim().toLowerCase();
      state.manual = state.manual.filter(
        (f) => (f.overrideKey || key(f)) !== originalKey && key(f) !== key(fixture),
      );
      fixture.overrideKey = originalKey;
    }
    const dup = state.manual.some((f) => key(f) === key(fixture));
    if (dup) state.manual = state.manual.filter((f) => key(f) !== key(fixture));
    state.manual.push(fixture);
    const save = $("admin-fixture-save");
    if (save) {
      save.disabled = true;
      save.textContent = "Saving…";
    }
    try {
      await saveManual();
      renderFixtures();
      clearForm();
      formStatus(
        "Upcoming match saved. The public Matches page will use this manual data alongside News JSON.",
      );
    } catch (e) {
      formStatus(e.message || "Could not save fixture.", true);
      await loadManual();
    } finally {
      if (save) {
        save.disabled = false;
        save.textContent = "Save upcoming match";
      }
    }
  });
  $("admin-fixture-cancel")?.addEventListener("click", () => {
    clearForm();
    formStatus("");
  });
  $("admin-matches-refresh")?.addEventListener("click", load);
  document.querySelectorAll("[data-match-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      const action = button.dataset.matchAction;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Queueing…";
      status("Requesting " + originalText.replace(/^↻ |^✓ /, "").toLowerCase() + "…");
      try {
        const d = await api("/api/admin/monitor", {
          method: "POST",
          body: JSON.stringify({ action }),
        });
        status(d.message || "Match workflow queued. Refresh status to see the run.");
        await load();
      } catch (e) {
        status(e.message || "Could not queue match workflow.", true);
        if (e.runUrl) {
          const host = $("admin-match-workflows");
          if (host) {
            const link = document.createElement("a");
            link.href = e.runUrl;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = "Open active workflow run ↗";
            host.prepend(link);
          }
        }
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
  $("admin-matches-refresh-all-bcci")?.addEventListener("click", async () => {
    const button = $("admin-matches-refresh-all-bcci");
    if (
      !window.confirm(
        "Queue all BCCI fixture-related refresh workflows? Matches-folder audit and repair workflows are excluded.",
      )
    )
      return;
    button.disabled = true;
    button.textContent = "⏳ Queueing BCCI workflows…";
    try {
      const data = await api("/api/admin/monitor", {
        method: "POST",
        body: JSON.stringify({ action: "bcci-fixtures-refresh-all" }),
      });
      status(data.message || "BCCI fixture workflows queued.");
      await load();
    } catch (error) {
      status(error.message || "Could not queue BCCI fixture workflows.", true);
    } finally {
      button.disabled = false;
      button.textContent = "↻ Refresh All BCCI Fixture Workflows";
    }
  });
  $("admin-matches-source-refresh")?.addEventListener("click", async () => {
    const b = $("admin-matches-source-refresh");
    if (!b || b.disabled) return;
    b.disabled = true;
    b.textContent = "Queueing…";
    try {
      const d = await api("/api/admin/monitor", {
        method: "POST",
        body: JSON.stringify({ action: "bcci-fixtures-refresh" }),
      });
      status(d.message || "BCCI Fixtures JSON refresh queued.");
    } catch (e) {
      status(e.message || "Could not queue refresh.", true);
    } finally {
      b.disabled = false;
      b.textContent = "⟳ Refresh BCCI Fixtures JSON";
    }
  });
  load();
})();
