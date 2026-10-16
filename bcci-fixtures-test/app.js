(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { fixtures: [] };

  const pick = (obj, keys, fallback = "") => {
    for (const key of keys) {
      const value = obj?.[key];
      if (value === undefined || value === null || value === "") continue;
      if (typeof value === "object") {
        const name = value.name || value.team_name || value.title || value.short_name;
        if (name) return String(name);
      } else {
        return String(value);
      }
    }
    return fallback;
  };

  function normalise(payload) {
    // The saved Python wrapper contains the original BCCI response under payload.data.
    const bcci = payload?.data ?? payload;
    const matches = Array.isArray(bcci?.match)
      ? bcci.match
      : Array.isArray(bcci?.live_scores)
        ? bcci.live_scores
        : Array.isArray(bcci?.data?.match)
          ? bcci.data.match
          : Array.isArray(bcci?.fixtures)
            ? bcci.fixtures
            : Array.isArray(bcci?.matches)
              ? bcci.matches
              : [];
    // BCCI uses canonical values such as "forthcoming", "live", and "complete".
    // Exclude active/terminal games, but do not mistake the scheduled placeholder
    // "Teams will be announced at the toss" for a completed result.
    const upcoming = matches.filter((m) => {
      const status = [m.match_status, m.match_status_str, m.match_status_name, m.live_status_name, m.status]
        .filter(Boolean).join(" ").toLowerCase().replace(/[_-]+/g, " ");
      const result = String(m.result_string || m.result || "").trim().toLowerCase();
      const placeholder = !result || /^(teams will be announced(?: at the toss)?|match yet to begin|to be announced|toss yet to take place|scheduled|to be played)$/.test(result);
      const live = /(^|\\b)(live|in progress|in play|innings break|stumps|lunch|tea break|drinks|rain delay|match delayed)(\\b|$)/.test(status);
      const terminal = /(^|\\b)(complete|completed|finished|result|abandoned|no result|cancelled|canceled|won by|win by|drawn|tied|end of match)(\\b|$)/.test(status);
      const resultIsFinal = !placeholder && /\\b(win by|won by|drawn|tied|no result|abandoned|match forfeited)\\b/.test(result);
      return !live && !terminal && !resultIsFinal;
    });
    return upcoming.slice(0, 12).map((m, i) => ({
      home: pick(m, ["team1_name", "team1_short_name", "home_team_name"], "Team A"),
      away: pick(m, ["team2_name", "team2_short_name", "away_team_name"], "Team B"),
      date: pick(m, ["start_date", "date_string", "start_datetime_utc", "end_date"]),
      time: pick(m, ["start_time_local", "start_datetime_utc"]),
      venue: pick(m, ["ground_name", "ground_city", "ground_short_name"]),
      competition: pick(m, ["comp_name", "primary_event_name", "alt_comp_name"], "BCCI Fixture"),
      status: pick(m, ["match_status", "match_status_str", "match_status_name"], "Scheduled"),
      id: pick(m, ["match_id", "gid"], String(i)),
      title: pick(m, ["title", "match_short_name", "name"]),
      result: pick(m, ["result_string"]),
    }));
  }

  const esc = (s) =>
    String(s ?? "").replace(
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

  function fmt(value) {
    if (!value) return "Date TBA";
    // BCCI's date_string is already human-readable (e.g. "16 October 2026").
    if (/\D/.test(value) && !/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(date);
  }

  function render() {
    const query = $("searchInput").value.trim().toLowerCase();
    const statusFilter = $("statusFilter").value;
    const sort = $("sortFilter").value;
    const list = state.fixtures.filter(
      (f) =>
        [f.home, f.away, f.venue, f.competition, f.status, f.date, f.title, f.result]
          .join(" ")
          .toLowerCase()
          .includes(query) &&
        (statusFilter === "all" || f.status.toLowerCase() === statusFilter.toLowerCase()),
    );

    list.sort((a, b) => {
      const aDate = Date.parse(a.date) || 0;
      const bDate = Date.parse(b.date) || 0;
      return sort === "date-desc" ? bDate - aDate : aDate - bDate;
    });

    $("resultCount").textContent = list.length + " of " + state.fixtures.length + " fixtures";
    $("fixtureList").innerHTML = list
      .map((f) => {
        const isLive = /live|progress|in play/i.test(f.status);
        const extra =
          f.result && !/teams will be announced/i.test(f.result)
            ? '<div class="match-meta"><span>' + esc(f.result) + "</span></div>"
            : "";
        return (
          '<article class="fixture-card"><div><div class="fixture-topline">' +
          '<span class="competition">' +
          esc(f.competition) +
          (f.title ? " · " + esc(f.title) : "") +
          "</span>" +
          '<span class="status-pill ' +
          (isLive ? "upcoming" : "") +
          '">' +
          esc(f.status) +
          "</span></div>" +
          '<div class="teams"><div class="team">' +
          esc(f.home) +
          '</div><div class="versus">VS</div><div class="team">' +
          esc(f.away) +
          '</div></div><div class="match-meta">' +
          [f.venue && "📍 " + f.venue, f.time && "◷ " + f.time]
            .filter(Boolean)
            .map((v) => "<span>" + esc(v) + "</span>")
            .join("") +
          "</div>" +
          extra +
          '</div><div class="fixture-date"><strong>' +
          esc(fmt(f.date)) +
          "</strong><span>Fixture date · " +
          esc(f.id) +
          "</span></div></article>"
        );
      })
      .join("");

    $("emptyState").hidden = list.length !== 0;
    $("fixtureList").hidden = list.length === 0;
  }

  async function load() {
    const button = $("refreshBtn");
    button.disabled = true;
    $("fixtureList").hidden = false;
    $("fixtureList").innerHTML = '<div class="loading-state">Loading saved BCCI fixtures…</div>';
    try {
      const response = await fetch("./bcci-fixtures.json?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok)
        throw new Error("Could not load bcci-fixtures.json (HTTP " + response.status + ").");
      const payload = await response.json();
      if (payload.status && payload.status !== "ok")
        throw new Error(payload.error || "Python fetch status: " + payload.status);

      state.fixtures = normalise(payload);
      const bcci = payload.data ?? payload;
      const page = bcci.page ?? {};
      $("totalCount").textContent = state.fixtures.length;
      $("pageCount").textContent = page.last_page ?? 1;
      $("lastUpdated").textContent = payload.fetchedAt ? fmt(payload.fetchedAt) : "Unknown";
      $("sourceStatus").textContent = payload.httpStatus
        ? "HTTP " + payload.httpStatus + " · " + payload.status
        : "Snapshot loaded";

      const statuses = [...new Set(state.fixtures.map((f) => f.status).filter(Boolean))].sort();
      const filter = $("statusFilter");
      const old = filter.value;
      filter.innerHTML =
        '<option value="all">All statuses</option>' +
        statuses.map((s) => '<option value="' + esc(s) + '">' + esc(s) + "</option>").join("");
      if (statuses.includes(old)) filter.value = old;
      render();

      if (!state.fixtures.length) {
        $("fixtureList").hidden = false;
        $("fixtureList").innerHTML =
          '<div class="loading-state">JSON loaded, but no records were found at data.match.</div>';
      }
    } catch (error) {
      $("totalCount").textContent = "—";
      $("pageCount").textContent = "—";
      $("lastUpdated").textContent = "Unavailable";
      $("sourceStatus").textContent = "Could not load snapshot";
      $("fixtureList").hidden = false;
      $("fixtureList").innerHTML =
        '<div class="loading-state">' +
        esc(error.message) +
        '<br><br><a class="secondary-btn" href="./bcci-fixtures.json" target="_blank" rel="noopener">Open JSON file</a></div>';
      $("resultCount").textContent = "No data";
    } finally {
      button.disabled = false;
    }
  }

  $("refreshBtn").addEventListener("click", load);
  $("searchInput").addEventListener("input", render);
  $("statusFilter").addEventListener("change", render);
  $("sortFilter").addEventListener("change", render);
  load();
})();
