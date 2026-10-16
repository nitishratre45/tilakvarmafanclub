(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const val = (o, ...keys) => {
    for (const k of keys) if (o?.[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
    return "—";
  };
  const asArray = (v) => (Array.isArray(v) ? v : []);
  const playerName = (r, players, kind) => {
    const direct = val(
      r,
      "player_known_as",
      "known_as",
      "player_name",
      "name",
      kind === "bat" ? "batsman_name" : "bowler_name",
    );
    if (direct !== "—") return direct;
    const p = players.get(String(r?.player_id));
    return (
      p?.player_known_as ||
      p?.known_as ||
      p?.player_name ||
      p?.name ||
      p?.full_name ||
      "Player " + val(r, "player_id")
    );
  };
  function table(title, rows, columns) {
    if (!rows.length)
      return '<p class="muted">No ' + esc(title.toLowerCase()) + " data in this snapshot.</p>";
    return (
      '<h3 class="subhead">' +
      esc(title) +
      '</h3><div class="table-scroll" role="region" aria-label="' +
      esc(title) +
      ' table" tabindex="0"><table class="score-table"><thead><tr>' +
      columns.map((c) => "<th>" + esc(c.label) + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows
        .map(
          (row) =>
            "<tr>" +
            columns
              .map(
                (c) =>
                  "<td>" +
                  esc(typeof c.value === "function" ? c.value(row) : val(row, c.value)) +
                  "</td>",
              )
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  function scoreText(inn) {
    const runs = val(inn, "total_runs", "runs", "score");
    const wkts = val(inn, "wickets", "wicket");
    return String(runs) + (wkts !== "—" ? "/" + wkts : "");
  }
  function render(payload) {
    const data = payload?.data ?? payload;
    const innings = asArray(data?.innings);
    const teams = asArray(data?.team);
    const match = data?.match || payload?.liveMatch || {};
    const allPlayers = teams.flatMap((t) => asArray(t.player));
    const players = new Map();
    for (const p of allPlayers) {
      const id = p.player_id ?? p.id;
      if (id != null) players.set(String(id), p);
    }
    const teamsById = new Map();
    for (const t of teams) {
      const id = t.team_id ?? t.id;
      if (id != null) teamsById.set(String(id), t);
    }
    const teamName = (id) => {
      const t = teamsById.get(String(id));
      return t?.name || t?.team_name || t?.short_name || t?.team_short_name || "Team";
    };
    const name =
      match.name ||
      match.match_name ||
      payload?.liveMatch?.name ||
      payload?.matchName ||
      "BCCI Match Scorecard";
    // Keep both teams' current totals visible above the full innings scorecard.
    const summaryInnings = asArray(match?.summary?.innings);
    const scoreRows = [...innings, ...summaryInnings];
    const teamOneId = match.team1_id ?? payload?.liveMatch?.team1_id;
    const teamTwoId = match.team2_id ?? payload?.liveMatch?.team2_id;
    const teamOneName = match.team1_name || match.team1_short_name || payload?.liveMatch?.team1_name || "Team 1";
    const teamTwoName = match.team2_name || match.team2_short_name || payload?.liveMatch?.team2_name || "Team 2";
    const teamScore = (teamId) => {
      const row = scoreRows.find((inn) => String(inn.batting_team_id ?? inn.team_id) === String(teamId));
      if (!row) return { score: "Yet to bat", overs: "" };
      const runs = val(row, "total_runs", "runs", "score");
      const wickets = val(row, "wickets", "wicket");
      const overs = val(row, "overs", "overs_bowled");
      return {
        score: String(runs) + (wickets !== "—" ? "/" + wickets : ""),
        overs: overs !== "—" ? String(overs) + " overs" : ""
      };
    };
    const scoreA = teamScore(teamOneId);
    const scoreB = teamScore(teamTwoId);
    const isLive = payload?.isLive === true || /live|in play|in progress|innings break/i.test(
      String(match.match_status || match.live_status_name || payload?.liveMatch?.match_status || "")
    );
    const board = $("top-scoreboard");
    if (board) {
      board.innerHTML =
        '<div class="top-scoreboard-heading"><span>' + (isLive ? '<i></i> LIVE SCORE' : 'MATCH SCORE') +
        '</span><small>Both teams</small></div><div class="top-scoreboard-teams">' +
        '<article class="top-score-team"><span>' + esc(teamOneName) + '</span><strong>' + esc(scoreA.score) +
        '</strong><small>' + esc(scoreA.overs) + '</small></article><b class="top-score-vs">VS</b>' +
        '<article class="top-score-team"><span>' + esc(teamTwoName) + '</span><strong>' + esc(scoreB.score) +
        '</strong><small>' + esc(scoreB.overs) + '</small></article></div>';
    }
    $("title").textContent = name;
    $("meta").textContent = [
      match.comp_name || match.competition_name || match.primary_event_name,
      match.ground_name,
      match.ground_city,
      match.date_string || match.start_date,
      payload?.fetchedAt ? "Snapshot: " + new Date(payload.fetchedAt).toLocaleString("en-IN") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (!innings.length) {
      $("scorecard").innerHTML =
        '<section class="innings"><h2>Scorecard data unavailable</h2><p class="muted">Saved JSON mein innings rows nahi hain. Reload JSON karein ya workflow refresh check karein.</p></section>';
      return;
    }
    $("scorecard").innerHTML = innings
      .map((inn, idx) => {
        const batting = asArray(inn.batting || inn.batsman || inn.batsmen);
        const bowling = asArray(inn.bowling || inn.bowler || inn.bowlers);
        const teamId = inn.batting_team_id ?? inn.team_id;
        const totalRuns = val(inn, "total_runs", "runs", "score");
        const wickets = val(inn, "wickets", "wicket");
        const overs = val(inn, "overs", "overs_bowled");
        const extras = inn.extras;
        const extrasText =
          extras && typeof extras === "object"
            ? Object.entries(extras)
                .map(([k, v]) => k + ": " + v)
                .join(" · ")
            : (extras ?? "");
        const extrasValue =
          extrasText === ""
            ? ""
            : '<p class="muted innings-meta">Extras: ' + esc(extrasText) + "</p>";
        const summary = asArray(data?.match?.summary?.innings).find(
          (s) => String(s.innings_number) === String(inn.innings_number),
        );
        const teamSummary = asArray(data?.match?.summary?.team).find(
          (s) => String(s.team_id) === String(teamId),
        );
        const fallbackTotal =
          teamSummary?.score ||
          (summary
            ? [summary.runs + "/" + summary.wickets, summary.overs + " ov"]
                .filter(Boolean)
                .join(" · ")
            : "");
        const headline = totalRuns === "—" ? fallbackTotal || "Score unavailable" : scoreText(inn);
        const teamLabel = inn.team_name || teamName(teamId);
        return (
          '<section class="innings"><div class="inn-head"><div><p class="eyebrow">INNINGS ' +
          esc(inn.innings_number || idx + 1) +
          "</p><h2>" +
          esc(teamLabel) +
          '</h2></div><div class="total">' +
          esc(headline) +
          "</div></div>" +
          '<p class="muted innings-meta">' +
          (overs !== "—" ? esc(overs) + " overs" : "") +
          (inn.target ? " · Target: " + esc(inn.target) : "") +
          "</p>" +
          extrasValue +
          table("Batting", batting, [
            { label: "Batter", value: (r) => playerName(r, players, "bat") },
            {
              label: "Dismissal",
              value: (r) => val(r, "dismissal_str", "dismissal_name", "dismissal", "how_out"),
            },
            { label: "R", value: (r) => val(r, "runs", "r") },
            { label: "B", value: (r) => val(r, "balls_faced", "balls", "b") },
            { label: "4s", value: (r) => val(r, "fours", "four") },
            { label: "6s", value: (r) => val(r, "sixes", "six") },
            { label: "SR", value: (r) => val(r, "strike_rate", "sr") },
          ]) +
          table("Bowling", bowling, [
            { label: "Bowler", value: (r) => playerName(r, players, "bowl") },
            { label: "O", value: (r) => val(r, "overs", "overs_bowled") },
            { label: "M", value: (r) => val(r, "maidens", "maiden_overs") },
            { label: "R", value: (r) => val(r, "conceded", "runs_conceded", "runs") },
            { label: "W", value: (r) => val(r, "wickets", "wkts") },
            {
              label: "Econ",
              value: (r) => val(r, "bowling_economy_rate", "economy", "economy_rate"),
            },
          ]) +
          "</section>"
        );
      })
      .join("");
  }
  async function load() {
    $("reload").disabled = true;
    $("status").textContent = "Loading the selected BCCI match…";
    try {
      const requestedGid = new URLSearchParams(location.search).get("gid");
      const [scoreResponse, fixturesResponse, resultsResponse] = await Promise.all([
        fetch("./bcci-scorecard.json?t=" + Date.now(), { cache: "no-store" }).catch(() => null),
        fetch("./bcci-fixtures.json?t=" + Date.now(), { cache: "no-store" }).catch(() => null),
        fetch("./results/results.json?t=" + Date.now(), { cache: "no-store" }).catch(() => null),
      ]);
      const scorePayload = scoreResponse?.ok ? await scoreResponse.json().catch(() => null) : null;
      let selected = null;
      if (requestedGid && fixturesResponse?.ok) {
        const snapshot = await fixturesResponse.json().catch(() => null);
        const data = snapshot?.data ?? snapshot;
        const matches = Array.isArray(data?.match) ? data.match : [];
        selected =
          matches.find(
            (m) =>
              String(m.gid || m.match_gid || m.match_id || m.id || "") === String(requestedGid),
          ) || null;
      }
      if (requestedGid && !selected && resultsResponse?.ok) {
        const archive = await resultsResponse.json().catch(() => null);
        const rows = Array.isArray(archive?.matches) ? archive.matches : [];
        selected =
          rows.find(
            (m) =>
              String(m.gid || m.match_gid || m.match_id || m.id || "") === String(requestedGid),
          ) || null;
      }
      if (requestedGid) {
        if (!selected)
          throw new Error(
            "The selected match ID was not found in the saved BCCI fixtures or results archive.",
          );
        const detailed = scorePayload?.data?.match || scorePayload?.liveMatch || {};
        const detailedId = String(detailed.gid || detailed.match_gid || detailed.match_id || "");
        if (
          scorePayload?.status === "ok" &&
          detailedId === String(requestedGid) &&
          Array.isArray(scorePayload?.data?.innings) &&
          scorePayload.data.innings.length
        ) {
          render(scorePayload);
          $("status").textContent =
            "FULL SCORECARD · " +
            (selected.name || selected.match_short_name || "Selected match") +
            " · Detailed BCCI batting and bowling data";
          return;
        }
        const summary = selected.summary || {};
        const innings = Array.isArray(summary.innings) ? summary.innings : [];
        const teams = Array.isArray(summary.team) ? summary.team : [];
        const teamNames = {};
        teamNames[String(selected.team1_id)] =
          selected.team1_name || selected.team1_short_name || "Team 1";
        teamNames[String(selected.team2_id)] =
          selected.team2_name || selected.team2_short_name || "Team 2";
        render({
          data: {
            match: selected,
            team: teams.map((t) => ({ ...t, name: teamNames[String(t.team_id)] || "Team" })),
            innings: innings.map((inn) => ({
              ...inn,
              total_runs: inn.runs,
              team_id: inn.batting_team_id,
              team_name: teamNames[String(inn.batting_team_id)] || "Team",
            })),
          },
          matchName: selected.name || selected.match_short_name,
        });
        $("status").textContent =
          "MATCH SCORECARD · " +
          (selected.name || selected.match_short_name || "Selected match") +
          " · " +
          (innings.length ? "BCCI innings totals" : "Detailed score data not yet available");
        return;
      }
      if (!scorePayload) throw new Error("Could not load bcci-scorecard.json");
      if (scorePayload.status && scorePayload.status !== "ok")
        throw new Error(scorePayload.error || "BCCI snapshot status: " + scorePayload.status);
      render(scorePayload);
      const liveMeta = scorePayload.liveMatch || scorePayload.data?.match || {};
      const liveName =
        liveMeta.name ||
        liveMeta.match_name ||
        scorePayload.matchName ||
        $("title").textContent ||
        "BCCI Scorecard";
      const liveState =
        scorePayload.isLive === true ||
        /^(live|in play|in progress|innings break)$/i.test(
          String(liveMeta.match_status || liveMeta.live_status_name || ""),
        );
      $("status").textContent =
        (liveState ? "LIVE MATCH · " : "LATEST SCORECARD · ") +
        liveName +
        " · Snapshot HTTP " +
        (scorePayload.httpStatus || scoreResponse?.status || "—") +
        " · Auto-refresh every 60 sec";
    } catch (error) {
      $("status").textContent = "Could not load scorecard: " + error.message;
    } finally {
      $("reload").disabled = false;
    }
  }
  $("reload").addEventListener("click", load);
  load();
  window.setInterval(load, 60000);
})();
