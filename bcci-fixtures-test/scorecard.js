(() => {
  "use strict";
  const q = new URLSearchParams(location.search),
    gid = q.get("gid");
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  let match = null;
  function inningsRows() {
    return Array.isArray(match?.summary?.innings) ? match.summary.innings : [];
  }
  function score(row) {
    return row ? String(row.runs ?? 0) + (row.wickets != null ? "/" + row.wickets : "") : "—";
  }
  function renderHeader() {
    const a = match.team1_name || "Team 1",
      b = match.team2_name || "Team 2",
      ins = inningsRows();
    const find = (id) => ins.find((x) => String(x.batting_team_id) === String(id));
    const ia = find(match.team1_id),
      ib = find(match.team2_id);
    $("teamA").textContent = a;
    $("teamB").textContent = b;
    $("scoreA").textContent = score(ia);
    $("scoreB").textContent = score(ib);
    $("oversA").textContent = ia ? ia.overs + " overs" : "";
    $("oversB").textContent = ib ? ib.overs + " overs" : "";
    $("matchStatus").textContent =
      (match.live_status_name || match.match_status || "Match") +
      (match.result_string ? " · " + match.result_string : "");
    $("matchName").textContent = match.name || match.comp_name || "";
    $("venue").textContent = [match.ground_name, match.ground_city].filter(Boolean).join(", ");
    $("flagA").textContent = /india/i.test(a) ? "🇮🇳" : /zimbabwe/i.test(a) ? "🇿🇼" : "🏏";
    $("flagB").textContent = /india/i.test(b) ? "🇮🇳" : /zimbabwe/i.test(b) ? "🇿🇼" : "🏏";
  }
  function showTab(tab) {
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const ins = inningsRows(),
      a = match.team1_name || "Team 1",
      b = match.team2_name || "Team 2";
    if (tab === "scorecard") {
      $("tabContent").innerHTML =
        "<h2>Scorecard</h2>" +
        ins
          .map(
            (i, n) =>
              '<div class="scorecard-innings"><h3>' +
              esc(String(i.batting_team_id) === String(match.team1_id) ? a : b) +
              " · " +
              (n + 1) +
              ' innings</h3><div class="scorecard-total"><span>Total</span><span>' +
              esc(score(i)) +
              " (" +
              esc(i.overs || "0.0") +
              " Ov)</span></div></div>",
          )
          .join("") +
        '<p class="scorecard-note">The current BCCI live-scores JSON supplies innings totals only. Batter-by-batter and bowler-by-bowler rows need the separate BCCI scorecard feed.</p>';
    } else if (tab === "commentary") {
      $("tabContent").innerHTML =
        '<h2>Commentary</h2><p class="scorecard-note">Ball-by-ball commentary is not included in the live-scores JSON snapshot.</p>';
    } else if (tab === "stats") {
      $("tabContent").innerHTML =
        '<h2>Match Stats</h2><div class="scorecard-detail-grid">' +
        ins
          .map(
            (i, n) =>
              '<div class="scorecard-detail"><span>' +
              esc(String(i.batting_team_id) === String(match.team1_id) ? a : b) +
              "</span><strong>" +
              esc(score(i)) +
              "</strong><div>" +
              esc(i.overs || "0.0") +
              " overs · " +
              esc(i.balls || "0") +
              " balls</div></div>",
          )
          .join("") +
        "</div>";
    } else {
      $("tabContent").innerHTML =
        '<h2>Match Details</h2><div class="scorecard-detail-grid">' +
        [
          ["Competition", match.comp_name || match.primary_event_name],
          ["Match", match.name],
          ["Venue", match.ground_name],
          ["Status", match.live_status_name || match.match_status],
          ["Start time", match.start_datetime_utc],
          ["Match ID", match.gid],
        ]
          .map(
            ([k, v]) =>
              '<div class="scorecard-detail"><span>' +
              esc(k) +
              "</span><strong>" +
              esc(v || "Not available") +
              "</strong></div>",
          )
          .join("") +
        "</div>";
    }
  }
  async function init() {
    try {
      const r = await fetch("./bcci-live-scores.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw Error("HTTP " + r.status);
      const p = await r.json();
      const d = p.data ?? p;
      const rows = d.live_scores || d.match || d.matches || [];
      match = rows.find((m) => String(m.gid || m.match_id || "") === String(gid));
      if (!match) throw Error(gid
        ? "That match is not present in the latest live-scores snapshot. Open Live Scores and select the match again."
        : "No match ID was supplied. Open a match from the Live Scores list.");
      renderHeader();
      showTab("scorecard");
    } catch (e) {
      $("matchStatus").textContent = "Unable to load match: " + e.message;
      $("tabContent").innerHTML =
        '<p class="scorecard-note">Refresh the live JSON from the Live Scores page, then try again.</p>';
    }
  }
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  init();
})();
