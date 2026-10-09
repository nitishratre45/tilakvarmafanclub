(function(){
  "use strict";
  const root=document.documentElement;
  const buttons=[...document.querySelectorAll("[data-theme-choice]")];
  const allowed=new Set(["light","dark","system"]);
  function apply(theme,save){
    const value=allowed.has(theme)?theme:"system";
    root.dataset.theme=value;
    buttons.forEach(button=>{
      const active=button.dataset.themeChoice===value;
      button.setAttribute("aria-pressed",String(active));
    });
    if(save){try{localStorage.setItem("tilak-fc-theme",value);}catch(_){}}
  }
  let initial="system";
  try{initial=localStorage.getItem("tilak-fc-theme")||"system";}catch(_){}
  apply(initial,false);
  buttons.forEach(button=>button.addEventListener("click",()=>apply(button.dataset.themeChoice,true)));
})();