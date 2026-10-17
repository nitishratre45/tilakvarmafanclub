(() => {
  "use strict";
  const MATCH_ID = "e0b67c41-cd96-4b62-9281-2636607533a1";
  const DATA_URL = "/matches/scorecards/bcci-scorecard.json";
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const arr = (value) => (Array.isArray(value) ? value : []);
  function findMatch(root) {
    const seen = new Set();
    function walk(value, depth = 0) {
      if (!value || typeof value !== "object" || depth > 9 || seen.has(value)) return null;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = walk(item, depth + 1);
          if (found) return found;
        }
        return null;
      }
      const id = String(value.gid || value.match_gid || value.matchId || value.id || "");
      const looksLikeMatch =
        id === MATCH_ID ||
        (value.team1_name &&
          value.team2_name &&
          (value.innings || value.scorecard || value.summary));
      if (looksLikeMatch && (value.innings || value.scorecard || value.summary || value.data))
        return value;
      for (const [key, child] of Object.entries(value))
        if (
          /match|score|inning|data|response|payload|props/i.test(key) ||
          typeof child === "object"
        ) {
          const found = walk(child, depth + 1);
          if (found) return found;
        }
      return null;
    }
    return walk(root);
  }
  function table(title, rows, kind) {
    const fields =
      kind === "bat"
        ? [
            ["Batter", "batter", "name", "player"],
            ["Dismissal", "dismissal", "how_out"],
            ["R", "runs", "r"],
            ["B", "balls", "b"],
            ["4s", "fours", "4s"],
            ["6s", "sixes", "6s"],
            ["SR", "strike_rate", "strikeRate", "sr"],
          ]
        : [
            ["Bowler", "bowler", "name", "player"],
            ["O", "overs", "o"],
            ["M", "maidens", "m"],
            ["R", "runs", "r"],
            ["W", "wickets", "w"],
            ["Econ", "economy", "econ"],
          ];
    const get = (obj, keys) => {
      for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
      return "—";
    };
    return (
      "<h3>" +
      title +
      '</h3><div class="table-scroll"><table><thead><tr>' +
      fields.map((f) => "<th>" + esc(f[0]) + "</th>").join("") +
      "</tr></thead><tbody>" +
      arr(rows)
        .map(
          (row) =>
            "<tr>" +
            fields
              .map(
                (f, i) =>
                  "<td>" +
                  (i === 0 ? "<b>" : "") +
                  esc(get(row, f.slice(1))) +
                  (i === 0 ? "</b>" : "") +
                  "</td>",
              )
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  function render(root) {
    const match =
      findMatch(root) ||
      root?.data?.match?.find?.((m) => String(m.gid) === MATCH_ID) ||
      root?.match;
    const data = match?.data && !match.innings ? match.data : match;
    if (!data || (!data.innings && !data.scorecard && !data.summary))
      throw new Error(
        "JSON fetched, but scorecard innings were not found. See raw JSON for source shape.",
      );
    const innings = arr(
      data.innings || data.scorecard || data.data?.innings || data.summary?.innings,
    );
    $("match-title").textContent =
      (data.team1_name || data.team || "India Women") +
      " vs " +
      (data.team2_name || data.opposition || "Zimbabwe Women");
    $("match-meta").textContent = [
      data.title,
      data.date_string || data.start_date,
      data.ground_name || data.venue,
    ]
      .filter(Boolean)
      .join(" · ");
    $("scorecard").innerHTML =
      innings
        .map((inn, index) => {
          const bat = inn.batting || inn.batsmen || inn.batters || inn.batsman || [];
          const bowl = inn.bowling || inn.bowlers || inn.bowler || [];
          const team =
            inn.team_name ||
            inn.team ||
            inn.batting_team ||
            inn.battingTeam ||
            "Innings " + (index + 1);
          const runs = inn.runs ?? inn.total_runs ?? inn.total ?? "—",
            wkts = inn.wickets ?? inn.total_wickets ?? "—",
            overs = inn.overs ?? inn.overs_completed ?? "—";
          const extras = inn.extras;
          const fow = inn.fall_of_wickets || inn.fallOfWickets || inn.fow || [];
          return (
            '<section class="innings"><div class="score-head"><div><p class="eyebrow">INNINGS ' +
            (index + 1) +
            "</p><h2>" +
            esc(team) +
            '</h2></div><div class="score">' +
            esc(runs) +
            "/" +
            esc(wkts) +
            ' <span class="sub">(' +
            esc(overs) +
            " ov)</span></div></div>" +
            table("Batting", bat, "bat") +
            table("Bowling", bowl, "bowl") +
            (extras
              ? '<p class="extras"><b>Extras:</b> ' +
                esc(typeof extras === "object" ? JSON.stringify(extras) : extras) +
                "</p>"
              : "") +
            (fow.length
              ? '<p class="fow"><b>Fall of wickets:</b> ' +
                esc(
                  fow
                    .map((x) =>
                      typeof x === "string"
                        ? x
                        : [x.score, x.wicket, x.player || x.batter, x.over]
                            .filter(Boolean)
                            .join(" "),
                    )
                    .join(" · "),
                ) +
                "</p>"
              : "") +
            "</section>"
          );
        })
        .join("") || '<div class="empty">No innings are available in this JSON snapshot yet.</div>';
    $("status").textContent =
      "JSON loaded · " + new Date(root.fetchedAt || Date.now()).toLocaleString();
  }
  async function load() {
    $("status").textContent = "Loading separate scorecard JSON…";
    try {
      const response = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("JSON request failed (HTTP " + response.status + ")");
      const data = await response.json();
      if (data.status === "error") throw new Error(data.error || "Python fetch reported an error");
      render(data);
    } catch (error) {
      $("status").textContent = error.message;
      $("scorecard").innerHTML =
        '<div class="empty"><b>Scorecard unavailable</b><br>' +
        esc(error.message) +
        '<br><a href="' +
        DATA_URL +
        '" target="_blank" rel="noopener">Open raw JSON</a></div>';
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const link = $("official-link");
    if (link) link.href = "https://stats.bcci.tv/match/" + MATCH_ID + "/scorecard";
    $("reload")?.addEventListener("click", load);
    load();
  });
})();
