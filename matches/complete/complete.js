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
            : '<span class="scorecard-unavailable">BCCI result · scorecard archive unavailable</span>') +
          "</div></article>",
      )
      .join("");
  }
  async function loadMatches() {
    const host = $("complete-matches-list");
    try {
      const [archiveResponse, resultsResponse] = await Promise.all([
        fetch("/matches/scorecards/index.json?v=20261015-bcci-recent1", { cache: "no-store" }),
        fetch("/matches/bcci-match-results.json?v=20261015-bcci-recent1", { cache: "no-store" }),
      ]);
      if (!archiveResponse.ok) throw new Error("Scorecard index unavailable");
      const archive = await archiveResponse.json();
      const archiveMatches = Array.isArray(archive.matches) ? archive.matches : [];
      const archiveById = new Map();
      archiveMatches.forEach((m) => {
        const id = String(m.matchId || m.match_id || m.gid || "").trim();
        if (id) archiveById.set(id, m);
      });
      let resultPayload = null;
      if (resultsResponse.ok) resultPayload = await resultsResponse.json().catch(() => null);
      const bcciRows = Array.isArray(resultPayload?.matches) ? resultPayload.matches : [];
      const norm = (v) =>
        String(v || "")
          .trim()
          .toLowerCase();
      const formatFromBcci = (m) => {
        const classes = Array.isArray(m.class) ? m.class.map((x) => norm(x.name)).join(" ") : "";
        const title = norm(m.title || m.name || "");
        if (/test|first.class|multi.day/.test(classes + " " + title))
          return /test/.test(classes + " " + title) ? "Test" : "First-class";
        if (/one.day|list a|odi/.test(classes + " " + title))
          return /international|odi/.test(classes + " " + title) ? "ODI" : "List A";
        if (/t20 international|t20i/.test(classes + " " + title)) return "T20I";
        if (/twenty20|t20|ipl/.test(classes + " " + title)) return "T20";
        return "";
      };
      const bcciMatches = bcciRows
        .map((m) => {
          const id = String(m.gid || m.match_id || "").trim();
          const archived = archiveById.get(id);
          const home = String(m.team1_name || m.team1_short_name || "").trim();
          const away = String(m.team2_name || m.team2_short_name || "").trim();
          const format = formatFromBcci(m);
          const date = String(m.start_date || m.end_date || "").slice(0, 10);
          const result = String(m.result_string || m.result || m.status || "").trim();
          const completed =
            /complete|result|won by|tied|drawn|abandon/i.test(result) ||
            (m.result_id && String(m.result_id) !== "0") ||
            (m.match_status && /complete|result|finished/i.test(String(m.match_status)));
          if (!id || !home || !away || !date || !format || !completed) return null;
          return {
            ...(archived || {}),
            matchId: archived?.matchId || id,
            date: archived?.date || date,
            team: archived?.team || home,
            opposition: archived?.opposition || away,
            venue: archived?.venue || m.ground_name || m.ground_city || "Venue unavailable",
            event: archived?.event || m.comp_name || m.alt_comp_name || "",
            format: archived?.format || format,
            result: archived?.result || result || "Result available from BCCI",
            bcciResult: true,
            hasScorecard: Boolean(archived),
          };
        })
        .filter(Boolean);
      const merged = new Map();
      [...archiveMatches, ...bcciMatches].forEach((m) => {
        const id = String(m.matchId || m.match_id || m.gid || "").trim();
        if (!id) return;
        const previous = merged.get(id);
        merged.set(
          id,
          previous
            ? { ...m, ...previous, hasScorecard: Boolean(previous.hasScorecard || m.hasScorecard) }
            : {
                ...m,
                hasScorecard: Boolean(m.hasScorecard || archiveById.has(id)),
              },
        );
      });
      state.matches = [...merged.values()].sort((a, b) =>
        String(b.date || "").localeCompare(String(a.date || "")),
      );
      $("scorecard-count").textContent = state.matches.length.toLocaleString("en-IN");
      const updatedAt = resultPayload?.checkedAt || archive.updatedAt;
      $("scorecard-updated").textContent = updatedAt
        ? "Updated " +
          new Date(updatedAt).toLocaleString("en-IN") +
          (bcciMatches.length ? " · BCCI results + verified scorecards" : " · verified scorecards")
        : "BCCI results + verified scorecard archive";
      $("scorecard-source-note").textContent = bcciMatches.length
        ? "Recent completed results are merged from BCCI India (team_id=6) and West Indies (team_id=4) feeds. Full scorecards open where a verified archive is available."
        : archive.coverageNote || "Only verified available scorecards are shown.";
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
