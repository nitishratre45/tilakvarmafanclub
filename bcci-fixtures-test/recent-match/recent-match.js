(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const norm = (v) =>
    String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  let index;
  const params = new URLSearchParams(location.search);
  const teamSel = $("rm-team"),
    formatSel = $("rm-format");
  if (params.get("format") && ["T20I", "ODI", "Test"].includes(params.get("format")))
    formatSel.value = params.get("format");
  function scoreline(m) {
    return (m.scores || [])
      .map((s) => s.team + " " + s.runs + "/" + s.wickets + " (" + s.overs + ")")
      .join(" · ");
  }
  function render() {
    if (!index) return;
    const team = teamSel.value,
      format = formatSel.value;
    const rows = (index.matches || [])
      .filter((m) => m.format === format && (m.teams || []).some((t) => norm(t) === norm(team)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);
    const meta = $("rm-meta");
    if (meta) {
      meta.textContent =
        (index.matchCount || 0).toLocaleString() +
        " saved international matches · " +
        format +
        " · Source snapshot " +
        String(index.updatedAt || "").slice(0, 10);
    }
    $("rm-list").innerHTML = rows.length
      ? rows
          .map((m) => {
            const opp = (m.teams || []).find((t) => norm(t) !== norm(team)) || "Opponent";
            const winner = norm((m.outcome || {}).winner);
            const result = String(m.result || "Result unavailable");
            const outcome = winner ? (winner === norm(team) ? "W" : "L") : "N";
            const url =
              "/bcci-fixtures-test/recent-match/recent-scorecard/?matchId=" +
              encodeURIComponent(m.matchId) +
              "&format=" +
              encodeURIComponent(m.format) +
              "&team=" +
              encodeURIComponent(team) +
              (params.get("returnTo") && params.get("returnTo").startsWith("/matches/details/")
                ? "&returnTo=" +
                  encodeURIComponent(params.get("returnTo") + "#recent-match-results")
                : "");
            return (
              '<article class="rm-card"><div class="rm-badge ' +
              (outcome === "W" ? "win" : outcome === "L" ? "loss" : "") +
              '">' +
              outcome +
              '</div><div><div class="rm-date">' +
              esc(m.date) +
              " · " +
              esc(m.format) +
              "</div><h2>" +
              esc(team) +
              " vs " +
              esc(opp) +
              '</h2><p class="rm-score">' +
              esc(scoreline(m) || "Score summary unavailable") +
              '</p><p class="rm-result">' +
              esc(result) +
              '</p><a class="rm-open" href="' +
              esc(url) +
              '">Open full scorecard ↗</a></div></article>'
            );
          })
          .join("")
      : '<div class="rm-empty">No saved ' +
        esc(format) +
        " matches found for " +
        esc(team) +
        ".</div>";
  }
  async function init() {
    try {
      const r = await fetch("/bcci-fixtures-test/recent-match/archive-index.json", {
        cache: "no-store",
      });
      if (!r.ok) throw Error("Archive not generated yet");
      index = await r.json();
      const fixtureTeams = params.getAll("team");
      const teams = [
        ...new Set(
          (index.matches || [])
            .filter((m) => m.format === formatSel.value)
            .flatMap((m) => m.teams || []),
        ),
      ].sort();
      const requested = params.get("team") || fixtureTeams[0] || "India";
      teamSel.innerHTML = teams
        .map(
          (t) =>
            '<option value="' +
            esc(t) +
            '"' +
            (norm(t) === norm(requested) ? " selected" : "") +
            ">" +
            esc(t) +
            "</option>",
        )
        .join("");
      if (!teams.some((t) => norm(t) === norm(requested))) teamSel.value = teams[0] || "";
      render();
    } catch (e) {
      const meta = $("rm-meta");
      if (meta)
        meta.textContent =
          "Archive data is not available until the daily Cricsheet workflow completes.";
      $("rm-list").innerHTML =
        '<div class="rm-empty">Could not load the saved international archive. Please try again after the first workflow run.</div>';
    }
  }
  teamSel.addEventListener("change", render);
  formatSel.addEventListener("change", () => {
    if (index) {
      const current = teamSel.value;
      const teams = [
        ...new Set(
          index.matches.filter((m) => m.format === formatSel.value).flatMap((m) => m.teams || []),
        ),
      ].sort();
      teamSel.innerHTML = teams
        .map((t) => '<option value="' + esc(t) + '">' + esc(t) + "</option>")
        .join("");
      if (teams.some((t) => norm(t) === norm(current)))
        teamSel.value = teams.find((t) => norm(t) === norm(current));
      else teamSel.value = teams.includes("India") ? "India" : teams[0] || "";
      render();
    }
  });
  init();
})();
