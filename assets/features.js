(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let site={},fan={},rows=[];
const num=r=>typeof r.runs==="number"&&Number.isFinite(r.runs)?r.runs:null;
async function init(){
 try{
  const a=await fetch("data/site-data.json",{cache:"no-store"}),b=await fetch("data/fan-zone.json",{cache:"no-store"});
  if(!a.ok)throw Error("Stats feed unavailable");
  site=await a.json();fan=b.ok?await b.json():{};rows=Array.isArray(site.recentInnings)?site.recentInnings:[];
  explorer();milestones();analytics();poll();links();quiz();
 }catch(e){console.error(e);["explorer-table","milestone-grid","analytics-grid"].forEach(id=>{if($(id))$(id).textContent="Data unavailable. Please try again later.";});}
}
function explorer(){
 const f=$("explorer-format"),o=$("explorer-opponent");if(!f||!o)return;
 f.innerHTML='<option value="all">All formats</option>'+[...new Set(rows.map(r=>r.format).filter(Boolean))].sort().map(x=>'<option>'+esc(x)+'</option>').join("");
 o.innerHTML='<option value="all">All opponents</option>'+[...new Set(rows.map(r=>r.opposition).filter(Boolean))].sort().map(x=>'<option>'+esc(x)+'</option>').join("");
 const render=()=>{
  const q=$("explorer-query").value.toLowerCase().trim(),data=rows.filter(r=>(f.value==="all"||r.format===f.value)&&(o.value==="all"||r.opposition===o.value)&&(!q||(r.date+" "+r.opposition+" "+r.format).toLowerCase().includes(q))),scored=data.filter(r=>num(r)!==null),total=scored.reduce((s,r)=>s+num(r),0),max=Math.max(1,...scored.map(num));
  $("explorer-summary").innerHTML=[["INNINGS SHOWN",data.length],["RUNS",total],["AVG / SCORED INNINGS",scored.length?(total/scored.length).toFixed(1):"—"],["TOP SCORE",scored.length?max:"—"]].map(x=>'<div class="explorer-metric"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>').join("");
  $("explorer-table").innerHTML=data.length?data.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.format||"—")+'</td><td>'+esc(r.opposition)+'</td><td>'+esc(r.runs)+'</td><td>'+esc(r.balls)+'</td><td>'+esc(r.strikeRate??"—")+'</td></tr>').join(""):'<tr><td colspan="6" class="empty">No innings match these filters.</td></tr>';
  $("explorer-chart").innerHTML=scored.length?'<div class="bar-chart">'+scored.slice(0,10).reverse().map(r=>'<div class="bar-row"><span>'+esc(r.date)+' · '+esc(r.opposition)+'</span><div class="bar-track"><i style="width:'+Math.max(2,num(r)/max*100)+'%"></i></div><b>'+num(r)+'</b></div>').join("")+'</div>':'<p class="feature-note">No numeric innings available for the chart.</p>';
 };
 [f,o].forEach(x=>x.addEventListener("change",render));$("explorer-query").addEventListener("input",render);render();
}
function milestones(){
 const host=$("milestone-grid");if(!host)return;const t=site.careerFormats?.T20I||site.careerStats||{},runs=Number(t.runs??site.careerStats?.t20iRuns),fifties=Number(t.fifties??site.careerStats?.fifties),hundreds=Number(t.hundreds??site.careerStats?.hundreds),list=[];
 if(Number.isFinite(runs)&&runs>=0)[2000,2500,3000].filter(n=>n>runs).slice(0,2).forEach(n=>list.push({name:n.toLocaleString("en-IN")+" T20I runs",v:runs,t:n,u:"runs"}));
 if(Number.isFinite(fifties)&&fifties>=0)list.push({name:"Next T20I fifty",v:fifties,t:fifties+1,u:"50+ scores"});
 if(Number.isFinite(hundreds)&&hundreds>=0)list.push({name:"Next T20I hundred",v:hundreds,t:hundreds+1,u:"centuries"});
 host.innerHTML=list.map(m=>'<article class="milestone-card"><span class="feature-eyebrow">CAREER TARGET</span><h3>'+esc(m.name)+'</h3><div class="milestone-values"><strong>'+m.v+'</strong><span>of '+m.t+' '+m.u+'</span></div><div class="milestone-track"><i style="width:'+Math.min(100,m.v/m.t*100)+'%"></i></div><p>'+(m.t-m.v)+' '+m.u+' to target</p><small>Stored stats only · not a prediction</small></article>').join("");
}
function analytics(){
 const scored=rows.filter(r=>num(r)!==null),total=scored.reduce((s,r)=>s+num(r),0),sixes=scored.reduce((s,r)=>s+Number(r.sixes||0),0),host=$("analytics-grid");if(!host)return;
 host.innerHTML=[["SCORED INNINGS",scored.length],["RUNS IN LISTED INNINGS",total],["AVERAGE / INNINGS",scored.length?(total/scored.length).toFixed(1):"—"],["SIXES RECORDED",sixes]].map(x=>'<article class="analytics-metric"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></article>').join("");
 $("analytics-count").textContent=scored.length+" numeric innings · "+rows.length+" total rows";
 const max=Math.max(1,...scored.map(num));$("analytics-chart").innerHTML=scored.length?'<div class="bar-chart analytics-bars">'+scored.slice(0,12).reverse().map(r=>'<div class="bar-row"><span>'+esc(r.date)+' · '+esc(r.opposition)+'</span><div class="bar-track"><i style="width:'+Math.max(2,num(r)/max*100)+'%"></i></div><b>'+num(r)+'</b></div>').join("")+'</div>':'<p class="feature-note">No verified numeric innings are available.</p>';
}
function poll(){
 if(!fan.poll||!$("fan-poll-form"))return;const p=fan.poll,opts=p.options||[],key="tilakfc-poll-"+(p.id||"current");$("poll-question").textContent=p.question||"Choose your favourite format";
 let counts={};try{counts=JSON.parse(localStorage.getItem(key)||"{}");}catch{}
 $("poll-options").innerHTML=opts.map((x,i)=>'<label class="poll-option"><input type="radio" name="fan-poll" value="'+i+'" '+(!i?"checked":"")+'><span>'+esc(x)+'</span></label>').join("");
 const show=()=>{const sum=Object.values(counts).reduce((a,b)=>a+Number(b||0),0);$("poll-results").innerHTML=opts.map((x,i)=>{const n=Number(counts[i]||0);return '<div class="poll-result"><div><span>'+esc(x)+'</span><b>'+(sum?Math.round(n/sum*100):0)+'%</b></div><div class="poll-track"><i style="width:'+(sum?n/sum*100:0)+'%"></i></div></div>';}).join("")+'<small>'+sum+' votes on this browser only</small>';};
 $("fan-poll-form").addEventListener("submit",e=>{e.preventDefault();const v=document.querySelector('input[name="fan-poll"]:checked');if(!v)return;counts[v.value]=Number(counts[v.value]||0)+1;try{localStorage.setItem(key,JSON.stringify(counts));}catch{}show();});show();
}
function links(){const host=$("fan-links");if(!host)return;host.innerHTML=(fan.gallery||[]).map(x=>'<a class="fan-link" href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer"><span>'+esc(x.type||"RESOURCE")+'</span><strong>'+esc(x.title)+'</strong><small>'+esc(x.description||"Open source")+'</small>↗</a>').join("")||host.innerHTML;}
function quiz(){
 const form=$("fan-quiz-form"),host=$("quiz-options");if(!form||!host)return;
 const questions=Array.isArray(fan.quiz)?fan.quiz.filter(q=>q&&q.question&&Array.isArray(q.options)&&q.options.length):[];
 const updated=$("fan-zone-updated");if(updated)updated.textContent="Fan Zone content updated: "+(fan.updatedAt||"date not recorded")+" · reload page for the latest version.";
 if(!questions.length){$("quiz-question").textContent="Quiz is taking a break";host.innerHTML='<p class="feature-note">No quiz questions are available yet.</p>';return;}
 let index=0,score=0,answered=false;
 const render=()=>{
  answered=false;const q=questions[index];$("quiz-question").textContent=q.question;
  host.innerHTML=q.options.map((option,i)=>'<label class="poll-option"><input type="radio" name="fan-quiz-answer" value="'+i+'" '+(!i?"checked":"")+'><span>'+esc(option)+'</span></label>').join("");
  const button=form.querySelector('button[type="submit"]');button.textContent="CHECK ANSWER ↗";
  $("quiz-feedback").textContent="Question "+(index+1)+" of "+questions.length+" · Score "+score;
 };
 form.addEventListener("submit",e=>{
  e.preventDefault();const button=form.querySelector('button[type="submit"]');
  if(answered){index=(index+1)%questions.length;render();return;}
  const selected=form.querySelector('input[name="fan-quiz-answer"]:checked');if(!selected)return;
  const q=questions[index],correct=Number(selected.value)===Number(q.answer);if(correct)score++;
  answered=true;$("quiz-feedback").textContent=(correct?"Correct! ":"Not quite. ")+(q.explanation||"")+" · Score "+score;
  button.textContent=index===questions.length-1?"PLAY AGAIN ↻":"NEXT QUESTION ↗";
 });
 render();
}

