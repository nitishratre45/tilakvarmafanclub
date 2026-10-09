(function(){
  const sections=[...document.querySelectorAll("main > section[id]")];
  const nav=document.getElementById("main-nav");
  const menu=document.querySelector(".menu-toggle");
  const allowed=new Set(sections.map(s=>s.id));
  function show(id, updateHash){
    if(!allowed.has(id)) id="profile";
    sections.forEach(s=>{
      const active=s.id===id;
      s.hidden=!active;
      s.setAttribute("aria-hidden",String(!active));
    });
    nav?.querySelectorAll('a[href^="#"]').forEach(a=>{
      const active=a.getAttribute("href")==="#"+id;
      a.classList.toggle("active",active);
      if(active)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
    });
    if(updateHash && location.hash!=="#"+id) history.pushState({section:id},"","#"+id);
    nav?.classList.remove("open");
    menu?.setAttribute("aria-expanded","false");
    window.scrollTo({top:0,behavior:"instant"});
  }
  nav?.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",e=>{
    const id=a.getAttribute("href").slice(1);
    if(allowed.has(id)){e.preventDefault();show(id,true);}
  }));
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    if(a.closest("nav"))return;
    a.addEventListener("click",e=>{
      const id=a.getAttribute("href").slice(1);
      if(allowed.has(id)){e.preventDefault();show(id,true);}
    });
  });
  window.addEventListener("popstate",()=>show(location.hash.slice(1)||"profile",false));
  window.addEventListener("hashchange",()=>show(location.hash.slice(1)||"profile",false));
  const initial=location.hash.slice(1);
  show(allowed.has(initial)?initial:"profile",false);
})();