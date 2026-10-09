(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"";}catch{return "";}};
async function init(){
 const host=$("tilak-news-grid"),photo=$("tilak-feature-photo"),meta=$("tilak-news-meta");
 if(!host)return;
 try{
  const n=await fetch("data/tilak-news.json",{cache:"no-store"});
  if(!n.ok)throw Error("News feed unavailable");
  const news=await n.json();
  let site={};try{const s=await fetch("data/site-data.json",{cache:"no-store"});if(s.ok)site=await s.json();}catch{}
  const profile=site.profile||{};
  const profilePhoto=safeUrl(profile.photo||"");
  if(photo&&profilePhoto){photo.src=profilePhoto;photo.alt="Tilak Varma — official player profile photo";}
  const items=Array.isArray(news.items)?news.items:[];
  host.innerHTML=items.length?items.map(item=>{
   const url=safeUrl(item.url),img=safeUrl(item.image);
   return '<article class="tilak-news-card">'+(img?'<a class="tilak-news-image" href="'+url+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" decoding="async" src="'+img+'" alt="'+esc(item.title)+'"></a>':'')+
    '<div class="tilak-news-body"><div class="tilak-news-meta">'+esc(item.publisher||"News")+' · '+esc(item.published||"Recent")+'</div><h3><a href="'+url+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+'</a></h3>'+
    (item.summary?'<p>'+esc(item.summary)+'</p>':'')+'<a class="tilak-news-source" href="'+url+'" target="_blank" rel="noopener noreferrer">Read source ↗</a></div></article>';
  }).join(""):'<p class="activity-empty">No fresh stories are available right now. Official profile links are below.</p>';
  host.querySelectorAll("img").forEach(img=>img.addEventListener("error",()=>img.closest(".tilak-news-image")?.remove(),{once:true}));
  if(meta)meta.textContent="Free Google News RSS · checked "+(news.updatedAt||"date unavailable")+(news.status==="source-unavailable"?" · last saved stories retained":"");
 }catch(e){
  host.innerHTML='<p class="activity-empty">News feed is temporarily unavailable. Check the official Tilak Varma profiles below.</p>';
  if(meta)meta.textContent="News feed unavailable · official links remain available";
 }
}
init();
})();