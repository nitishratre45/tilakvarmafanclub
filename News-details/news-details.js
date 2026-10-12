(() => {
  "use strict";
  const status = document.getElementById("detail-status");
  const article = document.getElementById("news-article");
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const safeUrl = (value) => {
    try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; }
    catch (_) { return ""; }
  };
  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined,{dateStyle:"long"}).format(date);
  };
  fetch("../News/tilak-news.json", {cache:"no-store"})
    .then((response) => { if (!response.ok) throw new Error("News JSON unavailable"); return response.json(); })
    .then((data) => {
      const items = Array.isArray(data.news) ? data.news : [];
      const item = items.find((news, index) => (news.id && String(news.id) === id) || String(index) === id);
      if (!item) throw new Error("This news item is not available in the latest saved snapshot.");
      const original = safeUrl(item.webviewUrl);
      if (!original) throw new Error("The article link is not valid.");
      document.title = (item.title || "Tilak Varma News") + " | The 72 Club";
      document.getElementById("detail-title").textContent = item.title || "Tilak Varma News";
      document.getElementById("detail-date").textContent = formatDate(item.publishedAt) || "BCCI · Tilak Varma news";
      document.getElementById("detail-excerpt").textContent = (item.matchedLines || []).join("\n\n") || "This BCCI article mentions Tilak Varma. Open the original article for the complete story.";
      const image = document.getElementById("detail-image");
      const imageUrl = safeUrl(item.imageUrl);
      if (imageUrl) { image.src = imageUrl; image.hidden = false; image.alt = item.title || "BCCI article image"; }
      document.getElementById("original-link").href = original;
      status.hidden = true;
      article.hidden = false;
    })
    .catch((error) => { status.textContent = error.message || "Could not load this news item."; });
})();
