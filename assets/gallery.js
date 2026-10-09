(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"";}catch{return "";}};
function lightbox(){
 let box=$("photo-lightbox");if(box)return box;
 box=document.createElement("div");box.id="photo-lightbox";box.className="photo-lightbox";box.hidden=true;
 box.innerHTML='<div class="photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="Tilak Varma photo"><button type="button" class="photo-lightbox-close" aria-label="Close photo">×</button><img alt=""><p></p><a href="https://www.espncricinfo.com/cricketers/tilak-varma-1170265/photos">Photos on ESPNcricinfo ↗</a></div>';
 document.body.appendChild(box);
 const close=()=>{box.hidden=true;box.querySelector("img").src="";document.body.style.overflow="";};
 box.querySelector(".photo-lightbox-close").addEventListener("click",close);
 box.addEventListener("click",e=>{if(e.target===box)close();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!box.hidden)close();});
 box.openPhoto=(src,title)=>{box.querySelector("img").src=src;box.querySelector("img").alt=title;box.querySelector("p").textContent=title;box.hidden=false;document.body.style.overflow="hidden";box.querySelector(".photo-lightbox-close").focus();};
 return box;
}
async function init(){
 const host=$("cricinfo-photo-grid"),stamp=$("cricinfo-gallery-updated");if(!host)return;
 try{
  const response=await fetch("data/cricinfo-photos.json",{cache:"no-store"});
  if(!response.ok)throw Error("Photo gallery unavailable");
  const data=await response.json(),items=Array.isArray(data.items)?data.items:[];
  if(!items.length)throw Error("No gallery photos available");
  host.innerHTML=items.map(item=>{
   const src=safeUrl(item.image),title=esc(item.title||"Tilak Varma · Match photo");
   if(src)return '<article class="cricinfo-photo-card"><button type="button" class="cricinfo-photo-open" data-photo-url="'+src+'" data-photo-title="'+title+'" aria-label="View '+title+'"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="'+src+'" alt="'+title+'"></button><div class="cricinfo-photo-caption">'+title+'</div></article>';
   if(data.sheet&&item.position)return '<article class="cricinfo-photo-card"><button type="button" class="cricinfo-photo-open cricinfo-photo-sheet" data-photo-url="" data-photo-title="'+title+'" data-sheet-position="'+item.position.x+','+item.position.y+'" aria-label="View '+title+'" style="background-image:url(&quot;'+data.sheet+'&quot;);background-position:'+item.position.x*100+'% '+item.position.y*50+'%;"><span class="sr-only">'+title+'</span></button><div class="cricinfo-photo-caption">'+title+'</div></article>';
   return "";
  }).join("")||'<p class="activity-empty">Photos are temporarily unavailable.</p>';
  host.querySelectorAll(".cricinfo-photo-open").forEach(button=>button.addEventListener("click",()=>{
   const src=button.dataset.photoUrl;
   if(src){lightbox().openPhoto(src,button.dataset.photoTitle);return;}
   const pos=(button.dataset.sheetPosition||"0,0").split(",").map(Number);
   const box=lightbox(),img=box.querySelector("img");
   img.src=data.sheet;img.alt="Tilak Varma photo gallery";
   box.querySelector("p").textContent=button.dataset.photoTitle;
   img.style.objectPosition="center";
   box.querySelector(".photo-lightbox-panel").style.setProperty("--sheet-position",pos[0]+","+pos[1]);
   box.hidden=false;document.body.style.overflow="hidden";
  }));
  host.querySelectorAll("img").forEach(img=>img.addEventListener("error",()=>img.closest(".cricinfo-photo-card")?.remove(),{once:true}));
  if(stamp)stamp.textContent=(data.updatedAt?"Updated "+data.updatedAt:"Latest saved gallery")+(data.lastAttemptStatus==="source-unavailable"?" · last saved photos kept":"");
 }catch(error){
  host.innerHTML='<p class="activity-empty">The photo gallery is updating. Please check again later.</p>';
  if(stamp)stamp.textContent="Gallery temporarily unavailable";
 }
}
lightbox();init();
})();