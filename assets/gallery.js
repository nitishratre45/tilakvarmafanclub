(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"";}catch{return "";}};
const galleryUrl="https://www.cricinfo.com/cricketers/tilak-varma-1170265/photos";
function lightbox(){
 let box=$("photo-lightbox");if(box)return box;
 box=document.createElement("div");box.id="photo-lightbox";box.className="photo-lightbox";box.hidden=true;
 box.innerHTML='<div class="photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="Tilak Varma photo"><button type="button" class="photo-lightbox-close" aria-label="Close photo">×</button><img alt=""><p></p><a href="'+galleryUrl+'">Photos on ESPNcricinfo ↗</a></div>';
 document.body.appendChild(box);
 const close=()=>{box.hidden=true;box.querySelector("img").src="";document.body.style.overflow="";};
 box.querySelector(".photo-lightbox-close").addEventListener("click",close);
 box.addEventListener("click",e=>{if(e.target===box)close();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!box.hidden)close();});
 box.openPhoto=(src,title)=>{box.querySelector("img").src=src;box.querySelector("img").alt=title;box.querySelector("p").textContent=title;box.hidden=false;document.body.style.overflow="hidden";box.querySelector(".photo-lightbox-close").focus();};
 return box;
}
function liveFallback(host,stamp,data){
 host.innerHTML='<div class="gallery-live-fallback"><div class="gallery-fallback-mark">72</div><div><strong>Open the official photo gallery</strong><p>Gallery refresh is checked daily. Load Cricinfo photos here without opening a new tab.</p><button type="button" id="open-live-cricinfo-gallery">Load photos ↗</button></div></div>';
 $("open-live-cricinfo-gallery")?.addEventListener("click",()=>window.TilakArticleReader?.open(galleryUrl,"Tilak Varma · Photo Gallery"));
 if(stamp)stamp.textContent=(data?.checkedAt?"Checked "+data.checkedAt:"Daily gallery check · waiting for first successful update");
}
async function init(){
 const host=$("cricinfo-photo-grid"),stamp=$("cricinfo-gallery-updated");if(!host)return;
 let data={};
 try{
  const response=await fetch("data/cricinfo-photos.json",{cache:"no-store"});
  if(!response.ok)throw Error("Photo gallery unavailable");
  data=await response.json();
  const items=Array.isArray(data.items)?data.items:[];
  if(!items.length){liveFallback(host,stamp,data);return;}
  host.innerHTML=items.map(item=>{
   const src=safeUrl(item.image),title=esc(item.title||"Tilak Varma · Match photo");
   if(src)return '<article class="cricinfo-photo-card"><button type="button" class="cricinfo-photo-open" data-photo-url="'+src+'" data-photo-title="'+title+'" aria-label="View '+title+'"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="'+src+'" alt="'+title+'"></button><div class="cricinfo-photo-caption">'+title+'</div></article>';
   return "";
  }).join("")||'<p class="activity-empty">Photos are temporarily unavailable.</p>';
  host.querySelectorAll(".cricinfo-photo-open").forEach(button=>button.addEventListener("click",()=>lightbox().openPhoto(button.dataset.photoUrl,button.dataset.photoTitle)));
  host.querySelectorAll("img").forEach(img=>img.addEventListener("error",()=>img.closest(".cricinfo-photo-card")?.remove(),{once:true}));
  if(stamp)stamp.textContent=(data.updatedAt?"Last update: "+data.updatedAt:"Last update: time unavailable")+(data.lastAttemptStatus==="source-unavailable"?" · last saved photos kept":"");
 }catch(error){liveFallback(host,stamp,data);}
}
lightbox();init();
})();