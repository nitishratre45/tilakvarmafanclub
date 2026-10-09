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
  milestones();analytics();poll();links();quiz();
 }catch(e){console.error(e);["milestone-grid","analytics-grid"].forEach(id=>{if($(id))$(id).textContent="Data unavailable. Please try again later.";});}
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
 const updated=$("fan-zone-updated");if(updated)updated.textContent="Last update: "+(fan.updatedAt||site.lastUpdated||"time unavailable")+" · Stats last checked: "+(site.lastUpdated||"time unavailable")+" · Automatic refresh runs every 12 hours.";
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

init();
})();