/* Dedicated Complete Match archive; scorecards open on their own route. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  // Team crests: IPL badge assets where available; country flags for international teams.
  const teamLogoData = {
    india: { code: "in" },
    "west indies": { code: "wi" },
    pakistan: { code: "pk" },
    "sri lanka": { code: "lk" },
    bangladesh: { code: "bd" },
    afghanistan: { code: "af" },
    australia: { code: "au" },
    england: { code: "gb-eng" },
    ireland: { code: "ie" },
    "new zealand": { code: "nz" },
    "south africa": { code: "za" },
    zimbabwe: { code: "zw" },
    nepal: { code: "np" },
    namibia: { code: "na" },
    netherlands: { code: "nl" },
    scotland: { code: "gb-sct" },
    "united arab emirates": { code: "ae" },
    oman: { code: "om" },
    canada: { code: "ca" },
    usa: { code: "us" },
    "united states": { code: "us" },
    japan: { code: "jp" },
    italy: { code: "it" },
    "mumbai indians": { ipl: "MI" },
    "chennai super kings": { ipl: "CSK" },
    "kolkata knight riders": { ipl: "KKR" },
    "royal challengers bengaluru": { ipl: "RCB" },
    "royal challengers bangalore": { ipl: "RCB" },
    "rajasthan royals": { ipl: "RR" },
    "sunrisers hyderabad": { ipl: "SRH" },
    "delhi capitals": { ipl: "DC" },
    "punjab kings": { ipl: "PBKS" },
    "gujarat titans": { ipl: "GT" },
    "lucknow super giants": { ipl: "LSG" },
  };
  const normaliseTeam = (name) =>
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const teamInitials = (name) => {
    const words = String(name || "?")
      .replace(/[^a-z0-9 ]/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (
      words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [(words[0] || "?").slice(0, 2)]
    )
      .join("")
      .toUpperCase();
  };
  function teamLogo(name) {
    const data = teamLogoData[normaliseTeam(name)] || {};
    const src = data.ipl
      ? "https://scores.iplt20.com/ipl/teamlogos/" + data.ipl + ".png"
      : data.code
        ? "https://flagcdn.com/w80/" + data.code + ".png"
        : "";
    const initials =
      '<span class="complete-team-crest-fallback" aria-hidden="true">' +
      esc(teamInitials(name)) +
      "</span>";
    if (!src) return '<span class="complete-team-crest">' + initials + "</span>";
    return (
      '<span class="complete-team-crest"><img src="' +
      esc(src) +
      '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'is-missing\');" />' +
      initials +
      "</span>"
    );
  }
  const state = { matches: [], format: "All", query: "" };
  const returnStateKey = "completeMatchesReturnState";
  const pendingReturnKey = "completeMatchesPendingScorecardReturn";
  function saveReturnState() {
    try {
      sessionStorage.setItem(
        returnStateKey,
        JSON.stringify({
          query: $("match-search")?.value || "",
          format: $("match-format-filter")?.value || "All",
          scrollY: window.scrollY || 0,
          savedAt: Date.now(),
        }),
      );
    } catch (_) {}
  }
  function restoreReturnState() {
    try {
      if (sessionStorage.getItem(pendingReturnKey) !== "1") return;
      sessionStorage.removeItem(pendingReturnKey);
      const saved = JSON.parse(sessionStorage.getItem(returnStateKey) || "null");
      if (!saved || Date.now() - saved.savedAt > 30 * 60 * 1000) return;
      state.query = saved.query || "";
      state.format = saved.format || "All";
      if ($("match-search")) $("match-search").value = state.query;
      if ($("match-format-filter")) $("match-format-filter").value = state.format;
      renderMatches();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo(0, Number(saved.scrollY) || 0)),
      );
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
          '</span></div><div class="complete-match-teams"><div class="complete-team-side">' +
          teamLogo(m.team || "Tilak team") +
          "<span>" +
          esc(m.team || "Tilak team") +
          '</span></div><b class="complete-versus">VS</b><div class="complete-team-side">' +
          teamLogo(m.opposition || "Opponent") +
          "<span>" +
          esc(m.opposition || "Opponent") +
          '</span></div></div><div class="complete-match-venue">⌖ ' +
          esc(m.venue || "Venue unavailable") +
          '</div><div class="complete-match-result">' +
          esc(m.result || "Result unavailable") +
          '</div><div class="complete-match-bottom">' +
          '<a class="scorecard-open" href="/matches/details/?matchId=' +
          encodeURIComponent(m.matchId) +
          '">Full details ↗</a>' +
          (m.hasScorecard !== false
            ? '<a class="scorecard-open" href="/matches/scorecards/?match=' +
              encodeURIComponent(m.matchId) +
              '">Full scorecard ↗</a>'
            : '<span class="scorecard-unavailable">Cricsheet scorecard unavailable</span>') +
          "</div></article>",
      )
      .join("");
  }
  async function loadMatches() {
    const host = $("complete-matches-list");
    try {
      // Complete Match archive is Cricsheet-only. Never merge BCCI fixtures/results.
      const response = await fetch("/matches/scorecards/index.json?v=20261015-cricsheet-only1", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Cricsheet scorecard index unavailable");
      const archive = await response.json();
      const archiveMatches = Array.isArray(archive.matches) ? archive.matches : [];
      const unique = new Map();
      archiveMatches.forEach((match) => {
        const id = String(match.matchId || match.match_id || match.gid || "").trim();
        if (!id) return;
        unique.set(id, {
          ...match,
          matchId: id,
          hasScorecard: true,
        });
      });
      state.matches = [...unique.values()].sort((a, b) =>
        String(b.date || "").localeCompare(String(a.date || "")),
      );
      const count = $("scorecard-count");
      if (count) count.textContent = state.matches.length.toLocaleString("en-IN");
      const updatedAt = archive.updatedAt;
      const updated = $("scorecard-updated");
      if (updated) {
        updated.textContent = updatedAt
          ? "Updated " + new Date(updatedAt).toLocaleString("en-IN") + " · Cricsheet archive"
          : "Cricsheet archive";
      }
      const note = $("scorecard-source-note");
      if (note) {
        note.textContent =
          archive.coverageNote ||
          "Only matches and scorecards available in the Cricsheet archive are shown.";
      }
      restoreReturnState();
      renderMatches();
    } catch (error) {
      if (host) {
        host.innerHTML =
          '<div class="match-empty"><strong>Cricsheet match archive could not load</strong><span>Saved Cricsheet scorecard index ko refresh karke dobara try karein.</span></div>';
      }
      console.error("Complete Match Cricsheet archive:", error);
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
  // Save the exact archive position before navigating to a scorecard.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a.scorecard-open");
    if (!link) return;
    saveReturnState();
    try {
      sessionStorage.setItem(pendingReturnKey, "1");
    } catch (_) {}
  });
  // Browser Back can restore this document from BFCache; restore after the page becomes visible.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try {
      if (sessionStorage.getItem(pendingReturnKey) !== "1") return;
      sessionStorage.removeItem(pendingReturnKey);
      const saved = JSON.parse(sessionStorage.getItem(returnStateKey) || "null");
      if (!saved || Date.now() - saved.savedAt > 30 * 60 * 1000) return;
      state.query = saved.query || "";
      state.format = saved.format || "All";
      if ($("match-search")) $("match-search").value = state.query;
      if ($("match-format-filter")) $("match-format-filter").value = state.format;
      requestAnimationFrame(() =>
        window.scrollTo({ top: Number(saved.scrollY) || 0, behavior: "instant" }),
      );
    } catch (_) {}
  });
  loadMatches();
})();
