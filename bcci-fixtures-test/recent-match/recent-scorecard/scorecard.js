(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const id = q.get("matchId");
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const fmtDate = (v) =>
    v
      ? new Date(v + "T12:00:00Z").toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "Date unavailable";
  function table(heads, rows) {
    return (
      '<div class="sc-table-wrap"><table class="sc-table"><thead><tr>' +
      heads.map((h) => "<th>" + esc(h) + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows.join("") +
      "</tbody></table></div>"
    );
  }
  function battingRows(rows) {
    return (rows || [])
      .map(
        (p) =>
          "<tr><td>" +
          esc(p.batter) +
          '<span class="sc-dismissal">' +
          esc(p.dismissal || (p.notOut ? "not out" : "")) +
          "</span></td><td>" +
          esc(p.runs ?? "—") +
          "</td><td>" +
          esc(p.balls ?? "—") +
          "</td><td>" +
          esc(p.fours ?? 0) +
          "</td><td>" +
          esc(p.sixes ?? 0) +
          "</td><td>" +
          esc(p.strikeRate ?? "—") +
          "</td></tr>",
      )
      .join("");
  }
  function bowlingRows(rows) {
    return (rows || [])
      .map(
        (p) =>
          "<tr><td>" +
          esc(p.bowler) +
          "</td><td>" +
          esc(p.overs ?? "—") +
          "</td><td>" +
          esc(p.maidens ?? 0) +
          "</td><td>" +
          esc(p.runs ?? "—") +
          "</td><td>" +
          esc(p.wickets ?? 0) +
          "</td><td>" +
          esc(p.economy ?? "—") +
          "</td></tr>",
      )
      .join("");
  }
  function inningsView(inn) {
    const extras = inn.extrasBreakdown || {};
    const ex =
      Object.entries(extras)
        .map(([k, v]) => k.replace(/_/g, " ") + ": " + v)
        .join(" · ") || "No extras recorded";
    const fow =
      (inn.fallOfWickets || [])
        .map((w) => w.wicket + "-" + w.score + " (" + w.batter + ", " + w.over + ")")
        .join(" · ") || "Fall of wickets unavailable";
    return (
      '<section class="sc-innings"><h3>' +
      esc(inn.team) +
      ' <span class="sc-total">' +
      esc(inn.runs) +
      "/" +
      esc(inn.wickets) +
      " · " +
      esc(inn.overs) +
      " ov</span></h3>" +
      table(["Batter", "R", "B", "4s", "6s", "SR"], battingRows(inn.batting)) +
      '<div class="sc-extras"><b>Extras ' +
      esc(inn.extras ?? 0) +
      ":</b> " +
      esc(ex) +
      "</div>" +
      table(["Bowler", "O", "M", "R", "W", "Econ"], bowlingRows(inn.bowling)) +
      '<div class="sc-fow"><b>Fall of wickets:</b> ' +
      esc(fow) +
      "</div></section>"
    );
  }
  async function init() {
    if (!id) {
      $("sc-loading").hidden = true;
      $("sc-error").hidden = false;
      $("sc-error").textContent =
        "No match selected. Return to Recent Matches and open a scorecard.";
      return;
    }
    try {
      let match = null;
      let lastError = null;
      // Preferred route: resolve the selected match through the compact archive index.
      try {
        const indexResponse = await fetch("/bcci-fixtures-test/recent-match/archive-index.json", {
          cache: "no-store",
        });
        if (!indexResponse.ok) throw Error("Archive index returned HTTP " + indexResponse.status);
        const index = await indexResponse.json();
        const row = (index.matches || []).find((m) => m.matchId === id);
        if (!row) throw Error("Selected match ID is not in the archive index.");
        const bundleResponse = await fetch(row.scorecard, { cache: "no-store" });
        if (!bundleResponse.ok) throw Error("Scorecard bundle returned HTTP " + bundleResponse.status);
        const bundle = await bundleResponse.json();
        match = (bundle.matches || []).find((m) => m.matchId === id) || null;
        if (!match) throw Error("Selected match ID was not found in the scorecard bundle.");
      } catch (error) {
        lastError = error;
      }
      // Fallback: match IDs contain date + format, so fetch just that year's bundle.
      // This avoids making a large index a hard dependency for opening scorecards.
      if (!match) {
        const idParts = id.match(/^(\d{4})-(t20i|odi|test)-/i);
        if (idParts) {
          const year = idParts[1];
          const formatSlug = idParts[2].toLowerCase();
          const bundleUrl = "/bcci-fixtures-test/recent-match/data/" + formatSlug + "-" + year + ".json";
          const response = await fetch(bundleUrl, { cache: "no-store" });
          if (response.ok) {
            const bundle = await response.json();
            match = (bundle.matches || []).find((m) => m.matchId === id) || null;
          }
        }
      }
      if (!match) {
        throw Error((lastError && lastError.message ? lastError.message + " " : "") +
          "Scorecard data could not be found. Check that the daily Cricsheet archive workflow has completed."); 
      }
      $("sc-back").href =
        "/bcci-fixtures-test/recent-match/?team=" +
        encodeURIComponent(q.get("team") || match.teams[0]) +
        "&format=" +
        encodeURIComponent(match.format);
      $("sc-loading").hidden = true;
      const teams = (match.teams || []).join(" vs ");
      $("sc-content").hidden = false;
      $("sc-content").innerHTML =
        '<section class="sc-hero"><p class="sc-kicker">' +
        esc(match.format) +
        " · INTERNATIONAL MATCH SCORECARD</p><h1>" +
        esc(teams) +
        '</h1><p class="sc-result">' +
        esc(match.result || "Result unavailable") +
        '</p><div class="sc-meta"><div><small>DATE</small><strong>' +
        esc(fmtDate(match.date)) +
        "</strong></div><div><small>VENUE</small><strong>" +
        esc([match.venue, match.city].filter(Boolean).join(", ") || "Not recorded") +
        "</strong></div><div><small>PLAYER OF THE MATCH</small><strong>" +
        esc((match.playerOfMatch || []).join(", ") || "Not recorded") +
        "</strong></div><div><small>TOSS</small><strong>" +
        esc(
          match.toss?.winner
            ? match.toss.winner + " elected to " + (match.toss.decision || "")
            : "Not recorded",
        ) +
        "</strong></div><div><small>EVENT / SEASON</small><strong>" +
        esc([match.event, match.season].filter(Boolean).join(" · ") || "Not recorded") +
        '</strong></div><div><small>DATA SOURCE</small><strong>Cricsheet</strong></div></div></section><section class="sc-panel"><h2>Full Scorecard</h2>' +
        (match.innings || []).map(inningsView).join("") +
        '</section><section class="sc-panel"><h2>Match officials</h2><p>' +
        esc((match.officials?.umpires || []).join(", ") || "Umpires not recorded") +
        "</p><p>" +
        esc((match.officials?.match_referees || []).join(", ") || "Match referee not recorded") +
        '</p><small>Source: <a href="https://cricsheet.org/" target="_blank" rel="noopener">Cricsheet</a> · ODC-BY attribution</small></section>';
    } catch (e) {
      $("sc-loading").hidden = true;
      $("sc-error").hidden = false;
      $("sc-error").textContent = e.message || "Could not load scorecard.";
    }
  }
  init();
})();
