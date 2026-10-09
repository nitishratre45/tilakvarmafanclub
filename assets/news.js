(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=v=>{try{const u=new URL(v);return u.protocol==="https:"?u.href:"";}catch{return "";}};

function makeReader(){
 let modal=$("article-reader");
 if(modal)return modal;
 modal=document.createElement("div");
 modal.id="article-reader";modal.className="article-reader";modal.hidden=true;
 modal.innerHTML='<section class="article-reader-panel" role="dialog" aria-modal="true" aria-labelledby="article-reader-title"><header class="article-reader-head"><div><small>CRICKET STORY</small><h3 id="article-reader-title">Loading story…</h3></div><button type="button" class="article-reader-close" aria-label="Close article">×</button></header><iframe class="article-reader-frame" title="Article reader" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe><footer class="article-reader-foot"><span>Story opens here when the publisher allows embedded reading.</span><button type="button" class="article-reader-continue">Open in this tab ↗</button></footer></section>';
 document.body.appendChild(modal);
 const close=()=>{modal.hidden=true;modal.querySelector("iframe").src="about:blank";document.body.style.overflow="";};
 modal.querySelector(".article-reader-close").addEventListener("click",close);
 modal.addEventListener("click",e=>{if(e.target===modal)close();});
 modal.querySelector(".article-reader-continue").addEventListener("click",()=>{const url=modal.dataset.url;if(url)window.location.href=url;});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close();});
 modal.openStory=(url,title)=>{
  const safe=safeUrl(url);if(!safe)return;
  modal.dataset.url=safe;
  modal.querySelector("#article-reader-title").textContent=title||"Cricket story";
  modal.querySelector("iframe").src=safe;
  modal.hidden=false;document.body.style.overflow="hidden";
  modal.querySelector(".article-reader-close").focus();
 };
 return modal;
}
function openStory(url,title){makeReader().openStory(url,title);}
window.TilakArticleReader={open:openStory};
document.addEventListener("click",e=>{
 const link=e.target.closest("[data-article-url]");
 if(!link)return;
 const url=safeUrl(link.dataset.articleUrl||link.href);
 if(!url)return;
 e.preventDefault();openStory(url,link.dataset.articleTitle||link.textContent.trim());
});

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
  if(photo&&profilePhoto){photo.src=profilePhoto;photo.alt="Tilak Varma profile photo";}
  const items=Array.isArray(news.items)?news.items:[];
  host.innerHTML=items.length?items.map(item=>{
   const url=safeUrl(item.url),img=safeUrl(item.image),title=esc(item.title);
   return '<article class="tilak-news-card">'+(img&&url?'<a class="tilak-news-image" href="'+url+'" data-article-url="'+url+'" data-article-title="'+title+'"><img loading="lazy" decoding="async" src="'+img+'" alt="'+title+'"></a>':'')+
    '<div class="tilak-news-body"><div class="tilak-news-meta">'+esc(item.publisher||"Cricket news")+' · '+esc(item.published||"Recent")+'</div><h3>'+(url?'<a href="'+url+'" data-article-url="'+url+'" data-article-title="'+title+'">'+title+'</a>':title)+'</h3>'+
    (item.summary?'<p>'+esc(item.summary)+'</p>':'')+(url?'<button class="article-read-button" type="button" data-article-url="'+url+'" data-article-title="'+title+'">Read story <span>↗</span></button>':'')+'</div></article>';
  }).join(""):'<p class="activity-empty">No fresh stories are available right now.</p>';
  host.querySelectorAll("img").forEach(img=>img.addEventListener("error",()=>img.closest(".tilak-news-image")?.remove(),{once:true}));
  if(meta)meta.textContent="Last update: "+(news.updatedAt||"time unavailable")+" · Latest stories";
 }catch(e){
  host.innerHTML='<p class="activity-empty">News is temporarily unavailable. Please check again later.</p>';
  if(meta)meta.textContent="Stories temporarily unavailable";
 }
}
makeReader();
init();
})();