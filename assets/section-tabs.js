(function(){
  const sections=[...document.querySelectorAll("main > section[id]")];
  const nav=document.getElementById("main-nav");
  const menu=document.querySelector(".menu-toggle");
  const allowed=new Set(sections.map(s=>s.id).filter(id=>id!=="home-snapshot"));
  const legacyViews={"stats-explorer":"stats-explorer","statsguru":"statsguru"};
  function setStatsView(view){
    const views=[...document.querySelectorAll("#stats .stats-subview")];
    if(!views.some(node=>node.id===view))view="stats-overview";
    views.forEach(node=>{node.hidden=node.id!==view;node.setAttribute("aria-hidden",String(node.id!==view));});
    document.querySelectorAll("[data-stats-tab]").forEach(button=>{
      const active=button.dataset.statsTab===view;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
    });
  }
  function show(id,updateHash,view){
    if(legacyViews[id]){view=legacyViews[id];id="stats";}
    if(!allowed.has(id))id="profile";
    sections.forEach(section=>{
      const active=section.id===id||(id==="profile"&&section.id==="home-snapshot");
      section.hidden=!active;
      section.setAttribute("aria-hidden",String(!active));
    });
    if(id==="stats")setStatsView(view||"stats-overview");
    nav?.querySelectorAll('a[href^="#"]').forEach(a=>{
      const active=a.getAttribute("href")==="#"+id;
      a.classList.toggle("active",active);
      if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
    });
    if(updateHash&&location.hash!=="#"+id)history.pushState({section:id,statsView:view||"stats-overview"},"","#"+id);
    nav?.classList.remove("open");
    menu?.setAttribute("aria-expanded","false");
    window.scrollTo({top:0,behavior:"instant"});
  }
  document.querySelectorAll("[data-stats-tab]").forEach(button=>button.addEventListener("click",()=>{
    setStatsView(button.dataset.statsTab);
    if(location.hash!=="#stats")history.pushState({section:"stats",statsView:button.dataset.statsTab},"","#stats");
    window.scrollTo({top:0,behavior:"instant"});
  }));
  document.querySelectorAll("[data-open-stats-view]").forEach(link=>link.addEventListener("click",event=>{
    event.preventDefault();event.stopImmediatePropagation();
    show("stats",true,link.dataset.openStatsView);
  }));
  nav?.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",event=>{
    const id=a.getAttribute("href").slice(1);
    if(allowed.has(id)){event.preventDefault();show(id,true);}
  }));
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    if(a.closest("nav")||a.hasAttribute("data-open-stats-view"))return;
    a.addEventListener("click",event=>{
      const id=a.getAttribute("href").slice(1);
      if(allowed.has(id)){event.preventDefault();show(id,true);}
    });
  });
  window.addEventListener("popstate",event=>{
    const hash=location.hash.slice(1)||"profile";
    show(hash,false,event.state?.statsView||legacyViews[hash]);
  });
  window.addEventListener("hashchange",()=>show(location.hash.slice(1)||"profile",false,legacyViews[location.hash.slice(1)]));
  const initial=location.hash.slice(1)||"profile";
  show(initial,false,legacyViews[initial]);
})();