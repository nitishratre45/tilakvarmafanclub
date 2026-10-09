(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=v=>typeof v==="number"?v.toLocaleString("en-IN",{maximumFractionDigits:2}):(v??"—");
  const titles={batting:"Career summary",innings:"Innings by innings",highscores:"High scores"};
  const FILTER_LABELS={"all":"All-round / general","opposition":"Opposition","home-away":"Home or away","country":"Host country / region","ground":"Ground","year":"Year","season":"Season","result":"Match result","position":"Batting position","innings":"Match innings","daynight":"Day / night","series":"Series / tournament"};
  const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  let selectedFormat="T20I",selectedCategory="batting",data=null,activeBreakdownFilter="all",activeBreakdownValue="all",appliedFrom="",appliedTo="";

  function metric(label,value){return '<div class="statsguru-metric"><span>'+esc(label.toUpperCase())+'</span><strong>'+esc(fmt(value))+'</strong></div>';}
  function rowsTable(rows,headers,render,emptyText){
    $("statsguru-thead").innerHTML="<tr>"+headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
    $("statsguru-tbody").innerHTML=rows.length?rows.map(render).join(""):'<tr><td colspan="'+headers.length+'" class="empty">'+esc(emptyText||"No verified Explore data rows match these filters.")+'</td></tr>';
  }
  function parseDate(value){
    const s=String(value||"").trim();
    const direct=Date.parse(s);
    if(Number.isFinite(direct))return direct;
    const m=s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
    if(!m)return 0;
    const month=MONTHS[m[2].slice(0,3).toLowerCase()];
    return month===undefined?0:Date.UTC(Number(m[3]),month,Number(m[1]));
  }
  function sourceData(){
    const formats=data?.statsguru?.formats||{};
    if(selectedFormat==="All"){
      const parts=["T20","ODI"].map(f=>formats[f]).filter(Boolean);
      const all=parts.flatMap(f=>Array.isArray(f.innings)?f.innings:[]);
      const summaries=parts.map(f=>f.summary).filter(Boolean);
      const sum=k=>summaries.reduce((n,s)=>n+(typeof s[k]==="number"?s[k]:0),0);
      const best=summaries.map(s=>({score:s.highestScore,n:Number.parseInt(String(s.highestScore||"").replace(/[^0-9]/g,""),10)||0})).sort((a,b)=>b.n-a.n)[0];
      const runs=sum("runs"),balls=sum("balls"),inn=sum("innings"),no=sum("notOuts");
      const summary=summaries.length?{matches:sum("matches"),innings:inn,notOuts:no,runs,highestScore:best?.score||"—",average:inn>no?Math.round(runs/(inn-no)*100)/100:null,balls,strikeRate:balls?Math.round(runs*100/balls*100)/100:null,hundreds:sum("hundreds"),fifties:sum("fifties"),fours:sum("fours"),sixes:sum("sixes")}:null;
      return {summary,innings:all,breakdown:parts.flatMap(f=>Array.isArray(f.careerBreakdown)?f.careerBreakdown:[]),formats};
    }
    const entry=formats[selectedFormat]||{};
    return {summary:entry.summary||null,innings:Array.isArray(entry.innings)?entry.innings:[],breakdown:Array.isArray(entry.careerBreakdown)?entry.careerBreakdown:[],formats};
  }
  function categoryForGroup(group){
    const g=String(group||"").trim().toLowerCase();
    if(g==="overall")return "all";
    if(/^v\s+/.test(g))return "opposition";
    if(["home","away","neutral"].includes(g))return "home-away";
    if(/^in\s+/.test(g))return "country";
    if(/^year\s+\d{4}$/.test(g))return "year";
    if(/^season\s+/.test(g))return "season";
    if(["won match","lost match","tied match","no result"].includes(g))return "result";
    if(/^\d+(st|nd|rd|th) position$/.test(g))return "position";
    if(/match innings$/.test(g))return "innings";
    if(["day match","day/night match","night match"].includes(g))return "daynight";
    if(/series|tournament|cup|league|ipl|premier/.test(g))return "series";
    return "other";
  }
  function groupOptions(source,type){
    if(type==="all")return [{value:"all",label:"All available values"}];
    if(type==="ground"){
      const grounds=[...new Set(source.innings.map(r=>String(r.ground||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
      return [{value:"all",label:"All grounds"},...grounds.map(g=>({value:g,label:g}))];
    }
    let rows=source.breakdown.filter(r=>categoryForGroup(r.group)===type);
    if(type==="country")rows=rows.filter(r=>!/^in\s+(africa|americas|asia|europe|oceania)$/i.test(r.group));
    const opts=rows.map(r=>({value:r.group,label:r.group})).filter(x=>x.value);
    return [{value:"all",label:"All "+(FILTER_LABELS[type]||"values").toLowerCase()},...opts.filter((x,i,a)=>a.findIndex(y=>y.value===x.value)===i)];
  }
  function syncFilterOptions(){
    const source=sourceData(),type=$("sg-filter-type"),value=$("sg-filter-value");
    if(!type||!value)return;
    const opts=groupOptions(source,type.value),previous=value.value;
    value.innerHTML=opts.map(o=>'<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join("");
    if(opts.some(o=>o.value===previous))value.value=previous;
    activeBreakdownFilter=type.value;activeBreakdownValue=value.value;
  }
  function selectedGroup(source){
    if(activeBreakdownFilter==="all"||activeBreakdownFilter==="ground")return null;
    return source.breakdown.find(r=>r.group===activeBreakdownValue)||null;
  }
  function breakdownRows(source){
    let rows=source.breakdown.slice();
    if(activeBreakdownFilter!=="all"&&activeBreakdownFilter!=="ground"){
      rows=rows.filter(r=>categoryForGroup(r.group)===activeBreakdownFilter);
      if(activeBreakdownValue!=="all")rows=rows.filter(r=>r.group===activeBreakdownValue);
    }
    return rows;
  }
  function inningsRows(source){
    let rows=source.innings.slice();
    if(appliedFrom){const min=Date.parse(appliedFrom+"T00:00:00Z");rows=rows.filter(r=>parseDate(r.date)>=min);}
    if(appliedTo){const max=Date.parse(appliedTo+"T23:59:59Z");rows=rows.filter(r=>parseDate(r.date)<=max);}
    if(activeBreakdownFilter==="ground"&&activeBreakdownValue!=="all")rows=rows.filter(r=>String(r.ground||"").trim()===activeBreakdownValue);
    if(activeBreakdownFilter==="opposition"&&activeBreakdownValue!=="all")rows=rows.filter(r=>String(r.opposition||"").toLowerCase().replace(/^v\s*/,"")===activeBreakdownValue.toLowerCase().replace(/^v\s*/,""));
    if(activeBreakdownFilter==="year"&&activeBreakdownValue!=="all")rows=rows.filter(r=>new Date(parseDate(r.date)).getUTCFullYear()===Number(activeBreakdownValue.replace(/\D/g,"")));
    return rows;
  }
  function renderSummary(source){
    const type=activeBreakdownFilter,group=selectedGroup(source);
    let s=source.summary;
    if(type!=="all"&&type!=="ground"&&activeBreakdownValue!=="all"&&group){
      s={matches:group.matches,innings:group.innings,notOuts:group.notOuts,runs:group.runs,highestScore:group.highestScore,average:group.average,balls:group.balls,strikeRate:group.strikeRate,hundreds:group.hundreds,fifties:group.fifties,fours:group.fours,sixes:group.sixes};
    }
    if(type==="ground"||appliedFrom||appliedTo){
      const matching=inningsRows(source),scored=matching.filter(r=>typeof r.runs==="number");
      const runs=scored.reduce((n,r)=>n+r.runs,0);
      const best=scored.reduce((b,r)=>!b||r.runs>b.runs?r:b,null);
      $("statsguru-summary").innerHTML=[
        metric("MATCH ROWS",matching.length),metric("SCORED ROWS",scored.length),metric("RUNS IN LIST",runs),metric("BEST LISTED SCORE",best?.score||"—")
      ].join("");
      return;
    }
    if(!s){$("statsguru-summary").innerHTML=metric("STATUS","Awaiting data");return;}
    $("statsguru-summary").innerHTML=[
      ["MATCHES",s.matches],["INNINGS",s.innings],["NOT OUTS",s.notOuts],["RUNS",s.runs],["HIGHEST",s.highestScore],["AVERAGE",s.average],["BALLS FACED",s.balls],["STRIKE RATE",s.strikeRate],["HUNDREDS",s.hundreds],["FIFTIES",s.fifties],["FOURS",s.fours],["SIXES",s.sixes]
    ].map(x=>metric(x[0],x[1])).join("");
  }
  function render(){
    if(!data)return;
    const sg=data.statsguru||{},source=sourceData(),rows=source.innings.slice();
    const stamp=sg.updatedAt||"Waiting for update";
    $("statsguru-updated").textContent=stamp;
    $("statsguru-format-label").textContent=selectedFormat==="T20"?"T20 · all competitions":selectedFormat;
    $("statsguru-title").textContent=titles[selectedCategory]||"Player analysis";
    $("statsguru-eyebrow").textContent=selectedCategory==="batting"?"CAREER OVERVIEW":selectedCategory.toUpperCase()+" · "+selectedFormat.toUpperCase();
    document.querySelectorAll("[data-sg-format]").forEach(b=>b.classList.toggle("active",b.dataset.sgFormat===selectedFormat));
    document.querySelectorAll("[data-sg-category]").forEach(b=>b.classList.toggle("active",b.dataset.sgCategory===selectedCategory));
    renderSummary(source);
    const type=activeBreakdownFilter,value=activeBreakdownValue,group=selectedGroup(source);
    const status=$("sg-filter-status");
    if(status){
      let text=type==="all"?"Showing the complete saved career breakdown":(FILTER_LABELS[type]||type)+": "+(value==="all"?"all available values":value);
      if(appliedFrom||appliedTo)text+=" · date range "+(appliedFrom||"earliest")+" to "+(appliedTo||"latest");
      status.textContent=text+" · "+(sg.updatedAt||"snapshot timestamp unavailable");
    }
    if(selectedCategory==="batting"){
      if(type==="ground"||appliedFrom||appliedTo){
        const listed=inningsRows(source).sort((a,b)=>parseDate(b.date)-parseDate(a.date));
        const rowRender=r=>{
          return "<tr><td>"+esc(r.date)+"</td><td>"+esc(r.score||"—")+"</td><td>"+esc(r.opposition||"—")+"</td><td>"+esc(r.ground||"—")+"</td></tr>";
        };
        rowsTable(listed,["DATE","SCORE","OPPOSITION","GROUND"],rowRender,"No verified innings match this ground/date filter.");
      }else{
        const rowsToShow=breakdownRows(source);
        rowsTable(rowsToShow,["GROUP / FILTER","SPAN","MATCHES","INNINGS","NOT OUT","RUNS","HIGH SCORE","AVERAGE","BALLS","STRIKE RATE","100s","50s","DUCKS","4s","6s"],r=>"<tr>"+
          [r.group,r.span,r.matches,r.innings,r.notOuts,r.runs,r.highestScore,r.average,r.balls,r.strikeRate,r.hundreds,r.fifties,r.ducks,r.fours,r.sixes].map(v=>"<td>"+esc(fmt(v))+"</td>").join("")+"</tr>",
          "No verified career-breakdown rows exist for this filter in the selected format.");
      }
    }else{
      let listed=inningsRows(source);
      if(selectedCategory==="highscores")listed.sort((a,b)=>(typeof b.runs==="number"?b.runs:-1)-(typeof a.runs==="number"?a.runs:-1));
      else listed.sort((a,b)=>parseDate(b.date)-parseDate(a.date));
      if(["home-away","country","result","position","innings","daynight","series"].includes(type)){
        const filteredGroup=group;
        if(filteredGroup){
          $("statsguru-summary").innerHTML=[metric("MATCHES",filteredGroup.matches),metric("INNINGS",filteredGroup.innings),metric("RUNS",filteredGroup.runs),metric("AVERAGE",filteredGroup.average)].join("");
          rowsTable([filteredGroup],["GROUP / FILTER","SPAN","MATCHES","INNINGS","NOT OUT","RUNS","HIGH SCORE","AVERAGE","BALLS","STRIKE RATE","100s","50s","DUCKS","4s","6s"],r=>"<tr>"+[r.group,r.span,r.matches,r.innings,r.notOuts,r.runs,r.highestScore,r.average,r.balls,r.strikeRate,r.hundreds,r.fifties,r.ducks,r.fours,r.sixes].map(v=>"<td>"+esc(fmt(v))+"</td>").join("")+"</tr>");
        }else{
          rowsTable([],["DATE","SCORE","OPPOSITION","GROUND"],()=>"", "This filter is available as an aggregate Explore breakdown. Switch to Career summary to explore the matching totals.");
        }
      }else{
        const rowRender=r=>{
          return "<tr><td>"+esc(r.date)+"</td><td>"+esc(r.score||"—")+"</td><td>"+esc(r.opposition||"—")+"</td><td>"+esc(r.ground||"—")+"</td></tr>";
        };
        rowsTable(listed,["DATE","SCORE","OPPOSITION","GROUND"],rowRender,"No verified innings match the selected filters.");
      }
    }
    const note=$("statsguru-note");
    note.textContent="Updated: "+(sg.updatedAt||"timestamp unavailable")+". Automatic refresh every 24 hours; last saved figures remain available if an update is delayed.";
  }
  function resetFilters(){
    $("sg-filter-type").value="all";appliedFrom="";appliedTo="";
    $("sg-date-from").value="";$("sg-date-to").value="";
    syncFilterOptions();$("sg-filter-value").value="all";
    activeBreakdownFilter="all";activeBreakdownValue="all";
    render();
  }
  document.querySelectorAll("[data-sg-format]").forEach(b=>b.addEventListener("click",()=>{
    selectedFormat=b.dataset.sgFormat;
    syncFilterOptions();
    render();
  }));
  document.querySelectorAll("[data-sg-category]").forEach(b=>b.addEventListener("click",()=>{
    selectedCategory=b.dataset.sgCategory;
    render();
  }));
  $("sg-filter-type").addEventListener("change",()=>{syncFilterOptions();render();});
  $("sg-filter-value").addEventListener("change",()=>{activeBreakdownFilter=$("sg-filter-type").value;activeBreakdownValue=$("sg-filter-value").value;render();});
  $("sg-apply-filter").addEventListener("click",()=>{
    activeBreakdownFilter=$("sg-filter-type").value;activeBreakdownValue=$("sg-filter-value").value;
    appliedFrom=$("sg-date-from").value;appliedTo=$("sg-date-to").value;
    if(appliedFrom&&appliedTo&&appliedFrom>appliedTo){$("sg-filter-status").textContent="Start date must be before the ending date.";return;}
    if((appliedFrom||appliedTo)&&!["all","ground","opposition","year"].includes(activeBreakdownFilter)){
      $("sg-filter-status").textContent="Date range works with All-round/general, Opposition, Ground or Year filters. Choose one of those categories or clear the dates.";return;
    }
    render();
  });
  $("sg-reset-filter").addEventListener("click",resetFilters);
  fetch("data/site-data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("site data unavailable");return r.json();}).then(d=>{data=d;syncFilterOptions();render();}).catch(()=>{
    $("statsguru-updated").textContent="Could not load ESPNcricinfo snapshot";
    $("statsguru-tbody").innerHTML='<tr><td colspan="6" class="empty">Player-analysis data is temporarily unavailable. Please try again later.</td></tr>';
  });
})();