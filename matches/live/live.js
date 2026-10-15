(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const first = (row, keys) => { for (const key of keys) if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim(); return ""; };
  function card(match) {
    const a = first(match, ["team1","team1_name","team1Name","homeTeam"]) || "Team 1";
    const b = first(match, ["team2","team2_name","team2Name","awayTeam"]) || "Team 2";
    const sa = first(match, ["score1","team1_score","team1Score","team1_scores","team_a_score","team1_innings"]);
    const sb = first(match, ["score2","team2_score","team2Score","team2_scores","team_b_score","team2_innings"]);
    const status = first(match, ["status","match_status","match_status_str","status_str","state"]) || "Live";
    const title = first(match, ["match","match_name","matchName","title","match_title","series","series_name"]);
    const venue = first(match, ["venue","venue_name","ground_name"]);
    return '<article class="live-card"><div class="live-card-head"><span>'+esc(venue || "BCCI live match")+'</span><span class="live-badge">LIVE</span></div>'+(title?'<div class="live-title">'+esc(title)+'</div>':'')+'<div class="live-teams"><span class="team-name">'+esc(a)+'</span><strong class="team-score">'+esc(sa || "Score updating")+'</strong><span class="team-name">'+esc(b)+'</span><strong class="team-score">'+esc(sb || "—")+'</strong></div><div class="live-status">'+esc(status)+'</div></article>';
  }
  async function load() {
    const host=$("live-grid"), button=$("live-refresh");
    if(button) button.disabled=true;
    try {
      const response=await fetch("/matches/live/live-matches.json?v="+Date.now(),{cache:"no-store"});
      if(!response.ok) throw new Error("Saved live JSON returned HTTP "+response.status);
      const data=await response.json();
      const matches=Array.isArray(data.matches)?data.matches:[];
      $("live-count").textContent=matches.length+" live match"+(matches.length===1?"":"es");
      const updated=data.checkedAt?new Date(data.checkedAt):null;
      $("live-updated").textContent="Snapshot: "+(updated&&!Number.isNaN(updated.getTime())?updated.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"not available");
      host.innerHTML=matches.length?matches.map(card).join(""):'<div class="live-empty"><div><strong>No live matches right now</strong>Only confirmed live matches appear here. Upcoming fixtures are in Match Centre.</div></div>';
    } catch(error) {
      host.innerHTML='<div class="live-empty"><div><strong>Live snapshot unavailable</strong>The saved BCCI JSON could not be loaded. Try again shortly.</div></div>';
      $("live-count").textContent="Feed unavailable";
      console.error("Live match load failed:",error);
    } finally { if(button) button.disabled=false; }
  }
  $("live-refresh")?.addEventListener("click",load);
  load();
})();
