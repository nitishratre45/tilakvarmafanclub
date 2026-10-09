(function(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=v=>typeof v==="number"?v.toLocaleString("en-IN",{maximumFractionDigits:2}):(v??"—");
  const titles={batting:"Batting career summary",innings:"Batting innings list",highscores:"High scores",bowling:"Bowling career summary",bowlinglist:"Bowling innings list",bestbowling:"Best innings bowling",bestmatchbowling:"Best match bowling",bowlingmatches:"Bowling match list",bowlingseries:"Bowling series averages",fielding:"Fielding career summary",fieldinglist:"Fielding innings list",catches:"Most catches in an innings",fieldingseries:"Fielding series statistics",series:"Batting series averages",matches:"T20I match list"};
  const formatOrder=["T20I","ODI","T20"];
  let selectedFormat="T20I",selectedCategory="batting",data=null;
  function metric(label,value){return '<div class="statsguru-metric"><span>'+esc(label.toUpperCase())+'</span><strong>'+esc(fmt(value))+'</strong></div>';}
  function rowsTable(rows,headers,render){
    $("statsguru-thead").innerHTML="<tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
    $("statsguru-tbody").innerHTML=rows.length?rows.map(render).join(""):'<tr><td colspan="'+headers.length+'" class="empty">No verified ESPNcricinfo Statsguru rows are available for this format yet. The last saved source snapshot is kept when ESPNcricinfo is unavailable.</td></tr>';
  }
  function sourceData(){
    const sg=data&&data.statsguru;
    const formats=sg&&sg.formats||{};
    if(selectedFormat==="All"){
      const all=["T20","ODI"].flatMap(fmt=>(formats[fmt]&&Array.isArray(formats[fmt].innings)?formats[fmt].innings:[]));
      const parts=["T20","ODI"].map(fmt=>formats[fmt]&&formats[fmt].summary).filter(Boolean);
      const sum=key=>parts.reduce((n,part)=>n+(typeof part[key]==="number"?part[key]:0),0);
      const runs=sum("runs"),balls=sum("balls"),innings=sum("innings"),notOuts=sum("notOuts");
      const best=parts.map(part=>({value:Number.parseInt(String(part.highestScore||"").replace(/[^0-9]/g,""),10)||0,text:part.highestScore})).sort((a,b)=>b.value-a.value)[0];
      const summary=parts.length?{
        matches:sum("matches"),innings,notOuts,runs,highestScore:best?.text||"—",
        average:innings>notOuts?Math.round((runs/(innings-notOuts))*100)/100:null,
        balls,strikeRate:balls?Math.round((runs*100/balls)*100)/100:null,
        hundreds:sum("hundreds"),fifties:sum("fifties"),fours:sum("fours"),sixes:sum("sixes")
      }:null;
      const breakdown=["T20","ODI"].flatMap(fmt=>(formats[fmt]&&Array.isArray(formats[fmt].careerBreakdown)?formats[fmt].careerBreakdown:[]));
      return {summary,innings:all,breakdown,formats};
    }
    const entry=formats[selectedFormat]||{};
    return {summary:entry.summary||null,innings:Array.isArray(entry.innings)?entry.innings:[],breakdown:Array.isArray(entry.careerBreakdown)?entry.careerBreakdown:[],formats};
  }
  function sortDate(v){
    const s=String(v||"");
    const parsed=Date.parse(s);
    return Number.isNaN(parsed)?0:parsed;
  }
  function render(){
    if(!data)return;
    const sg=data.statsguru||{}, source=sourceData(), rows=source.innings.slice();
    $("statsguru-updated").textContent="ESPNcricinfo Statsguru · "+(sg.updatedAt||"waiting for first successful source refresh");
    const sourceLink=sg.sourceUrl&&/^https:\/\//i.test(sg.sourceUrl)?' · <a href="'+esc(sg.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Open source ↗</a>':"";
    $("statsguru-updated").innerHTML=esc("ESPNcricinfo Statsguru · "+(sg.updatedAt||"waiting for first successful source refresh"))+sourceLink;
    $("statsguru-format-label").textContent=selectedFormat==="T20"?"T20 · all competitions":selectedFormat;
    $("statsguru-title").textContent=titles[selectedCategory]||"Statsguru analysis";
    $("statsguru-eyebrow").textContent=selectedCategory==="batting"?"CAREER OVERVIEW":selectedCategory.toUpperCase()+" · "+selectedFormat.toUpperCase();
    document.querySelectorAll("[data-sg-format]").forEach(b=>b.classList.toggle("active",b.dataset.sgFormat===selectedFormat));
    document.querySelectorAll("[data-sg-category]").forEach(b=>b.classList.toggle("active",b.dataset.sgCategory===selectedCategory));
    const summary=source.summary;
    const summaryHost=$("statsguru-summary");
    if(selectedCategory==="batting"){
      const values=summary?[
        ["MATCHES",summary.matches],["INNINGS",summary.innings],["NOT OUTS",summary.notOuts],["RUNS",summary.runs],
        ["HIGHEST",summary.highestScore],["AVERAGE",summary.average],["BALLS FACED",summary.balls],
        ["STRIKE RATE",summary.strikeRate],["HUNDREDS",summary.hundreds],["FIFTIES",summary.fifties],
        ["FOURS",summary.fours],["SIXES",summary.sixes]
      ]:[["SOURCE","ESPNcricinfo"],["CAREER SUMMARY","Awaiting source data"]];
      summaryHost.innerHTML=values.map(x=>metric(x[0],x[1])).join("");
      const breakdown=Array.isArray(source.breakdown)?source.breakdown:[];
      if(breakdown.length){
        rowsTable(breakdown,["GROUP / FILTER","SPAN","MATCHES","INNINGS","NOT OUT","RUNS","HIGH SCORE","AVERAGE","BALLS","STRIKE RATE","100s","50s","DUCKS","4s","6s"],r=>"<tr>"+
          [r.group,r.span,r.matches,r.innings,r.notOuts,r.runs,r.highestScore,r.average,r.balls,r.strikeRate,r.hundreds,r.fifties,r.ducks,r.fours,r.sixes].map(v=>"<td>"+esc(fmt(v)) +"</td>").join("")+"</tr>");
      }else{
        const fallback=rows.slice().sort((a,b)=>sortDate(b.date)-sortDate(a.date));
        rowsTable(fallback,["DATE","SCORE","OPPOSITION","GROUND","WICKETS","CT / ST","SCORECARD"],r=>{
          const match=r.matchUrl&&/^https:\/\//i.test(r.matchUrl)?'<a href="'+esc(r.matchUrl)+'" target="_blank" rel="noopener noreferrer">Open ↗</a>':"—";
          return "<tr><td>"+esc(r.date)+"</td><td>"+esc(r.score)+"</td><td>"+esc(r.opposition)+"</td><td>"+esc(r.ground)+"</td><td>"+esc(r.wickets)+"</td><td>"+esc((r.catches??"—")+" / "+(r.stumpings??"—"))+"</td><td>"+match+"</td></tr>";
        });
      }
    }else if(["innings","highscores","matches","series"].includes(selectedCategory)){
      if(selectedCategory==="highscores")rows.sort((a,b)=>(typeof b.runs==="number"?b.runs:-1)-(typeof a.runs==="number"?a.runs:-1));
      else rows.sort((a,b)=>sortDate(b.date)-sortDate(a.date));
      const listedRuns=rows.reduce((sum,row)=>sum+(typeof row.runs==="number"?row.runs:0),0);
      const best=rows.reduce((result,row)=>typeof row.runs==="number"&&(!result||row.runs>result.runs)?row:result,null);
      summaryHost.innerHTML=[
        metric("MATCHES / ROWS",rows.length),metric("RUNS IN SCORED ROWS",listedRuns),
        metric("BEST LISTED SCORE",best?best.score:"—"),metric("SOURCE","ESPNcricinfo")
      ].join("");
      rowsTable(rows,["DATE","SCORE","OPPOSITION","GROUND","WICKETS","CT / ST","SCORECARD"],r=>{
        const match=r.matchUrl&&/^https:\/\//i.test(r.matchUrl)?'<a href="'+esc(r.matchUrl)+'" target="_blank" rel="noopener noreferrer">Open ↗</a>':"—";
        return "<tr><td>"+esc(r.date)+"</td><td>"+esc(r.score)+"</td><td>"+esc(r.opposition)+"</td><td>"+esc(r.ground)+"</td><td>"+esc(r.wickets)+"</td><td>"+esc((r.catches??"—")+" / "+(r.stumpings??"—"))+"</td><td>"+match+"</td></tr>";
      });
    }else{
      summaryHost.innerHTML=[metric("SOURCE","ESPNcricinfo Statsguru"),metric("STATUS","Not loaded")].join("");
      rowsTable([],["DATE","OPPOSITION","DETAIL","SOURCE"],()=> "");
    }
    const note=$("statsguru-note");
    if(["bowling","bowlinglist","bestbowling","bestmatchbowling","bowlingmatches","bowlingseries","fielding","fieldinglist","catches","fieldingseries"].includes(selectedCategory)){
      note.textContent="This Statsguru panel currently imports verified batting summary and match-by-match rows from ESPNcricinfo. Bowling and fielding categories will remain empty until their matching ESPNcricinfo tables are added; no figures are fabricated.";
    }else{
      note.textContent="Source: ESPNcricinfo Statsguru. Snapshot last refreshed: "+(sg.updatedAt||"not yet available")+". Scheduled refresh: every 24 hours. If ESPNcricinfo blocks a request, the last successful dataset is retained.";
    }
  }
  document.querySelectorAll("[data-sg-format]").forEach(b=>b.addEventListener("click",()=>{selectedFormat=b.dataset.sgFormat;render();}));
  document.querySelectorAll("[data-sg-category]").forEach(b=>b.addEventListener("click",()=>{selectedCategory=b.dataset.sgCategory;render();}));
  fetch("data/site-data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("site data unavailable");return r.json();}).then(d=>{data=d;render();}).catch(()=>{$("statsguru-updated").textContent="Could not load ESPNcricinfo snapshot";$("statsguru-tbody").innerHTML='<tr><td colspan="6" class="empty">Statsguru data is temporarily unavailable. Please try again later.</td></tr>';});
})();