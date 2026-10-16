(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const val = (o, ...keys) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return "—"; };
  const num = v => Number(v || 0);
  function table(title, rows, columns) {
    if (!Array.isArray(rows) || !rows.length) return '<p class="muted">No '+esc(title.toLowerCase())+' data in this snapshot.</p>';
    return '<h3 class="subhead">'+esc(title)+'</h3><div class="table-scroll"><table class="score-table"><thead><tr>'+columns.map(c=>'<th>'+esc(c.label)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+columns.map(c=>'<td>'+esc(typeof c.value === "function" ? c.value(row) : val(row,c.value))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function render(payload) {
    const data = payload?.data ?? payload;
    const innings = Array.isArray(data?.innings) ? data.innings : [];
    const teams = Array.isArray(data?.team) ? data.team : [];
    const teamName = id => {
      const team = teams.find(t => String(t.team_id) === String(id));
      return team?.name || team?.short_name || "Team";
    };
    const match = data?.match || payload?.match || {};
    const name = match.name || match.match_name || payload?.matchName || "BCCI Match Scorecard";
    $("title").textContent = name;
    $("meta").textContent = [match.comp_name || match.competition_name, match.ground_name, match.ground_city, payload?.fetchedAt ? "Snapshot: "+new Date(payload.fetchedAt).toLocaleString("en-IN") : ""].filter(Boolean).join(" · ");
    if (!innings.length) {
      $("scorecard").innerHTML = '<section class="innings"><h2>Scorecard data unavailable</h2><p class="muted">The latest saved BCCI JSON does not contain innings rows. Use Reload JSON after the workflow completes.</p></section>';
      return;
    }
    $("scorecard").innerHTML = innings.map((inn, idx) => {
      const batting = inn.batting || inn.batsman || inn.batsmen || [];
      const bowling = inn.bowling || inn.bowler || inn.bowlers || [];
      const teamId = inn.team_id || inn.batting_team_id;
      const totalRuns = val(inn,"total_runs","runs","score");
      const wickets = val(inn,"wickets","wicket");
      const overs = val(inn,"overs","overs_bowled");
      const extras = inn.extras;
      const extrasText = extras && typeof extras === "object" ? Object.entries(extras).map(([k,v])=>k+": "+v).join(" · ") : (extras ?? "");
      return '<section class="innings"><div class="inn-head"><div><p class="eyebrow">INNINGS '+(idx+1)+'</p><h2>'+esc(inn.team_name || teamName(teamId))+'</h2></div><div class="total">'+esc(totalRuns)+(wickets !== "—" ? "/"+esc(wickets) : "")+'</div></div><p class="muted innings-meta">'+(overs !== "—" ? esc(overs)+" overs" : "")+(extrasText ? " · Extras: "+esc(extrasText) : "")+'</p>'+
        table("Batting", batting, [
          {label:"Batter",value:r=>val(r,"known_as","player_name","name","batsman_name")},
          {label:"Dismissal",value:r=>val(r,"dismissal_str","dismissal","how_out")},
          {label:"R",value:r=>val(r,"runs","r")},
          {label:"B",value:r=>val(r,"balls_faced","balls","b")},
          {label:"4s",value:r=>val(r,"fours","four")},
          {label:"6s",value:r=>val(r,"sixes","six")},
          {label:"SR",value:r=>val(r,"strike_rate","sr")}
        ])+
        table("Bowling", bowling, [
          {label:"Bowler",value:r=>val(r,"known_as","player_name","name","bowler_name")},
          {label:"O",value:r=>val(r,"overs","overs_bowled")},
          {label:"M",value:r=>val(r,"maidens","maiden_overs")},
          {label:"R",value:r=>val(r,"conceded","runs_conceded","runs")},
          {label:"W",value:r=>val(r,"wickets","wkts")},
          {label:"Econ",value:r=>val(r,"bowling_economy_rate","economy","economy_rate")}
        ])+'</section>';
    }).join("");
  }
  async function load() {
    $("reload").disabled = true;
    $("status").textContent = "Loading saved BCCI scorecard…";
    try {
      const response = await fetch("./bcci-scorecard.json?t="+Date.now(), {cache:"no-store"});
      if (!response.ok) throw new Error("HTTP "+response.status+" while loading bcci-scorecard.json");
      const payload = await response.json();
      if (payload.status && payload.status !== "ok") throw new Error(payload.error || "BCCI snapshot status: "+payload.status);
      render(payload);
      $("status").textContent = "Snapshot loaded · HTTP "+(payload.httpStatus || response.status)+" · auto-refreshed by repository workflow";
    } catch (error) {
      $("status").textContent = "Could not load scorecard: "+error.message;
    } finally { $("reload").disabled = false; }
  }
  $("reload").addEventListener("click", load);
  load();
})();