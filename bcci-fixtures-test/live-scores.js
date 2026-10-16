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
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function extract(p) {
    const d=p?.data??p;
    if(Array.isArray(d?.match))return d.match;
    if(Array.isArray(d?.live_scores))return d.live_scores;
    if(Array.isArray(d?.data?.match))return d.data.match;
    if(Array.isArray(d?.matches))return d.matches;
    if(Array.isArray(d))return d;
    return [];
  }
  function render(matches) {
    if(!matches.length){list.innerHTML='<p class="loading-state">Live JSON mein abhi matches nahi hain.</p>';return;}
    list.innerHTML=matches.map(m=>{
      const a=m.team1_name||m.home_team_name||"Team 1";
      const b=m.team2_name||m.away_team_name||"Team 2";
      const innings=Array.isArray(m.summary?.innings)?m.summary.innings:[];
      const latest=[...innings].reverse().find(i=>Number(i.balls||0)>0||Number(i.runs||0)>0||Number(i.wickets||0)>0);
      const battingId=latest?.batting_team_id;
      const battingName=String(battingId)===String(m.team1_id)?a:String(battingId)===String(m.team2_id)?b:"";
      const score=latest?String(latest.runs??0)+(latest.wickets!=null?"/"+latest.wickets:""):"";
      const overs=latest?.overs!=null?String(latest.overs):"";
      const statusText=m.live_status_name||m.match_status||"Live";
      // BCCI live_scores payload does not include team-logo URLs, so use PNG country-flag
      // images as a reliable visual fallback for these national teams.
      const logoFor = (name, abbr) => {
        const key = String(abbr || name || "").toLowerCase();
        if (key.includes("ind") || /india/i.test(name || "")) return "https://flagcdn.com/w160/in.png";
        if (key.includes("zim") || /zimbabwe/i.test(name || "")) return "https://flagcdn.com/w160/zw.png";
        return "";
      };
      const logoA=logoFor(a,m.team1_abbreviation), logoB=logoFor(b,m.team2_abbreviation);
      const logoMarkup=(src,team)=>src
        ? '<img class="live-team-logo" src="'+esc(src)+'" alt="'+esc(team)+' flag" loading="lazy" decoding="async" onerror="this.hidden=true">'
        : '<span class="live-team-badge">'+esc((team.match(/\\b\\w/g)||["T"]).join("").slice(0,3))+'</span>';
      const need=m.result_string||"";
      const isYetToBat=innings.length>1&&!Number(innings[1]?.balls||0)&&!Number(innings[1]?.runs||0);
      const date=m.start_datetime_utc||m.start_date||m.date_string||"";
      return '<article class="live-score-card">'+
        '<div class="live-card-status"><span>'+esc(statusText)+'</span>'+(need?'<strong>'+esc(need)+'</strong>':"")+'</div>'+
        '<div class="live-card-main">'+
          '<div class="live-team">'+logoMarkup(logoA,a)+'<strong>'+esc(a)+'</strong>'+(battingName===a&&score?'<small>Batting</small>':"")+'</div>'+
          '<div class="live-versus">VS</div>'+
          '<div class="live-team live-team-right">'+logoMarkup(logoB,b)+'<strong>'+esc(b)+'</strong>'+(battingName===b&&score?'<small>Batting</small>':"")+'</div>'+
        '</div>'+
        '<div class="live-score-strip"><div class="live-batting-name">'+esc(battingName||"Current innings")+'</div><div class="live-score-value">'+(isYetToBat?'<span class="live-yet">Yet to bat</span>':score?'<strong>'+esc(score)+'</strong>': '<span class="live-yet">Score unavailable</span>')+(overs?'<span class="live-overs">🏏 '+esc(overs)+' ov</span>':"")+'</div></div>'+
        '<div class="live-card-footer"><div><strong>'+esc(m.primary_event_name||m.comp_name||"Cricket")+'</strong><span>'+esc(m.match_round||m.name||"")+'</span><span>'+esc(m.ground_name||m.ground_city||"Venue TBA")+'</span></div><time>'+esc(date)+'</time></div>'+
      '</article>';
    }).join("");
  }
  async function load(){
    refresh.disabled=true;status.textContent="Loading separate live-scores JSON…";
    try{
      const res=await fetch("./bcci-live-scores.json?t="+Date.now(),{cache:"no-store"});
      if(!res.ok)throw new Error("HTTP "+res.status);
      const p=await res.json();
      if(p.status==="error")throw new Error(p.error||"Latest workflow fetch failed");
      const matches=extract(p);render(matches);
      status.textContent="JSON snapshot: "+(p.fetchedAt?new Date(p.fetchedAt).toLocaleString():"time unavailable")+" · "+matches.length+" matches";
    }catch(e){status.textContent="Live JSON load failed: "+e.message;list.innerHTML='<p class="loading-state">Run the BCCI Live Scores workflow to refresh bcci-live-scores.json.</p>';}
    finally{refresh.disabled=false;}
  }
  refresh.addEventListener("click",load);load();window.setInterval(load,60000);
})();