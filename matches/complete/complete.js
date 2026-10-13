/* Dedicated Complete Match archive; scorecards open on their own route. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const state = { matches: [], format: "All", query: "" };
  const returnStateKey = "completeMatchesReturnState";
  function saveReturnState() {
    try {
      sessionStorage.setItem(returnStateKey, JSON.stringify({
        query: $("match-search")?.value || "",
        format: $("match-format-filter")?.value || "All",
        scrollY: window.scrollY || 0,
        savedAt: Date.now()
      }));
    } catch (_) {}
  }
  function restoreReturnState() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(returnStateKey) || "null");
      if (!saved || Date.now() - saved.savedAt > 30 * 60 * 1000) return;
      state.query = saved.query || "";
      state.format = saved.format || "All";
      if ($("match-search")) $("match-search").value = state.query;
      if ($("match-format-filter")) $("match-format-filter").value = state.format;
      renderMatches();
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, Number(saved.scrollY) || 0)));
    } catch (_) {}
  }
  const fmtLabel = (value) =>
    ({
      T20I: "T20 International",
      T20: "T20 / IPL",
      ODI: "One Day International",
      "List A": "List A / domestic ODI",
      Test: "Test",
      "First-class": "First-class / multi-day",
    })[value] ||
    value ||
    "Cricket";
  const dateLabel = (value) => {
    if (!value) return "Date unavailable";
    const d = new Date(value + "T12:00:00Z");
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  function renderMatches() {
    const host = $("complete-matches-list");
    if (!host) return;
    const query = state.query.trim().toLowerCase();
    const rows = state.matches.filter(
      (m) =>
        (state.format === "All" || m.format === state.format) &&
        (!query ||
          [m.team, m.opposition, m.venue, m.event, m.date, m.format, m.result]
            .join(" ")
            .toLowerCase()
            .includes(query)),
    );
    if (!rows.length) {
      host.innerHTML =
        '<div class="match-empty"><strong>No matching scorecards</strong><span>Search ya format filter badal kar dekhein.</span></div>';
      return;
    }
    host.innerHTML = rows
      .map(
        (m) =>
          '<article class="complete-match-card" data-match-id="' +
          esc(m.matchId) +
          '"><div class="complete-match-topline"><span>' +
          esc(dateLabel(m.date)) +
          '</span><span class="match-format-pill">' +
          esc(fmtLabel(m.format)) +
          '</span></div><div class="complete-match-teams"><span>' +
          esc(m.team || "Tilak team") +
          "</span><b>VS</b><span>" +
          esc(m.opposition || "Opponent") +
          '</span></div><div class="complete-match-venue">⌖ ' +
          esc(m.venue || "Venue unavailable") +
          '</div><div class="complete-match-result">' +
          esc(m.result || "Result unavailable") +
          '</div><div class="complete-match-bottom"><a class="scorecard-open" href="/matches/scorecards/?match=' +
          encodeURIComponent(m.matchId) +
          '">Full scorecard ↗</a></div></article>',
      )
      .join("");
  }
  async function loadMatches() {
    const host = $("complete-matches-list");
    try {
      const response = await fetch("/matches/scorecards/index.json?v=20261014-complete-folder1", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Scorecard index unavailable");
      const payload = await response.json();
      state.matches = Array.isArray(payload.matches) ? payload.matches : [];
      $("scorecard-count").textContent = (
        payload.matchCount || state.matches.length
      ).toLocaleString("en-IN");
      $("scorecard-updated").textContent = payload.updatedAt
        ? "Updated " + new Date(payload.updatedAt).toLocaleString("en-IN") + " · Cricsheet"
        : "Cricsheet match archive";
      $("scorecard-source-note").textContent =
        payload.coverageNote || "Only verified available scorecards are shown.";
      restoreReturnState();
      renderMatches();
    } catch (error) {
      if (host)
        host.innerHTML =
          '<div class="match-empty"><strong>Match archive could not load</strong><span>Saved verified scorecard index ko refresh karke dobara try karein.</span></div>';
      console.error("Complete Match archive:", error);
    }
  }
  $("match-format-filter")?.addEventListener("change", (event) => {
    state.format = event.target.value;
    renderMatches();
  });
  $("match-search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderMatches();
  });
  loadMatches();
})();
