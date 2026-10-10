(() => {
  "use strict";
  const host = document.getElementById("tilak-video-grid");
  if (!host) return;
  const videos = [
    { title:"Vice-captain Tilak Varma packs a punch with 44(18)", category:"Match moment", date:"9 Oct 2026", duration:"01:42", url:"https://www.bcci.tv/videos/s-vice-captain-tilak-varma-packs-a-punch-with-4418-fyxhz5" },
    { title:"Hat-trick of Sixes: Tilak makes the ball travel", category:"Batting highlights", date:"9 Oct 2026", duration:"01:50", url:"https://www.bcci.tv/videos/s-hat-trick-of-sixes-tilak-makes-the-ball-travel-vcfay4" },
    { title:"50 up in style! Tilak Varma's gorgeous pick up shot", category:"Batting highlights", date:"11 Dec 2025", duration:"BCCI video", url:"https://www.bcci.tv/videos/s-50-up-in-style-tilak-varmas-gorgeous-pick-up-shot-0rlxt" },
    { title:"I wanted to target England's best bowlers: Tilak Varma", category:"Interview", date:"25 Jan 2025", duration:"03:43", url:"https://www.bcci.tv/video/5565489/i-wanted-to-target-englands-best-bowlers-tilak-varma" },
    { title:"Tilak Varma's match-winning knock of 72*(55)", category:"Match highlights", date:"25 Jan 2025", duration:"03:15", url:"https://www.bcci.tv/video/5565479/tilak-varma-leading-the-charge-in-the-chase" },
    { title:"Tilak Varma Six — India vs England", category:"Match moment", date:"28 Jan 2025", duration:"00:24", url:"https://www.bcci.tv/video/5565540/ind-vs-eng-2025-3rd-t20i-tilak-varma-six" },
    { title:"Centurion Night ft. Tilak Varma", category:"Feature", date:"14 Nov 2024", duration:"02:35", url:"https://www.bcci.tv/video/5564439/centurion-night--ft-tilak-varma-" }
  ];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const safeUrl = value => {
    try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "www.bcci.tv" ? u.href : ""; }
    catch { return ""; }
  };
  const portrait = "https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png";
  const list = videos.filter(v => safeUrl(v.url) && /tilak/i.test(v.title));
  host.innerHTML = list.map((v,i) => '<article class="tilak-video-card">' +
    '<button class="tilak-video-thumb" type="button" data-video-index="' + i + '" aria-label="Play ' + esc(v.title) + ' on this page">' +
      '<img src="' + portrait + '" alt="Tilak Varma video thumbnail" loading="' + (i < 3 ? "eager" : "lazy") + '" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'thumbnail-fallback\')">' +
      '<span class="tilak-video-shade"></span><span class="tilak-video-number">72</span><span class="tilak-video-play">▶</span><span class="tilak-video-duration">' + esc(v.duration) + '</span></button>' +
    '<div class="tilak-video-copy"><span class="tilak-video-type">' + esc(v.category) + '</span><span class="tilak-video-title">' + esc(v.title) + '</span>' +
    '<span class="tilak-video-meta"><span>' + esc(v.date) + '</span><span class="tilak-video-source-label">SOURCE: BCCI</span></span></div></article>').join("");
  let modal = document.getElementById("tilak-video-player-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "tilak-video-player-modal";
    modal.className = "tilak-video-modal";
    modal.hidden = true;
    modal.innerHTML = '<div class="tilak-video-modal-backdrop" data-close-video></div><div class="tilak-video-modal-panel" role="dialog" aria-modal="true" aria-label="Tilak Varma video player"><div class="tilak-video-modal-head"><span class="tilak-video-source-label">SOURCE: BCCI</span><button type="button" class="tilak-video-close" data-close-video aria-label="Close video">✕</button></div><div class="tilak-video-embed-wrap"><iframe title="Official BCCI Tilak Varma video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="tilak-video-embed-fallback">If the BCCI player cannot be embedded, <a target="_blank" rel="noopener noreferrer">open the official video</a>.</p></div>';
    document.body.appendChild(modal);
  }
  const frame = modal.querySelector("iframe");
  const fallbackLink = modal.querySelector(".tilak-video-embed-fallback a");
  const close = () => { modal.hidden = true; frame.src = "about:blank"; document.body.classList.remove("tilak-video-modal-open"); };
  host.querySelectorAll("[data-video-index]").forEach(button => button.addEventListener("click", () => {
    const video = list[Number(button.dataset.videoIndex)];
    if (!video || !safeUrl(video.url)) return;
    fallbackLink.href = video.url;
    frame.src = video.url;
    modal.hidden = false;
    document.body.classList.add("tilak-video-modal-open");
  }));
  modal.querySelectorAll("[data-close-video]").forEach(el => el.addEventListener("click", close));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) close(); });
})();