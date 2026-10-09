(function(){
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=v=>typeof v==="number"?v.toLocaleString("en-IN",{maximumFractionDigits:2}):(v??"—");
  const titles={batting:"Batting career summary",innings:"Batting innings list",highscores:"High scores",bowling:"Bowling career summary",bowlinglist:"Bowling innings list",bestbowling:"Best innings bowling",bestmatchbowling:"Best match bowling",bowlingmatches:"Bowling match list",bowlingseries:"Bowling series averages",fielding:"Fielding career summary",fieldinglist:"Fielding innings list",catches:"Most catches in an innings",fieldingseries:"Fielding series statistics",series:"Batting series averages",matches:"T20I match list"};
  let selectedFormat="T20I", selectedCategory="batting", data=null;
  function metric(label,value){return '<div class="statsguru-metric"><span>'+esc(label.toUpperCase())+'</span><strong>'+esc(fmt(value))+'</strong></div>';}
  function rowsTable(rows,headers,render){
    const head=$("statsguru-thead"),body=$("statsguru-tbody");
    head.innerHTML="<tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
    body.innerHTML=rows.length?rows.map(render).join(""):'<tr><td colspan="'+headers.length+'" class="empty">No verified '+esc(["bowling","bowlinglist","bestbowling","bestmatchbowling","bowlingmatches","bowlingseries"].includes(selectedCategory)?"bowling":["fielding","fieldinglist","catches","fieldingseries"].includes(selectedCategory)?"fielding":"innings")+' records are stored for this filter yet. Open the source links above for the full scorecard/history.</td></tr>';
  }
  function render(){
    if(!data)return;
    const formats=data.careerFormats||{}, stats=data.careerStats||{}, allRows=Array.isArray(data.recentInnings)?data.recentInnings:[];
    const aliases={"T20I":["T20I"],"ODI":["ODI"],"Test":["Test","First-class"],"IPL":["IPL"],"All":["T20I","ODI","Test","First-class","List A","IPL","Overall T20 (all competitions)"]};
    const wanted=aliases[selectedFormat]||[selectedFormat];
    const formatKey=selectedFormat==="Test"?"First-class":selectedFormat;
    const career=formats[formatKey]||formats[selectedFormat]||(selectedFormat==="T20I"?stats:null);
    const rows=allRows.filter(r=>selectedFormat==="All"||wanted.includes(r.format)|| (selectedFormat==="Test"&&r.format==="First-class"));
    $("statsguru-updated").textContent="Last data snapshot: "+(data.lastUpdated||"timestamp unavailable")+" · refresh runs on the site's existing schedule";
    $("statsguru-format-label").textContent=selectedFormat;
    $("statsguru-title").textContent=titles[selectedCategory]||"Statsguru analysis";
    $("statsguru-eyebrow").textContent=selectedCategory==="batting"?"CAREER OVERVIEW":selectedCategory.toUpperCase()+" · "+selectedFormat.toUpperCase();
    document.querySelectorAll("[data-sg-format]").forEach(b=>b.classList.toggle("active",b.dataset.sgFormat===selectedFormat));
    document.querySelectorAll("[data-sg-category]").forEach(b=>b.classList.toggle("active",b.dataset.sgCategory===selectedCategory));
    const numericRows=rows.filter(r=>typeof r.runs==="number");
    const totalRuns=numericRows.reduce((n,r)=>n+r.runs,0);
    const totalBalls=numericRows.reduce((n,r)=>n+(typeof r.balls==="number"?r.balls:0),0);
    const best=numericRows.reduce((b,r)=>!b||r.runs>b.runs?r:b,null);
    const summary=$("statsguru-summary");
    if(["batting","innings","highscores","matches","series"].includes(selectedCategory)){
      const values=selectedCategory==="batting"&&career?[
        ["MATCHES",career.matches],["INNINGS",career.innings],["RUNS",career.runs],["HIGHEST",career.highestScore],["AVERAGE",career.average],["STRIKE RATE",career.strikeRate],["HUNDREDS",career.hundreds],["FIFTIES",career.fifties]
      ]:[
        ["INNINGS LISTED",rows.length],["RUNS IN LISTED INNINGS",totalRuns],["BEST LISTED SCORE",best?(best.runs+(best.notOut?"*":"")):"—"],["FORMAT",selectedFormat]
      ];
      summary.innerHTML=values.map(x=>metric(x[0],x[1])).join("");
    }else{
      summary.innerHTML=[metric("FORMAT",selectedFormat),metric("MATCHES IN SITE DATA",rows.length),metric("DATA STATUS","Source required"),metric("HISTORICAL DETAIL","Not stored")].join("");
    }
    if(["innings","highscores","matches","series","batting"].includes(selectedCategory)){
      let list=rows.slice();
      if(selectedCategory==="highscores")list.sort((a,b)=>(typeof b.runs==="number"?b.runs:-1)-(typeof a.runs==="number"?a.runs:-1));
      else list.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
      rowsTable(list,["DATE","FORMAT","OPPOSITION","RUNS","BALLS","STRIKE RATE"],r=>"<tr><td>"+esc(r.date)+"</td><td>"+esc(r.format)+"</td><td>"+esc(r.opposition)+"</td><td>"+esc(r.runs)+(r.notOut?"*":"")+"</td><td>"+esc(r.balls)+"</td><td>"+esc(r.strikeRate??(typeof r.balls==="number"&&r.balls>0?(r.runs*100/r.balls).toFixed(2):"—"))+"</td></tr>");
    }else{
      rowsTable([],["DATE","OPPOSITION","DETAIL","SOURCE"],()=> "");
    }
    const note=$("statsguru-note");
    if(["bowling","bowlinglist","bestbowling","bestmatchbowling","bowlingmatches","bowlingseries","fielding","fieldinglist","catches","fieldingseries"].includes(selectedCategory)){
      note.textContent="This repository's current scheduled data snapshot contains batting innings and career summaries, but not a complete verified bowling/fielding/series dataset. No figures are fabricated. Use ESPNcricinfo Statsguru and Cricbuzz links to inspect the original records.";
    }else{
      note.textContent="Figures come from the site's saved data snapshot; recent innings are filtered locally. The existing repository automation refreshes its source data on a 12-hour schedule when upstream sources are available. Source links open ESPNcricinfo and Cricbuzz for verification.";
    }
  }
  document.querySelectorAll("[data-sg-format]").forEach(b=>b.addEventListener("click",()=>{selectedFormat=b.dataset.sgFormat;render();}));
  document.querySelectorAll("[data-sg-category]").forEach(b=>b.addEventListener("click",()=>{selectedCategory=b.dataset.sgCategory;render();}));
  fetch("data/site-data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("site data unavailable");return r.json();}).then(d=>{data=d;render();}).catch(()=>{$("statsguru-updated").textContent="Could not load the saved stats snapshot";$("statsguru-tbody").innerHTML='<tr><td colspan="5" class="empty">Stats are temporarily unavailable. Please try again later.</td></tr>';});
})();