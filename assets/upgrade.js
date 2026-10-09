(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let rows=[],site={};
const safeNum=v=>typeof v==="number"&&Number.isFinite(v)?v:null;
async function start(){
 try{
  const res=await fetch("data/site-data.json",{cache:"no-store"});if(!res.ok)throw Error("Saved data unavailable");
  site=await res.json();rows=Array.isArray(site.recentInnings)?site.recentInnings:[];
  dashboard();moments();
 }catch(e){if($("dashboard-cards"))$("dashboard-cards").innerHTML='<article class="upgrade-card"><h3>Data unavailable</h3><p>Could not load the saved site snapshot. Try refreshing the page later.</p></article>';if($("moments-grid"))$("moments-grid").textContent="Saved innings could not be loaded.";}
}
function dashboard(){
 const host=$("dashboard-cards");if(!host)return;
 const t=site.careerFormats?.T20I||site.careerStats||{};
 const runs=t.runs??site.careerStats?.t20iRuns??"—",avg=t.average??site.careerStats?.average??"—",sr=t.strikeRate??site.careerStats?.strikeRate??"—";
 const scored=rows.filter(r=>safeNum(r.runs)!==null),sum=scored.reduce((n,r)=>n+r.runs,0),best=scored.reduce((b,r)=>!b||r.runs>b.runs?r:b,null);
 const cards=[["T20I CAREER RUNS",Number.isFinite(Number(runs))?Number(runs).toLocaleString("en-IN"):runs,"Saved career snapshot"],["BATTING AVERAGE",avg,"T20 International"],["STRIKE RATE",sr,"T20 International"],["BEST IN LOADED INNINGS",best?best.runs+" runs":"—",best?(best.date+" · "+best.opposition):"No numeric innings available"]];
 host.innerHTML=cards.map(c=>'<article class="upgrade-card"><span class="feature-eyebrow">'+esc(c[0])+'</span><strong>'+esc(c[1])+'</strong><h3>'+esc(c[2])+'</h3></article>').join("");
 const formatHost=$("format-snapshot"),formats=site.careerFormats||{};
 if(formatHost){const order=["T20I","ODI","IPL","First-class","List A"];formatHost.innerHTML='<div class="format-snapshot-head"><span class="feature-eyebrow">CAREER BY FORMAT</span><span>Saved snapshot</span></div><div class="format-snapshot-grid">'+order.filter(k=>formats[k]).map(k=>'<article class="format-snapshot-card"><span>'+esc(k.toUpperCase())+'</span><strong>'+esc(Number(formats[k].runs||0).toLocaleString("en-IN"))+'</strong><small>RUNS</small><p>HS '+esc(formats[k].highestScore??"—")+' · AVG '+esc(formats[k].average??"—")+'</p></article>').join("")+'</div>';}
 const last=site.lastChecked||site.lastUpdated||"not recorded";const freshness=$("dashboard-freshness");
 if(freshness)freshness.textContent="Saved data checked: "+last+" · "+scored.length+" numeric innings loaded ("+sum+" runs across listed rows)";
}
function moments(){
 const host=$("moments-grid");if(!host)return;
 const render=()=>{
  const q=($("moments-filter")?.value||"").trim().toLowerCase();
  const items=rows.filter(r=>(String(r.date||"")+" "+String(r.opposition||"")+" "+String(r.format||"")).toLowerCase().includes(q)).sort((a,b)=>(safeNum(b.runs)??-1)-(safeNum(a.runs)??-1)).slice(0,18);
  host.innerHTML=items.length?items.map(r=>'<article class="moment-card"><span class="feature-eyebrow">STORED INNINGS</span><div class="moment-score">'+esc(r.runs??"—")+(r.notOut?"*":"")+'</div><h3>'+esc(r.opposition||"Opposition not listed")+'</h3><div class="moment-meta">'+esc(r.date||"Date not listed")+' · '+esc(r.format||"Format not listed")+'</div><div class="moment-tags"><span>'+esc(r.balls??"—")+' BALLS</span><span>SR '+esc(r.strikeRate??"—")+'</span><span>'+esc(r.fours??"—")+' × 4</span><span>'+esc(r.sixes??"—")+' × 6</span></div></article>').join(""):'<p class="activity-empty">No stored innings match that search.</p>';
 };
 $("moments-filter")?.addEventListener("input",render);render();
}
$("moment-share")?.addEventListener("click",async()=>{
 const text="The 72 Club — an independent fan-made celebration of Tilak Varma. "+location.origin+"/";
 if(navigator.share){try{await navigator.share({title:"The 72 Club",text,url:location.origin+"/"});return;}catch(e){if(e.name==="AbortError")return;}}
 try{await navigator.clipboard.writeText(text);$("moment-share").textContent="LINK COPIED ✓";}catch(e){window.prompt("Copy The 72 Club link",location.origin+"/");}
});
function streak(){
 const key="the72-fan-checkins-v1",count=$("fan-streak-count"),msg=$("fan-streak-message"),btn=$("fan-checkin");if(!count||!msg||!btn)return;
 const today=new Date(),day=today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
 let state={last:"",streak:0};try{state=JSON.parse(localStorage.getItem(key)||'{"last":"","streak":0}');}catch(e){}
 const prev=new Date(today);prev.setDate(prev.getDate()-1);const yesterday=prev.getFullYear()+"-"+String(prev.getMonth()+1).padStart(2,"0")+"-"+String(prev.getDate()).padStart(2,"0");
 if(state.last!==day&&state.last!==yesterday)state.streak=0;
 const draw=()=>{count.textContent=(state.streak||0)+" DAY"+(state.streak===1?"":"S");msg.textContent=state.last===day?"Checked in today. Come back tomorrow to keep the streak going.":state.streak?"You're on a roll — check in today to continue.":"Your fan streak starts with one check-in.";btn.disabled=state.last===day;btn.textContent=state.last===day?"CHECKED IN ✓":"CHECK IN TODAY ↗";};
 btn.addEventListener("click",()=>{if(state.last===day)return;state.streak=state.last===yesterday?(state.streak||0)+1:1;state.last=day;try{localStorage.setItem(key,JSON.stringify(state));}catch(e){msg.textContent="Browser storage is unavailable; this check-in may not persist.";return;}draw();});draw();
}
start();streak();
})();