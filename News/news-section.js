(() => {
  "use strict";
  const section = document.getElementById("news");
  if (!section) return;

  const grid = section.querySelector("#tv-news-grid");
  const count = section.querySelector("#tv-news-count");
  const status = section.querySelector("#tv-news-status");
  const updated = section.querySelector("#tv-news-updated");
  const more = section.querySelector("#tv-news-more");
  if (!grid || !count || !status || !updated || !more) return;

  const BCCI_HOST = "www.bcci.tv";
  let items = [];
  let visible = 8;

  const safeBcciUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" &&
        (url.hostname === BCCI_HOST || url.hostname.endsWith(".bcci.tv")) &&
        /\/news\/article\//.test(url.pathname)
        ? url.href : "";
    } catch (_) { return ""; }
  };

  const imageFrom = (item) => item.featuredImageUrl ||
    item.featuredImageUrlSet?.large ||
    item.featuredImageUrlSet?.medium ||
    item.imageUrl || item.image || "";

  const dateFrom = (item) => item.publishedDate || item.publishedAt || item.date || "";

  const dateLabel = (value) => {
    if (!value) return "BCCI · NEWS";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata", day: "numeric", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
    }).format(date) + " IST";
  };

  const textOf = (item) => [
    item.description, item.excerpt, item.fullText, item.pageText,
    item.content, ...(Array.isArray(item.articleText) ? item.articleText : []),
    ...(Array.isArray(item.contentBlocks) ? item.contentBlocks.map(block => block.text || "") : [])
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const makePlaceholder = () => {
    const box = document.createElement("div");
    box.className = "tv-news-image tv-news-placeholder";
    const number = document.createElement("span");
    number.textContent = "72";
    const label = document.createElement("small");
    label.textContent = "THE 72 CLUB";
    box.append(number, label);
    return box;
  };

  const render = () => {
    grid.replaceChildren();
    const shown = items.slice(0, visible);
    if (!shown.length) {
      const empty = document.createElement("div");
      empty.className = "tv-news-empty";
      const title = document.createElement("h3");
      title.textContent = "No Tilak Varma stories found";
      const note = document.createElement("p");
      note.textContent = "News will appear here when the BCCI News API snapshot contains a verified article mentioning Tilak Varma.";
      empty.append(title, note);
      grid.appendChild(empty);
      count.textContent = "0 STORIES";
      more.hidden = true;
      return;
    }

    shown.forEach((item) => {
      const card = document.createElement("article");
      card.className = "tv-news-card";
      const link = document.createElement("a");
      link.className = "tv-news-card-link";
      link.href = safeBcciUrl(item.webviewUrl || item.finalUrl || item.url || item.link) || "https://www.bcci.tv/news";
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const imageUrl = imageFrom(item);
      if (imageUrl && /^https:\/\//i.test(imageUrl)) {
        const image = document.createElement("img");
        image.className = "tv-news-image";
        image.src = imageUrl;
        image.alt = item.featuredImageAlt || item.title || "BCCI news image";
        image.loading = "lazy";
        image.onerror = () => image.replaceWith(makePlaceholder());
        link.appendChild(image);
      } else {
        link.appendChild(makePlaceholder());
      }

      const copy = document.createElement("div");
      copy.className = "tv-news-copy";
      const date = document.createElement("time");
      date.className = "tv-news-date";
      date.textContent = dateLabel(dateFrom(item)) || "BCCI · NEWS";
      const title = document.createElement("h3");
      title.textContent = item.title || "Tilak Varma · BCCI News";
      const excerpt = document.createElement("p");
      const articleText = textOf(item);
      excerpt.textContent = articleText
        ? articleText.slice(0, 185) + (articleText.length > 185 ? "…" : "")
        : "Open the official BCCI announcement for the complete article.";
      const action = document.createElement("span");
      action.className = "tv-news-card-more";
      action.textContent = "Read official BCCI story ↗";
      copy.append(date, title, excerpt, action);
      link.appendChild(copy);
      card.appendChild(link);
      grid.appendChild(card);
    });

    count.textContent = items.length + (items.length === 1 ? " STORY" : " STORIES");
    more.hidden = visible >= items.length;
    more.textContent = "Load more · " + (items.length - visible) + " remaining ↓";
  };

  more.addEventListener("click", () => { visible += 8; render(); });

  fetch("News/newsjson.json?v=20261012-simple-news2", { cache: "no-store" })
    .then(response => {
      if (!response.ok) throw new Error("Could not load the saved BCCI news snapshot");
      return response.json();
    })
    .then(data => {
      const source = Array.isArray(data) ? data : (Array.isArray(data.news) ? data.news : []);
      // The scheduled pipeline verifies article body text before saving this list.
      // Keep only official BCCI links; support both enriched records and raw API field names.
      items = source
        .filter(item => item && safeBcciUrl(item.webviewUrl || item.finalUrl || item.url || item.link))
        .map(item => ({
          ...item,
          id: item.id || item.slug || item.title,
          imageUrl: imageFrom(item),
          publishedAt: dateFrom(item)
        }))
        .sort((a, b) => new Date(dateFrom(b) || 0) - new Date(dateFrom(a) || 0));

      status.hidden = true;
      render();
      updated.textContent = data.updatedAt
        ? "Updated " + dateLabel(data.updatedAt) + " · Official BCCI News API"
        : "Source: Official BCCI News API";
    })
    .catch(() => {
      status.hidden = true;
      grid.replaceChildren();
      const empty = document.createElement("div");
      empty.className = "tv-news-empty";
      const title = document.createElement("h3");
      title.textContent = "News data is temporarily unavailable";
      const note = document.createElement("p");
      note.textContent = "The section will display stories after the saved BCCI news snapshot becomes available.";
      empty.append(title, note);
      grid.appendChild(empty);
      count.textContent = "NEWS";
    });
})();
