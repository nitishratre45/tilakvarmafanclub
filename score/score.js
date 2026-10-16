(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>Number.parseInt(v??0,10)||0;
function table(headers,rows){return '<div class="table-scroll"><table class="score-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>'}
function render(payload){
const d=payload?.data??payload, m=d?.match;
if(!m||!Array.isArray(d.innings)) throw new Error(payload?.error||"score.json does not contain BCCI match innings.");
const teams=new Map((d.team||[]).map(t=>[String(t.team_id),t]));
const players=new Map();(d.team||[]).forEach(t=>(t.player||[]).forEach(p=>players.set(String(p.player_id),p.known_as||p.name||p.short_name||("Player "+p.player_id))));
$("title").textContent=[m.team1_name||teams.get(String(m.home_team_id))?.name||"Team 1","vs",m.team2_name||teams.get(String(m.away_team_id))?.name||"Team 2"].join(" ");
$("meta").textContent=[m.name||m.title,m.date_string||m.start_date,m.ground_name].filter(Boolean).join(" · ")+" · Snapshot "+(payload.fetchedAt||"time unavailable");
$("status").textContent=(m.result_string||m.match_situation_str||m.match_status||"Scorecard loaded")+" · HTTP "+(payload.httpStatus??"—");
$("scorecard").innerHTML=d.innings.map((inn,i)=>{
const team=teams.get(String(inn.batting_team_id));
const batting=(inn.batting||[]).slice().sort((a,b)=>num(a.batting_position)-num(b.batting_position)).map(p=>'<tr><td><b>'+esc(players.get(String(p.player_id))||p.player_id)+'</b></td><td>'+esc(p.dismissal_str||(p.is_out==="1"?p.dismissal_name:"not out"))+'</td><td><b>'+num(p.runs)+'</b></td><td>'+num(p.balls_faced)+'</td><td>'+num(p.fours)+'</td><td>'+num(p.sixes)+'</td><td>'+esc(p.strike_rate)+'</td></tr>');
const bowling=(inn.bowling||[]).slice().sort((a,b)=>num(a.bowling_position)-num(b.bowling_position)).map(p=>'<tr><td><b>'+esc(players.get(String(p.player_id))||p.player_id)+'</b></td><td>'+esc(p.overs)+'</td><td>'+num(p.maidens)+'</td><td>'+num(p.conceded)+'</td><td>'+num(p.wickets)+'</td><td>'+esc(p.bowling_economy_rate)+'</td></tr>');
const fow=(inn.fow||[]).filter(x=>x.fow_type==="out").map(x=>num(x.fow_runs)+"/"+num(x.fow_wickets)+" ("+(players.get(String(x.out_player_id))||x.out_player_id)+", "+esc(x.fow_overs)+" ov)").join(" · ");
return '<section class="innings"><div class="inn-head"><div><h2>Innings '+esc(inn.innings_number||i+1)+' · '+esc(team?.name||"Team")+'</h2><span class="muted">Batting scorecard</span></div><div class="total">'+num(inn.runs)+'/'+num(inn.wickets)+' <small>('+esc(inn.overs||inn.over_limit||"—")+' ov)</small></div></div><h3 class="subhead">Batting</h3>'+table(["Batter","Dismissal","R","B","4s","6s","SR"],batting)+'<h3 class="subhead">Bowling</h3>'+table(["Bowler","O","M","R","W","Econ"],bowling)+'<p class="extras"><b>Extras:</b> '+num(inn.extras)+' (b '+num(inn.byes)+', lb '+num(inn.legbyes)+', wd '+num(inn.wides)+', nb '+num(inn.noballs)+')</p>'+(fow?'<p class="fow"><b>Fall of wickets:</b> '+esc(fow)+'</p>':'')+'</section>';
}).join("");
}
async function load(){ $("status").textContent="Loading score.json…";try{const r=await fetch("./score.json?t="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("score.json request failed (HTTP "+r.status+")");const j=await r.json();render(j)}catch(e){$("status").textContent="Scorecard load failed: "+e.message;$("scorecard").innerHTML=""}}
$("reload").addEventListener("click",load);load();
})();