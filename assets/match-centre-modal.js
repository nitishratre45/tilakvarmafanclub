(() => {
  "use strict";
  const dialog = document.getElementById("match-centre-dialog");
  const host = document.getElementById("match-centre-matches");
  if (!dialog || !host) return;
  const feedUrl = "/bcci-fixtures-test/bcci-live-scores.json";
  const scorecardUrl = "/bcci-fixtures-test/bcci-scorecard-page";
  let opener = null;
  let refreshTimer = 0;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const parseScore = (match, teamId, teamName) => {
    const innings = match?.summary?.innings;
    if (!Array.isArray(innings)) return "";
    const row = innings.find(x => String(x.batting_team_id) === String(teamId)) ||
      innings.find(x => String(x.batting_team_id) === String(teamName));
    return row ? String(row.runs ?? "—") + "/" + String(row.wickets ?? "—") + ' <small>(' + esc(row.overs ?? "—") + ')</small>' : "";
  };
  const statusKind = m => {
    const status = String(m.match_status || m.live_status_name || "").toLowerCase();
    if (status.includes("live") || status.includes("play") || status.includes("in progress")) return ["LIVE",""];
    if (status.includes("complete") || status.includes("result") || status.includes("finished")) return ["COMPLETED","is-completed"];
    return ["UPCOMING","is-upcoming"];
  };
  const renderMatch = m => {
    const teams = [
      {name:m.team1_name || m.team1_short_name || "Team 1", id:m.team1_id},
      {name:m.team2_name || m.team2_short_name || "Team 2", id:m.team2_id}
    ];
    const kind = statusKind(m);
    const score1 = parseScore(m, teams[0].id, teams[0].name);
    const score2 = parseScore(m, teams[1].id, teams[1].name);
    const when = m.start_datetime_utc ? new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(String(m.start_datetime_utc).replace(" ","T")+"Z")) : (m.end_date || "");
    const title = m.name || (teams[0].name + " vs " + teams[1].name);
    const result = m.result_string || m.status_text || m.venue || "";
    return '<article class="match-centre-card"><div class="match-centre-card-main"><div class="match-centre-meta"><span class="match-centre-status '+kind[1]+'">'+kind[0]+'</span><span>'+esc(m.class?.[0]?.name || "Cricket")+' · '+esc(when)+'</span></div><div class="match-centre-teams"><div class="match-centre-team"><div class="match-centre-team-name">'+esc(teams[0].name)+'</div><div class="match-centre-score">'+(score1 || "—")+'</div></div><span class="match-centre-vs">VS</span><div class="match-centre-team"><div class="match-centre-team-name">'+esc(teams[1].name)+'</div><div class="match-centre-score">'+(score2 || "—")+'</div></div></div>'+(result?'<p class="match-centre-result">'+esc(result)+'</p>':"")+'</div><a class="match-centre-scoreboard" href="'+scorecardUrl+'" aria-label="Open scoreboard for '+esc(title)+'"><span class="match-centre-scoreboard-icon" aria-hidden="true">▥</span><span>Scoreboard</span><span class="match-centre-scoreboard-arrow" aria-hidden="true">›</span></a></article>';
  };
  async function loadMatches() {
    try {
      const response = await fetch(feedUrl + "?t=" + Date.now(), {cache:"no-store"});
      if (!response.ok) throw new Error("Feed unavailable");
      const json = await response.json();
      const matches = json?.data?.live_scores || json?.live_scores || json?.data?.matches || json?.matches || [];
      if (!Array.isArray(matches) || !matches.length) {
        host.innerHTML = '<p class="match-centre-empty">No live matches are available right now. Open Matches to view the schedule.</p>';
        return;
      }
      const sorted = [...matches].sort((a,b) => {
        const live = m => statusKind(m)[0] === "LIVE" ? 0 : statusKind(m)[0] === "UPCOMING" ? 1 : 2;
        return live(a)-live(b);
      });
      host.innerHTML = sorted.slice(0,4).map(renderMatch).join("");
    } catch {
      host.innerHTML = '<p class="match-centre-empty">Live scores could not be loaded right now. Please try again shortly.</p>';
    }
  }
  function openDialog(event) {
    if (event) event.preventDefault();
    opener = event?.currentTarget || document.activeElement;
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden","false");
    document.body.classList.add("match-centre-lock");
    loadMatches();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (dialog.classList.contains("is-open")) loadMatches(); }, 60000);
    dialog.querySelector(".match-centre-close")?.focus();
  }
  function closeDialog() {
    dialog.classList.remove("is-open");
    dialog.setAttribute("aria-hidden","true");
    document.body.classList.remove("match-centre-lock");
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = 0;
    opener?.focus?.();
  }
  document.querySelectorAll(".match-centre-trigger").forEach(link => link.addEventListener("click", openDialog));
  dialog.querySelectorAll("[data-match-centre-close]").forEach(btn => btn.addEventListener("click", closeDialog));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && dialog.classList.contains("is-open")) closeDialog();
  });
})();
