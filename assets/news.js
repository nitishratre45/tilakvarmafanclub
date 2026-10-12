(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const safeUrl = (v) => {
    try { const u = new URL(v); return u.protocol === "https:" ? u.href : ""; }
    catch { return ""; }
  };
  const publishedTime = (item) => {
    const raw = item?.published || item?.publishedAt || item?.date || "";
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  };
  const dateLabel = (item) => {
    const t = publishedTime(item);
    return t ? new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Date unavailable";
  };

  function makeReader() {
    let modal = $("article-reader");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "article-reader";
    modal.className = "article-reader";
    modal.hidden = true;
    modal.innerHTML =
      '<section class="article-reader-panel" role="dialog" aria-modal="true" aria-labelledby="article-reader-title">' +
      '<header class="article-reader-head"><div><small>CRICKET STORY</small><h3 id="article-reader-title">Loading story…</h3></div>' +
      '<button type="button" class="article-reader-close" aria-label="Close article">×</button></header>' +
      '<div class="article-reader-preview" id="article-reader-preview" role="status"></div>' +
      '<iframe class="article-reader-frame" title="Article reader" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
      '<footer class="article-reader-foot"><span id="article-reader-help">Opening story…</span>' +
      '<button type="button" class="article-reader-continue">Read full story ↗</button></footer></section>';
    document.body.appendChild(modal);
    const frame = modal.querySelector("iframe");
    const close = () => {
      modal.hidden = true;
      frame.src = "about:blank";
      document.body.style.overflow = "";
    };
    modal.querySelector(".article-reader-close").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector(".article-reader-continue").addEventListener("click", () => {
      const url = modal.dataset.url;
      if (url) window.location.assign(url);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });
    modal.openStory = (url, title, summary) => {
      const safe = safeUrl(url);
      if (!safe) return;
      modal.dataset.url = safe;
      modal.querySelector("#article-reader-title").textContent = title || "Cricket story";
      modal.querySelector("#article-reader-preview").textContent = summary || "This story is published by an external cricket news source.";
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      // Google News RSS redirect pages are not embeddable article pages. Avoid the giant
      // blank/error iframe and give the reader a clear same-tab route to the publisher.
      const isGoogleNewsRedirect = new URL(safe).hostname === "news.google.com";
      frame.style.display = isGoogleNewsRedirect ? "none" : "block";
      frame.src = isGoogleNewsRedirect ? "about:blank" : safe;
      modal.querySelector("#article-reader-help").textContent = isGoogleNewsRedirect
        ? "Preview shown here. Continue to the publisher in this tab to read the full story."
        : "If the publisher blocks embedded reading, use Read full story.";
      modal.querySelector(".article-reader-continue").textContent = "Read full story in this tab ↗";
      document.body.style.overflow = "hidden";
      modal.querySelector(".article-reader-close").focus();
    };
    return modal;
  }
  function openStory(url, title, summary) { makeReader().openStory(url, title, summary); }
  window.TilakArticleReader = { open: openStory };
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-article-url]");
    if (!link) return;
    const url = safeUrl(link.dataset.articleUrl || link.href);
    if (!url) return;
    e.preventDefault();
    openStory(url, link.dataset.articleTitle || link.textContent.trim(), link.dataset.articleSummary || "");
  });

  async function init() {
    const host = $("tilak-news-grid"), photo = $("tilak-feature-photo"), meta = $("tilak-news-meta");
    if (!host) return;
    try {
      const response = await fetch("data/tilak-news.json?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw Error("News feed unavailable");
      const news = await response.json();
      let site = {};
      try { site = await window.TilakSiteData.load(); } catch {}
      const profilePhoto = safeUrl((site.profile || {}).photo || "");
      if (photo && profilePhoto) { photo.src = profilePhoto; photo.alt = "Tilak Varma profile photo"; }

      // Always sort newest first; feeds can arrive in mixed/oldest-first order.
      const items = (Array.isArray(news.items) ? news.items : [])
        .filter((item) => item && item.title)
        .sort((a, b) => publishedTime(b) - publishedTime(a));
      let lastDate = "";
      host.innerHTML = items.length ? items.map((item) => {
        const url = safeUrl(item.url), img = safeUrl(item.image), title = esc(item.title);
        const summaryText = String(item.summary || "").trim();
        const summary = esc(summaryText);
        const date = dateLabel(item);
        const group = date !== lastDate ? '<div class="tilak-news-date-group" aria-label="News dated ' + esc(date) + '"><span>' + esc(date) + '</span></div>' : "";
        lastDate = date;
        const articleAttrs = ' data-article-url="' + esc(url) + '" data-article-title="' + title + '" data-article-summary="' + summary + '"';
        return group + '<article class="tilak-news-card">' +
          (img && url ? '<a class="tilak-news-image" href="' + esc(url) + '"' + articleAttrs + '><img loading="lazy" decoding="async" src="' + esc(img) + '" alt="' + title + '"></a>' : "") +
          '<div class="tilak-news-body"><div class="tilak-news-meta">' + esc(item.publisher || "Cricket news") + " · " + esc(item.published || "Date unavailable") +
          '</div><h3>' + (url ? '<a href="' + esc(url) + '"' + articleAttrs + '>' + title + '</a>' : title) + '</h3>' +
          (summary ? "<p>" + summary + "</p>" : "") +
          (url ? '<button class="article-read-button" type="button"' + articleAttrs + '>Read story <span>↗</span></button>' : "") +
          "</div></article>";
      }).join("") : '<p class="activity-empty">No stories are available right now.</p>';
      host.querySelectorAll("img").forEach((img) => img.addEventListener("error", () => img.closest(".tilak-news-image")?.remove(), { once: true }));
      if (meta) meta.textContent = "Last update: " + (news.updatedAt || "time unavailable") + " · Sorted newest first · " + items.length + " stories";
    } catch (e) {
      host.innerHTML = '<p class="activity-empty">News is temporarily unavailable. Please check again later.</p>';
      if (meta) meta.textContent = "Stories temporarily unavailable";
    }
  }
  makeReader();
  init();
})();