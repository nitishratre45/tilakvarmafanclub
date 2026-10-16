/* Shared Tilak Varma Fan Club navigation. All links stay within this isolated folder or the main site. */
(() => {
 "use strict";
 if (window.__tvfcBcciShell) return;
 window.__tvfcBcciShell = true;
 const path = location.pathname;
 const inResults = /\/results\//.test(path);
 const base = inResults ? "../" : "./";
 const main = "/";
 const routes = [
  ["Home",main,"⌂"],["Stats","/stats/","▥"],["Death-overs","/death-overs/","◷"],
  ["Matches","/matches/","▤"],["Records","/records/","◇"],["News","/news/","▧"],
  ["Photos","/photos/","▣"],["Videos","/videos/","▷"],
  ["BCCI Fixtures",base+"index.html","🏏"],["Live Scores",base+"live-scores.html","●"],
  ["Match Results",base+"results/","✓"]
 ];
 const current = path.endsWith("/bcci-fixtures-test/") || path.endsWith("/bcci-fixtures-test/index.html") ? "BCCI Fixtures" :
  path.includes("/results/") ? "Match Results" : path.endsWith("/live-scores.html") || path.endsWith("/bcci-scorecard-page.html") ? "Live Scores" :
  path.endsWith("/scorecard.html") ? "Live Scores" : path.endsWith("/fixtures.html") ? "BCCI Fixtures" : "";
 const header = document.querySelector("body > header.topbar, body > header.top, body > header.tvfc-header");
 if (header) {
  header.className = "tvfc-header";
  header.innerHTML = '<a class="tvfc-brand" href="/" aria-label="Tilak Varma Fan Club home"><span class="tvfc-brand-photo"><img src="https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png" alt="Tilak Varma" loading="eager"></span><span>TILAK VARMA<small>FAN CLUB · THE 72 CLUB</small></span></a><nav class="tvfc-nav" aria-label="Main navigation"></nav><button class="tvfc-menu-toggle" type="button" aria-label="Open navigation menu" aria-expanded="false"><span></span><span></span><span></span></button>';
  const nav = header.querySelector(".tvfc-nav");
  routes.forEach(([label,href])=>{const a=document.createElement("a");a.href=href;a.textContent=label;if(label===current)a.setAttribute("aria-current","page");nav.append(a)});
 }
 const menu = document.createElement("nav");
 menu.className="tvfc-mobile-menu";menu.hidden=true;menu.setAttribute("aria-label","Mobile navigation");
 menu.innerHTML='<div class="tvfc-menu-heading"><span>TILAK VARMA FAN CLUB</span><button class="tvfc-close" type="button" aria-label="Close menu">×</button></div>';
 routes.forEach(([label,href])=>{const a=document.createElement("a");a.href=href;a.textContent=label;if(label===current)a.setAttribute("aria-current","page");menu.append(a)});
 document.body.append(menu);
 const dock=document.createElement("nav");dock.className="tvfc-mobile-dock";dock.setAttribute("aria-label","Quick navigation");
 const dockItems=[["Home","/","⌂"],["Fixtures",base+"index.html","▤"],["Live",base+"live-scores.html","●"],["Results",base+"results/","✓"],["Menu","#tvfc-menu","☰"]];
 dockItems.forEach(([label,href,icon])=>{const el=label==="Menu"?document.createElement("button"):document.createElement("a");if(label!=="Menu")el.href=href;else el.type="button";el.innerHTML='<span class="tvfc-dock-icon" aria-hidden="true">'+icon+'</span><span>'+label+'</span>';if((label==="Fixtures"&&["BCCI Fixtures",""].includes(current))||(label==="Live"&&current==="Live Scores")||(label==="Results"&&current==="Match Results")||(label==="Home"&&path==="/"))el.classList.add("is-active");if(label==="Menu")el.addEventListener("click",()=>setOpen(menu.hidden));dock.append(el)});
 document.body.append(dock);
 const toggle=document.querySelector(".tvfc-menu-toggle"), close=menu.querySelector(".tvfc-close");
 function setOpen(open){menu.hidden=!open;document.body.classList.toggle("tvfc-menu-open",open);if(toggle){toggle.setAttribute("aria-expanded",String(open));toggle.setAttribute("aria-label",open?"Close navigation menu":"Open navigation menu")}}
 toggle?.addEventListener("click",()=>setOpen(menu.hidden));
 close.addEventListener("click",()=>setOpen(false));
 menu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>setOpen(false)));
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!menu.hidden){setOpen(false);toggle?.focus()}});
 document.addEventListener("click",e=>{if(!menu.hidden&&!menu.contains(e.target)&&!toggle?.contains(e.target)&&!dock.contains(e.target))setOpen(false)});
})();
