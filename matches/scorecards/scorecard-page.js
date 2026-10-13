/* Complete Match cards navigate to their own scorecard page. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const state = { matches: [], format: "All", query: "" };
  const fmtLabel = (v) =>
    ({
      T20I: "T20 International",
      T20: "T20 / IPL",
      ODI: "One Day International",
      "List A": "List A / domestic ODI",
      Test: "Test",
      "First-class": "First-class / multi-day",
    })[v] ||
    v ||
    "Cricket";
  const dateLabel = (v) => {
    if (!v) return "Date unavailable";
    const d = new Date(v + "T12:00:00Z");
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  function battingTable(rows) {
    return (
      '<div class="scorecard-table-scroll"><table class="scorecard-table"><thead><tr><th>Batter</th><th>Dismissal</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>' +
      (rows || [])
        .map(
          (r) =>
            "<tr><td>" +
            esc(r.batter) +
            "</td><td>" +
            esc(r.dismissal || (r.notOut ? "not out" : "—")) +
            "</td><td><b>" +
            esc(r.runs) +
            "</b></td><td>" +
            esc(r.balls) +
            "</td><td>" +
            esc(r.fours) +
            "</td><td>" +
            esc(r.sixes) +
            "</td><td>" +
            esc(r.strikeRate) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  function bowlingTable(rows) {
    return (
      '<div class="scorecard-table-scroll"><table class="scorecard-table"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Eco</th></tr></thead><tbody>' +
      (rows || [])
        .map(
          (r) =>
            "<tr><td>" +
            esc(r.bowler) +
            "</td><td>" +
            esc(r.overs) +
            "</td><td>" +
            esc(r.maidens) +
            "</td><td>" +
            esc(r.runs) +
            "</td><td><b>" +
            esc(r.wickets) +
            "</b></td><td>" +
            esc(r.economy) +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  function renderScorecard(data) {
    const innings = (data.innings || [])
      .map((inn) => {
        const extras =
          Object.entries(inn.extrasBreakdown || {})
            .map(([k, v]) => k + ": " + v)
            .join(" · ") || "None";
        const fow = (inn.fallOfWickets || [])
          .map((x) => x.score + "/" + x.wicket + " (" + x.batter + ", " + x.over + ")")
          .join(" · ");
        const deliveries = (inn.deliveries || [])
          .map((b) => {
            const run = b.totalRuns === 0 ? "·" : "+" + b.totalRuns;
            const wickets = (b.wickets || []).length
              ? " WICKET: " + b.wickets.map((w) => w.player + " (" + w.kind + ")").join(", ")
              : "";
            return (
              '<span class="' +
              ((b.wickets || []).length ? "delivery-wicket" : "") +
              '"><b>' +
              esc(b.over) +
              "." +
              esc(b.ball) +
              "</b> " +
              esc(b.bowler) +
              " to " +
              esc(b.batter) +
              " — " +
              run +
              esc(wickets) +
              "</span>"
            );
          })
          .join("");
        return (
          '<section class="scorecard-innings"><div class="scorecard-innings-heading"><div><small>INNINGS ' +
          esc(inn.number) +
          "</small><h2>" +
          esc(inn.team) +
          "</h2></div><strong>" +
          esc(inn.runs) +
          "/" +
          esc(inn.wickets) +
          " <small>(" +
          esc(inn.overs) +
          ' ov)</small></strong></div><p class="scorecard-extras"><b>Extras ' +
          esc(inn.extras) +
          ":</b> " +
          esc(extras) +
          "</p><h3>Batting</h3>" +
          battingTable(inn.batting) +
          "<h3>Bowling</h3>" +
          bowlingTable(inn.bowling) +
          (fow ? '<p class="scorecard-fow"><b>Fall of wickets:</b> ' + esc(fow) + "</p>" : "") +
          '<details class="scorecard-deliveries"><summary>Ball-by-ball · ' +
          (inn.deliveries || []).length +
          ' deliveries</summary><div class="delivery-list">' +
          (deliveries || "Delivery detail unavailable.") +
          "</div></details></section>"
        );
      })
      .join("");
    $("scorecard-content").innerHTML =
      '<header class="scorecard-detail-head"><div><span class="eyebrow">VERIFIED MATCH SCORECARD</span><h1>' +
      esc(data.team) +
      " <em>VS</em> " +
      esc(data.opposition) +
      "</h1><p>" +
      esc(dateLabel(data.date)) +
      " · " +
      esc(data.venue) +
      " · " +
      esc(fmtLabel(data.format)) +
      '</p><p class="scorecard-event">' +
      esc(data.event || "Match archive") +
      '</p></div><span class="format-badge">' +
      esc(data.format) +
      '</span></header><div class="scorecard-result">' +
      esc(data.result) +
      "</div>" +
      (innings || '<p class="match-empty">Innings data unavailable for this match.</p>') +
      '<p class="scorecard-attribution">Source: <a href="' +
      esc(data.source || "https://cricsheet.org/") +
      '" target="_blank" rel="noopener">Cricsheet</a> · ' +
      esc(data.attribution || "Verified public match data") +
      "</p>";
    $("scorecard-page-status").textContent = "Scorecard loaded";
    document.title = data.team + " vs " + data.opposition + " Scorecard | Tilak Varma Fan Club";
  }
  async function init() {
    const id = new URLSearchParams(window.location.search).get("match");
    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
      $("scorecard-page-status").textContent =
        "Choose a match from Complete Match to view its scorecard.";
      $("scorecard-content").innerHTML =
        '<div class="match-empty"><strong>No match selected</strong><span>Open Matches → Complete Match and tap Full scorecard on any match.</span><a class="scorecard-back" href="/matches/">Go to Complete Matches ↗</a></div>';
      return;
    }
    try {
      const response = await fetch("/matches/scorecards/data/" + encodeURIComponent(id) + ".json", {
        cache: "force-cache",
      });
      if (!response.ok) throw new Error("Scorecard not found");
      renderScorecard(await response.json());
    } catch (e) {
      $("scorecard-page-status").textContent = "Scorecard unavailable";
      $("scorecard-content").innerHTML =
        '<div class="match-empty"><strong>Scorecard could not load</strong><span>This match file may not be included in the current verified archive.</span><a class="scorecard-back" href="/matches/">Back to Matches ↗</a></div>';
      console.error("Standalone scorecard:", e);
    }
  }
  init();
})();
