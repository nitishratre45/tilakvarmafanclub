(() => {
  "use strict";
  const root = document.getElementById("liveScoresPanel");
  if (!root) return;
  const status = root.querySelector("[data-live-status]");
  const list = root.querySelector("[data-live-list]");
  const refresh = root.querySelector("[data-live-refresh]");
  if (!status || !list || !refresh) {
    console.error("Live score panel is missing required elements.", { status, list, refresh });
    return;
  }
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  function extract(p) {
    const d = p?.data ?? p;
    if (Array.isArray(d?.match)) return d.match;
    if (Array.isArray(d?.live_scores)) return d.live_scores;
    if (Array.isArray(d?.data?.match)) return d.data.match;
    if (Array.isArray(d?.matches)) return d.matches;
    if (Array.isArray(d)) return d;
    return [];
  }
  function isActuallyLive(m) {
    const state = String(
      m.match_status_str ??
        m.match_status ??
        m.status_str ??
        m.status ??
        m.state ??
        m.live_status_name ??
        "",
    )
      .trim()
      .toLowerCase();
    const result = String(m.result_string ?? m.result ?? "")
      .trim()
      .toLowerCase();
    const statusId = String(m.match_status_id ?? m.status_id ?? "").trim();
    // BCCI uses "complete" / status ID 2 for finished games. A result string
    // such as "India Women win by 4 wickets" is also a definitive completion signal.
    if (
      statusId === "2" ||
      /complete|completed|finished|result|abandoned|cancelled|canceled|no result|won by|win by|drawn|tied/.test(
        state,
      )
    )
      return false;
    if (result) return false;
    return /(^|\b)(live|in progress|innings|stumps|lunch|tea|drinks|rain delay|match delayed|break)(\b|$)/.test(
      state,
    );
  }
  function render(matches) {
    const liveMatches = matches.filter(isActuallyLive);
    if (!liveMatches.length) {
      list.innerHTML =
        '<p class="loading-state">Abhi koi live match nahi hai. Completed matches ke liye Match Results dekhein.</p>';
      return;
    }
    list.innerHTML = liveMatches
      .map((m) => {
        const a = m.team1_name || m.home_team_name || m.team1 || "Team 1";
        const b = m.team2_name || m.away_team_name || m.team2 || "Team 2";
        const innings = Array.isArray(m.summary?.innings) ? m.summary.innings : [];
        const latest =
          innings
            .filter(
              (i) =>
                Number(i.balls || 0) > 0 || Number(i.runs || 0) > 0 || Number(i.wickets || 0) > 0,
            )
            .sort((x, y) => Number(y.innings_number || 0) - Number(x.innings_number || 0))[0] ||
          innings[innings.length - 1] ||
          null;
        const battingId = latest?.batting_team_id;
        const battingName =
          String(battingId) === String(m.team1_id)
            ? a
            : String(battingId) === String(m.team2_id)
              ? b
              : "";
        const scoreOf = (i) =>
          i ? String(i.runs ?? 0) + (i.wickets != null ? "/" + i.wickets : "") : "";
        const oversOf = (i) => (i?.overs != null ? String(i.overs) : "");
        const inningsForTeam = (id) =>
          innings.find((row) => String(row.batting_team_id) === String(id)) || null;
        const inningsA = inningsForTeam(m.team1_id);
        const inningsB = inningsForTeam(m.team2_id);
        const scoreA = scoreOf(inningsA),
          scoreB = scoreOf(inningsB);
        const oversA = oversOf(inningsA),
          oversB = oversOf(inningsB);
        const statusText =
          m.live_status_name || m.match_status_str || m.match_status || m.status || "Live";
        const logoFor = (name, abbr) => {
          const key = String(abbr || name || "").toLowerCase();
          if (key.includes("ind") || /india/i.test(name || ""))
            return "https://flagcdn.com/w160/in.png";
          if (key.includes("zim") || /zimbabwe/i.test(name || ""))
            return "https://flagcdn.com/w160/zw.png";
          return "";
        };
        const logoA = logoFor(a, m.team1_abbreviation),
          logoB = logoFor(b, m.team2_abbreviation);
        const logoMarkup = (src, team) =>
          src
            ? '<img class="live-team-logo" src="' +
              esc(src) +
              '" alt="' +
              esc(team) +
              ' flag" loading="lazy" decoding="async" onerror="this.hidden=true">'
            : '<span class="live-team-badge">' +
              esc((team.match(/\b\w/g) || ["T"]).join("").slice(0, 3)) +
              "</span>";
        const date = m.start_datetime_utc || m.start_date || m.date_string || "";
        const matchGid = m.gid || m.match_id || m.id || "";
        const scoreFallback = m.team1_score || m.team1_scores || "";
        return (
          '<article class="live-score-card live-score-card-clickable" tabindex="0" role="link" aria-label="Open scorecard for ' +
          esc(a + " versus " + b) +
          '" data-match-gid="' +
          esc(matchGid) +
          '">' +
          '<div class="live-card-status"><span class="live-status-label"><i></i>LIVE</span><strong>' +
          esc(statusText) +
          "</strong></div>" +
          '<div class="live-card-main"><div class="live-team">' +
          logoMarkup(logoA, a) +
          "<strong>" +
          esc(a) +
          "</strong>" +
          (battingName === a && latest ? "<small>Batting</small>" : "") +
          (scoreA || scoreFallback
            ? '<div class="live-team-score"><strong>' +
              esc(scoreA || scoreFallback) +
              "</strong><span>" +
              esc(oversA) +
              " ov</span></div>"
            : "") +
          '</div><div class="live-versus">VS</div><div class="live-team live-team-right">' +
          logoMarkup(logoB, b) +
          "<strong>" +
          esc(b) +
          "</strong>" +
          (battingName === b && latest ? "<small>Batting</small>" : "") +
          (scoreB || m.team2_score
            ? '<div class="live-team-score"><strong>' +
              esc(scoreB || m.team2_score) +
              "</strong><span>" +
              esc(oversB) +
              " ov</span></div>"
            : "") +
          '</div></div><div class="live-card-footer"><div><strong>' +
          esc(m.primary_event_name || m.comp_name || m.series_name || "Cricket") +
          "</strong><span>" +
          esc(m.match_round || m.name || m.match_name || "") +
          "</span><span>" +
          esc(m.ground_name || m.ground_city || m.venue || "Venue TBA") +
          "</span></div><time>" +
          esc(date) +
          "</time></div></article>"
        );
      })
      .join("");
  }
  async function load() {
    refresh.disabled = true;
    status.textContent = "Loading separate live-scores JSON…";
    try {
      const res = await fetch("./bcci-live-scores.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const p = await res.json();
      if (p.status === "error") throw new Error(p.error || "Latest workflow fetch failed");
      const matches = extract(p);
      render(matches);
      status.textContent =
        "JSON snapshot: " +
        (p.fetchedAt ? new Date(p.fetchedAt).toLocaleString() : "time unavailable") +
        " · " +
        matches.filter(isActuallyLive).length +
        " live matches (" +
        matches.length +
        " source records)";
    } catch (e) {
      status.textContent = "Live JSON load failed: " + e.message;
      list.innerHTML =
        '<p class="loading-state">Run the BCCI Live Scores workflow to refresh bcci-live-scores.json.</p>';
    } finally {
      refresh.disabled = false;
    }
  }
  list.addEventListener("click", (event) => {
    const card = event.target.closest(".live-score-card-clickable");
    if (!card) return;
    const gid = card.dataset.matchGid || "";
    window.open("./scorecard.html?gid=" + encodeURIComponent(gid), "_blank", "noopener");
  });
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".live-score-card-clickable");
    if (!card) return;
    event.preventDefault();
    const gid = card.dataset.matchGid || "";
    window.open("./scorecard.html?gid=" + encodeURIComponent(gid), "_blank", "noopener");
  });
  refresh.addEventListener("click", load);
  load();
  window.setInterval(load, 60000);
})();