function drawPoster(){
 const c=$("poster-canvas"),ctx=c?.getContext("2d");if(!ctx)return;const pal={india:["#f7f8fc","#ff9933","#138808","#10264b"],blue:["#eaf4ff","#1765bd","#071b48","#f7fbff"],dark:["#06101f","#ff6a35","#122b49","#f5f7fb"]},p=pal[$("poster-theme").value]||pal.india,[bg,a,b,ink]=p;
 ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);if($("poster-theme").value==="india"){ctx.fillStyle=a;ctx.fillRect(0,0,c.width,c.height*.23);ctx.fillStyle="#fff";ctx.fillRect(0,c.height*.23,c.width,c.height*.54);ctx.fillStyle=b;ctx.fillRect(0,c.height*.77,c.width,c.height*.23);}else{ctx.fillStyle=a;ctx.fillRect(0,0,c.width,30);ctx.fillStyle=b;ctx.fillRect(0,c.height-32,c.width,32);}
 ctx.fillStyle=$("poster-theme").value==="india"?"#07101f":ink;ctx.font="bold 38px Arial";ctx.fillText("THE 72 CLUB",74,100);ctx.globalAlpha=.12;ctx.font="900 520px Arial";ctx.fillText("72",360,800);ctx.globalAlpha=1;
 ctx.fillStyle=$("poster-theme").value==="india"?"#10264b":ink;ctx.font="900 110px Arial";const words=($("poster-title").value||"TILAK VARMA").toUpperCase().split(/\s+/);let lines=[],line="";words.forEach(w=>{const test=line?line+" "+w:w;if(ctx.measureText(test).width>900&&line){lines.push(line);line=w;}else line=test;});if(line)lines.push(line);let y=500;lines.slice(0,3).forEach(w=>{ctx.fillText(w,74,y);y+=124;});
 ctx.fillStyle=$("poster-theme").value==="india"?"#ff6a35":a;ctx.fillRect(74,y+30,180,10);ctx.fillStyle=$("poster-theme").value==="india"?"#10264b":ink;ctx.font="500 38px Arial";ctx.fillText(($("poster-subtitle").value||"TILAK VARMA · INDIA · 72").slice(0,46),74,y+112);ctx.font="bold 24px Arial";ctx.fillText("FAN-MADE TRIBUTE · NOT AN OFFICIAL TEAM POSTER",74,c.height-72);$("poster-status").textContent="Preview updated · 1080 × 1350 PNG.";
}
$("poster-render")?.addEventListener("click",drawPoster);["poster-title","poster-subtitle","poster-theme"].forEach(id=>$(id)?.addEventListener("input",drawPoster));
$("poster-download")?.addEventListener("click",()=>{const c=$("poster-canvas");if(!c)return;drawPoster();const a=document.createElement("a");a.download="tilak-varma-fan-poster-1080x1350.png";a.href=c.toDataURL("image/png");a.click();});
drawPoster();init();
})();