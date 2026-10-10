(() => {
  "use strict";
  const host = document.getElementById("tilak-video-grid");
  if (!host) return;

  const portrait =
    "https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png";
  const BCCI_API = "/api/bcci-up-next";
  const seedVideos = [
    {
      title: "Vice-captain Tilak Varma packs a punch with 44(18)",
      category: "Match moment",
      date: "9 Oct 2026",
      duration: "01:42",
      url: "https://www.bcci.tv/videos/s-vice-captain-tilak-varma-packs-a-punch-with-4418-fyxhz5",
    },
    {
      title: "Hat-trick of Sixes: Tilak makes the ball travel",
      category: "Batting highlights",
      date: "9 Oct 2026",
      duration: "01:50",
      url: "https://www.bcci.tv/videos/s-hat-trick-of-sixes-tilak-makes-the-ball-travel-vcfay4",
    },
    {
      title: "50 up in style! Tilak Varma's gorgeous pick up shot",
      category: "Batting highlights",
      date: "11 Dec 2025",
      duration: "BCCI video",
      url: "https://www.bcci.tv/videos/s-50-up-in-style-tilak-varmas-gorgeous-pick-up-shot-0rlxt",
    },
    {
      title: "I wanted to target England's best bowlers: Tilak Varma",
      category: "Interview",
      date: "25 Jan 2025",
      duration: "03:43",
      url: "https://www.bcci.tv/video/5565489/i-wanted-to-target-englands-best-bowlers-tilak-varma",
    },
    {
      title: "Tilak Varma's match-winning knock of 72*(55)",
      category: "Match highlights",
      date: "25 Jan 2025",
      duration: "03:15",
      url: "https://www.bcci.tv/video/5565479/tilak-varma-leading-the-charge-in-the-chase",
    },
    {
      title: "Tilak Varma Six — India vs England",
      category: "Match moment",
      date: "28 Jan 2025",
      duration: "00:24",
      url: "https://www.bcci.tv/video/5565540/ind-vs-eng-2025-3rd-t20i-tilak-varma-six",
    },
    {
      title: "Centurion Night ft. Tilak Varma",
      category: "Feature",
      date: "14 Nov 2024",
      duration: "02:35",
      url: "https://www.bcci.tv/video/5564439/centurion-night--ft-tilak-varma-",
    },
  ];
  let videos = seedVideos.slice();

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const safeUrl = (value) => {
    try {
      const u = new URL(value, "https://www.bcci.tv");
      return u.protocol === "https:" && (u.hostname === "www.bcci.tv" || u.hostname === "bcci.tv")
        ? u.href
        : "";
    } catch {
      return "";
    }
  };
  const firstText = (obj, keys) => {
    for (const key of keys) {
      const value = obj && obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        for (const nested of ["url", "src", "href", "path", "original", "large", "medium", "small"]) {
          if (typeof value[nested] === "string" && value[nested].trim()) return value[nested].trim();
        }
      }
    }
    return "";
  };
  const findThumbnail = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return "";
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = findThumbnail(item, depth + 1);
        if (found) return found;
      }
      return "";
    }
    const imageKeys = [
      "thumbnailUrl", "thumbnailURL", "thumbnail", "thumbnailImage",
      "imageUrl", "imageURL", "image", "poster", "posterUrl", "posterURL",
      "coverImage", "cover_image", "bannerImage", "thumb", "featuredImage",
      "landscapeImage", "videoThumbnail", "mediaImage"
    ];
    for (const key of imageKeys) {
      const value = node[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        const direct = firstText(value, ["url", "src", "href", "path", "original", "large", "medium", "small"]);
        if (direct) return direct;
        const nested = findThumbnail(value, depth + 1);
        if (nested) return nested;
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (/image|thumb|poster|media|asset|picture|banner/i.test(key)) {
        const found = findThumbnail(value, depth + 1);
        if (found) return found;
      }
    }
    return "";
  };
  const collectVideoObjects = (root) => {
    const found = [];
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || depth > 8) return;
      if (Array.isArray(node)) {
        node.forEach((item) => walk(item, depth + 1));
        return;
      }
      if (typeof node !== "object") return;
      const title = firstText(node, ["title", "videoTitle", "name", "headline", "label"]);
      const link = firstText(node, ["webUrl", "videoUrl", "permalink", "slug", "href", "link", "url"]);
      const thumbnail = findThumbnail(node);
      if (title && (link || node.id || node.videoId || thumbnail)) {
        const key = (title + "|" + link).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          found.push({
            title,
            link,
            thumbnail,
            duration: firstText(node, ["duration", "videoDuration", "runtime"]),
            date: firstText(node, ["publishedAt", "publishDate", "date", "createdAt"]),
            category: firstText(node, ["categoryName", "category", "section"]),
          });
        }
      }
      Object.values(node).forEach((value) => walk(value, depth + 1));
    };
    walk(root, 0);
    return found;
  };
  const normalizeApiVideo = (item) => {
    let url = item.link;
    if (url && !/^https:\/\//i.test(url)) {
      if (/^\//.test(url)) url = "https://www.bcci.tv" + url;
      else if (/^[a-z0-9-]+$/i.test(url)) url = "https://www.bcci.tv/videos/" + url;
    }
    url = safeUrl(url);
    if (!url) return null;
    let thumbnail = item.thumbnail;
    if (thumbnail && !/^https:\/\//i.test(thumbnail)) {
      thumbnail = "https://www.bcci.tv" + (thumbnail.startsWith("/") ? "" : "/") + thumbnail;
    }
    try {
      const imageUrl = new URL(thumbnail || "");
      if (imageUrl.protocol !== "https:") thumbnail = "";
    } catch {
      thumbnail = "";
    }
    return {
      title: item.title,
      category: item.category || "BCCI video",
      date: item.date ? String(item.date).slice(0, 10) : "BCCI video",
      duration: item.duration || "Play video",
      url,
      thumbnail,
    };
  };

  const render = () => {
    host.innerHTML = videos
      .map((v, i) => {
        const thumbnail = /^https:\/\//i.test(v.thumbnail || "") ? v.thumbnail : portrait;
        return (
          '<article class="tilak-video-card"><button class="tilak-video-thumb" type="button" data-video-index="' +
          i +
          '" aria-label="Play ' +
          esc(v.title) +
          ' on this page"><img src="' +
          esc(thumbnail) +
          '" alt="' +
          esc(v.title) +
          '" loading="' +
          (i < 3 ? "eager" : "lazy") +
          '" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' +
          portrait +
          '\';this.parentElement.classList.add(\'thumbnail-fallback\')"><span class="tilak-video-shade"></span><span class="tilak-video-number">72</span><span class="tilak-video-play">▶</span><span class="tilak-video-duration">' +
          esc(v.duration) +
          '</span></button><div class="tilak-video-copy"><span class="tilak-video-type">' +
          esc(v.category) +
          '</span><span class="tilak-video-title">' +
          esc(v.title) +
          '</span><span class="tilak-video-meta"><span>' +
          esc(v.date) +
          '</span><span class="tilak-video-source-label">SOURCE: BCCI</span></span></div></article>'
        );
      })
      .join("");
  };

  let modal = document.getElementById("tilak-video-player-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "tilak-video-player-modal";
    modal.className = "tilak-video-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="tilak-video-modal-backdrop" data-close-video></div><div class="tilak-video-modal-panel" role="dialog" aria-modal="true" aria-label="Tilak Varma video player"><div class="tilak-video-modal-head"><span class="tilak-video-source-label">SOURCE: BCCI</span><button type="button" class="tilak-video-close" data-close-video aria-label="Close video">✕</button></div><div class="tilak-video-embed-wrap"><iframe title="Official BCCI video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><p class="tilak-video-embed-fallback">If the BCCI player cannot be embedded, <a target="_blank" rel="noopener noreferrer">open the official video</a>.</p></div>';
    document.body.appendChild(modal);
  }
  const frame = modal.querySelector("iframe");
  const fallbackLink = modal.querySelector(".tilak-video-embed-fallback a");
  const close = () => {
    modal.hidden = true;
    frame.src = "about:blank";
    document.body.classList.remove("tilak-video-modal-open");
  };
  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-video-index]");
    if (!button) return;
    const video = videos[Number(button.dataset.videoIndex)];
    if (!video || !safeUrl(video.url)) return;
    fallbackLink.href = video.url;
    frame.src = video.url;
    modal.hidden = false;
    document.body.classList.add("tilak-video-modal-open");
  });
  modal.querySelectorAll("[data-close-video]").forEach((el) => el.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  render();
  fetch(BCCI_API, { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error("BCCI feed unavailable");
      return response.json();
    })
    .then((payload) => {
      const apiVideos = collectVideoObjects(payload).map(normalizeApiVideo).filter(Boolean);
      const slugOf = (url) => {
        try { return new URL(url).pathname.toLowerCase().replace(/\/$/, ""); } catch { return ""; }
      };
      // Prefer official BCCI thumbnails for existing cards when the API returns matching videos.
      videos = videos.map((video) => {
        const match = apiVideos.find((item) =>
          item.title.toLowerCase() === video.title.toLowerCase() ||
          slugOf(item.url) === slugOf(video.url) ||
          (item.title.toLowerCase().includes("tilak") && video.title.toLowerCase().includes("tilak") &&
           item.title.toLowerCase().slice(0, 18) === video.title.toLowerCase().slice(0, 18))
        );
        return match ? { ...video, thumbnail: match.thumbnail || video.thumbnail, duration: match.duration || video.duration } : video;
      });
      const known = new Set(videos.map((v) => v.title.toLowerCase()));
      apiVideos.forEach((video) => {
        if (!known.has(video.title.toLowerCase())) {
          videos.push(video);
          known.add(video.title.toLowerCase());
        }
      });
      if (apiVideos.length) render();
    })
    .catch(() => {
      // Keep the curated official BCCI videos visible if the live API is unavailable.
    });
})();
