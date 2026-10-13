/* Admin Match section: read-only view of the verified scorecard archive. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { matches: [], query: "", format: "All", updatedAt: "", source: "" };
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const dateLabel = (value) => {
    if (!value) return "Date unavailable";
    const date = new Date(value + "T12:00:00Z");
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  const formatLabel = (value) =>
    ({
      T20I: "T20 International",
      T20: "T20 / IPL",
      ODI: "One Day International",
      Test: "Test",
      "List A": "List A",
      "First-class": "First-class",
    })[value] ||
    value ||
    "Cricket";
  function render() {
    const host = $("admin-matches-list");
    if (!host) return;
    const q = state.query.trim().toLowerCase();
    const rows = state.matches.filter(
      (m) =>
        (state.format === "All" || m.format === state.format) &&
        (!q ||
          [m.date, m.format, m.team, m.opposition, m.venue, m.event, m.result, m.matchId]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    $("admin-match-results-count").textContent =
      rows.length.toLocaleString("en-IN") +
      " of " +
      state.matches.length.toLocaleString("en-IN") +
      " matches";
    if (!rows.length) {
      host.innerHTML =
        '<div class="empty"><strong>No matching matches</strong><p>Try another search or format.</p></div>';
      return;
    }
    host.innerHTML = rows
      .map(
        (m) =>
          '<article class="admin-match-card">' +
          '<div class="admin-match-card-head"><span class="admin-match-date">' +
          esc(dateLabel(m.date)) +
          '</span><span class="admin-match-format">' +
          esc(formatLabel(m.format)) +
          "</span></div>" +
          '<div class="admin-match-teams"><strong>' +
          esc(m.team || "Team unavailable") +
          "</strong><span>VS</span><strong>" +
          esc(m.opposition || "Opponent unavailable") +
          "</strong></div>" +
          '<p class="admin-match-venue">⌖ ' +
          esc(m.venue || "Venue unavailable") +
          "</p>" +
          (m.event ? '<p class="admin-match-event">' + esc(m.event) + "</p>" : "") +
          '<div class="admin-match-result">' +
          esc(m.result || "Result unavailable") +
          "</div>" +
          '<div class="admin-match-card-foot"><span>Match ID: ' +
          esc(m.matchId || "—") +
          '</span><a class="btn small primary" href="/matches/scorecards/?match=' +
          encodeURIComponent(m.matchId || "") +
          '" target="_blank" rel="noopener noreferrer">Full scorecard ↗</a></div></article>',
      )
      .join("");
  }
  async function load() {
    const host = $("admin-matches-list");
    const button = $("admin-matches-refresh");
    if (button) {
      button.disabled = true;
      button.textContent = "Loading…";
    }
    if (host && !state.matches.length)
      host.innerHTML = '<div class="empty">Loading verified match archive…</div>';
    try {
      const response = await fetch("/matches/scorecards/index.json?v=20261014-admin-matches1", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Match archive returned HTTP " + response.status);
      const payload = await response.json();
      state.matches = Array.isArray(payload.matches) ? payload.matches : [];
      state.updatedAt = payload.updatedAt || "";
      state.source = payload.source || "Verified scorecard index";
      $("admin-match-count").textContent = Number(
        payload.matchCount ?? state.matches.length,
      ).toLocaleString("en-IN");
      $("admin-format-count").textContent = new Set(
        state.matches.map((m) => m.format).filter(Boolean),
      ).size;
      $("admin-match-updated").textContent = state.updatedAt
        ? new Date(state.updatedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })
        : "Not provided";
      $("admin-match-source").textContent = state.source;
      const status = $("admin-matches-status");
      if (status)
        status.textContent = payload.coverageNote || "Showing the verified match archive.";
      render();
    } catch (error) {
      if (host)
        host.innerHTML =
          '<div class="empty"><strong>Could not load match archive</strong><p>' +
          esc(error.message || "Please retry.") +
          "</p></div>";
      const status = $("admin-matches-status");
      if (status) {
        status.textContent = "Match archive could not be loaded.";
        status.classList.add("error");
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "↻ Refresh matches";
      }
    }
  }
  $("admin-match-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  $("admin-match-format")?.addEventListener("change", (event) => {
    state.format = event.target.value;
    render();
  });
  $("admin-matches-refresh")?.addEventListener("click", load);
  load();
})();
