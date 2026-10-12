(() => {
  "use strict";
  const status = document.getElementById("detail-status");
  const article = document.getElementById("news-article");
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const safeUrl = (value) => {
    try { const url = new URL(value, location.href); return url.protocol === "https:" ? url.href : ""; }
    catch (_) { return ""; }
  };
  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"long",year:"numeric"}).format(date);
  };
  const relativeDate = (value) => {
    if (!value) return "BCCI · News";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    if (days < 30) return days + "d ago";
    return formatDate(value);
  };
  const makeThumb = (url, title) => {
    const imageUrl = safeUrl(url);
    if (imageUrl) {
      const img = document.createElement("img");
      img.className = "related-thumb";
      img.src = imageUrl;
      img.alt = title || "Related news thumbnail";
      img.loading = "lazy";
      img.onerror = () => {
        const fallback = document.createElement("div");
        fallback.className = "related-thumb related-thumb-fallback";
        fallback.textContent = "72";
        img.replaceWith(fallback);
      };
      return img;
    }
    const fallback = document.createElement("div");
    fallback.className = "related-thumb related-thumb-fallback";
    fallback.textContent = "72";
    return fallback;
  };
  const renderRelated = (items, current) => {
    const list = document.getElementById("related-stories");
    const others = items.filter((item) => item !== current).slice(0, 5);
    document.getElementById("related-count").textContent = items.length + " STORIES";
    list.replaceChildren();
    if (!others.length) {
      const note = document.createElement("p");
      note.className = "related-loading";
      note.textContent = "More stories will appear here as the news archive grows.";
      list.appendChild(note);
      return;
    }
    others.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "related-card";
      const copy = document.createElement("div");
      copy.className = "related-copy";
      const category = document.createElement("div");
      category.className = "related-category";
      category.textContent = item.category || "Press Releases";
      const link = document.createElement("a");
      link.className = "related-title";
      link.href = "index.html?id=" + encodeURIComponent(item.id || String(index));
      link.textContent = item.title || "Tilak Varma news update";
      const date = document.createElement("div");
      date.className = "related-date";
      date.textContent = relativeDate(item.publishedAt);
      copy.append(category, link, date);
      card.append(copy, makeThumb(item.imageUrl, item.title));
      list.appendChild(card);
    });
  };
  document.getElementById("share-article").addEventListener("click", async () => {
    const shareData = {title: document.title, url: location.href};
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(location.href);
        document.getElementById("share-article").textContent = "✓ Link copied";
      } else window.prompt("Copy this article link:", location.href);
    } catch (_) {}
  });
  fetch("../News/newsjson.json", {cache:"no-store"})
    .then((response) => { if (!response.ok) throw new Error("News JSON unavailable. Please return to the news page and try again."); return response.json(); })
    .then((data) => {
      const items = Array.isArray(data.news) ? data.news : [];
      const item = items.find((news, index) => (news.id && String(news.id) === id) || String(index) === id);
      if (!item) throw new Error("This news item is not available in the latest saved snapshot.");
      const original = safeUrl(item.webviewUrl);
      if (!original) throw new Error("The original article link is not valid.");
      document.title = (item.title || "Tilak Varma News") + " | The 72 Club";
      document.getElementById("detail-title").textContent = item.title || "Tilak Varma News";
      document.getElementById("detail-date").textContent = formatDate(item.publishedAt) || "BCCI · Tilak Varma news";
      document.getElementById("detail-relative-date").textContent = relativeDate(item.publishedAt);
      const body = document.getElementById("detail-excerpt");
      body.replaceChildren();
      const navigationLabels = new Set(["news", "videos", "photos", "matches", "players", "more", "home", "menu", "search", "sign in", "login"]);
      const normalize = (value) => String(value || "").replace(/[•·|]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const rawParagraphs = Array.isArray(item.articleText) && item.articleText.length
        ? [...item.articleText, ...(Array.isArray(item.matchedLines) ? item.matchedLines : [])]
        : (typeof item.fullText === "string" && item.fullText
          ? item.fullText.split(/(?<=[.!?])\\s+|\\n+/)
          : (Array.isArray(item.matchedLines) ? item.matchedLines : []));
      const paragraphs = [...new Set(rawParagraphs
        .filter((line) => typeof line === "string" && line.trim())
        .map((line) => line.trim())
        .filter((line) => !navigationLabels.has(normalize(line)))
        .filter((line) => normalize(line) !== normalize(item.title))
        .filter((line) => line.length >= 30))];
      if (paragraphs.length) {
        paragraphs.forEach((line) => {
          const p = document.createElement("p");
          p.textContent = line;
          body.appendChild(p);
        });
      } else {
        const p = document.createElement("p");
        p.textContent = "The saved BCCI feed does not include the full article text yet. Use the official BCCI link below to read the complete story.";
        body.appendChild(p);
      }
      const image = document.getElementById("detail-image");
      const imageUrl = safeUrl(item.imageUrl);
      if (imageUrl) {
        image.src = imageUrl;
        image.alt = item.title || "BCCI article image";
        image.hidden = false;
        document.getElementById("image-fallback").hidden = true;
        image.onerror = () => { image.hidden = true; document.getElementById("image-fallback").hidden = false; };
      }
      document.getElementById("original-link").href = original;
      renderRelated(items, item);
      status.hidden = true;
      article.hidden = false;
    })
    .catch((error) => {
      status.textContent = error.message || "Could not load this news item.";
      document.getElementById("related-stories").innerHTML = '<p class="related-loading">Related stories are temporarily unavailable.</p>';
    });
})();