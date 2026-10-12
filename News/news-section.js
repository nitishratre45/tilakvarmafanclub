(() => {
  "use strict";

  const main = document.querySelector("main");
  const section = document.getElementById("news");
  if (!main || !section || section.dataset.newsInitialized === "true") return;
  section.dataset.newsInitialized = "true";

  // Load the isolated styles once and use a versioned URL to avoid stale CDN/browser CSS.
  if (!document.querySelector('link[data-tv-news-styles]')) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "News/news-section.css?v=20261012-mobile-news3";
    style.dataset.tvNewsStyles = "true";
    document.head.appendChild(style);
  }

  section.classList.add("tv-news-section");
  section.innerHTML = `
    <div class="tv-news-heading">
      <div>
        <div class="tv-news-eyebrow">THE 72 CLUB · NEWS DESK</div>
        <h2>TILAK <em>IN THE NEWS</em></h2>
        <p>Stories mentioning Tilak Varma, checked against the official BCCI News API.</p>
      </div>
      <span class="tv-news-count" id="tv-news-count">LOADING</span>
    </div>
    <div class="tv-news-grid" id="tv-news-grid" aria-live="polite">
      <p class="tv-news-status" role="status">Loading saved Tilak Varma news…</p>
    </div>
    <div class="tv-news-more-wrap">
      <button type="button" id="tv-news-more" class="tv-news-more" hidden>More news ↓</button>
    </div>
    <p class="tv-news-foot" id="tv-news-updated"></p>`;

  const grid = section.querySelector("#tv-news-grid");
  const more = section.querySelector("#tv-news-more");
  const count = section.querySelector("#tv-news-count");
  const updated = section.querySelector("#tv-news-updated");
  let allItems = [];
  let visibleCount = 8;

  const officialArticleUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      const officialHost = url.hostname === "bcci.tv" ||
        url.hostname === "www.bcci.tv" || url.hostname.endsWith(".bcci.tv");
      const articlePath = /\/(?:webview\/)?news\/article\//i.test(url.pathname);
      return url.protocol === "https:" && officialHost && articlePath ? url.href : "";
    } catch (_) {
      return "";
    }
  };

  const imageUrlOf = (item) => {
    const value = item.imageUrl ||
      item.featuredImageUrl ||
      (item.featuredImageUrlSet && (item.featuredImageUrlSet.large ||
        item.featuredImageUrlSet.medium || item.featuredImageUrlSet.small)) || "";
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  };

  const dateOf = (item) => item.publishedAt || item.publishedDate || item.date || "";
  const dateLabel = (value) => {
    if (!value) return "BCCI · NEWS";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata", day: "numeric", month: "short",
      year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
    }).format(date) + " IST";
  };

  const plainText = (value) => {
    if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(" ");
    if (value && typeof value === "object") return String(value.text || "");
    return String(value || "").replace(/\s+/g, " ").trim();
  };

  const excerptOf = (item) => {
    const matched = plainText(item.matchedLines);
    const paragraphs = plainText(item.articleText);
    const body = plainText(item.description || item.pageText || item.fullText);
    const excerpt = matched || paragraphs || body;
    return excerpt.length > 190 ? excerpt.slice(0, 187).trimEnd() + "…" : excerpt;
  };

  const makePlaceholder = () => {
    const visual = document.createElement("div");
    visual.className = "tv-news-image tv-news-placeholder";
    const number = document.createElement("span");
    number.textContent = "72";
    const label = document.createElement("small");
    label.textContent = "TILAK VARMA";
    visual.append(number, label);
    return visual;
  };

  const showEmpty = (heading, message) => {
    grid.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "tv-news-empty";
    const mark = document.createElement("span");
    mark.className = "tv-news-empty-mark";
    mark.textContent = "72";
    const title = document.createElement("h3");
    title.textContent = heading;
    const note = document.createElement("p");
    note.textContent = message;
    empty.append(mark, title, note);
    grid.appendChild(empty);
  };

  const render = () => {
    grid.replaceChildren();
    const shown = allItems.slice(0, visibleCount);
    if (!shown.length) {
      showEmpty("No Tilak Varma stories found", "The section will update when the BCCI-only news scan saves articles whose page text mentions Tilak Varma.");
      count.textContent = "0 STORIES";
      more.hidden = true;
      return;
    }

    shown.forEach((item) => {
      const card = document.createElement("article");
      card.className = "tv-news-card";
      const link = document.createElement("a");
      link.className = "tv-news-card-link";
      link.href = "News-details/index.html?id=" + encodeURIComponent(item.id);
      link.setAttribute("aria-label", "Read story: " + (item.title || "Tilak Varma news"));

      const imageUrl = imageUrlOf(item);
      if (imageUrl) {
        const image = document.createElement("img");
        image.className = "tv-news-image";
        image.src = imageUrl;
        image.alt = item.featuredImageAlt || item.title || "BCCI news image";
        image.loading = "lazy";
        image.decoding = "async";
        image.onerror = () => image.replaceWith(makePlaceholder());
        link.appendChild(image);
      } else {
        link.appendChild(makePlaceholder());
      }

      const copy = document.createElement("div");
      copy.className = "tv-news-copy";
      const date = document.createElement("time");
      date.className = "tv-news-date";
      date.dateTime = dateOf(item);
      date.textContent = dateLabel(dateOf(item)) || "BCCI · NEWS";

      const title = document.createElement("h3");
      title.textContent = item.title || "Tilak Varma mentioned in BCCI news";
      const excerpt = document.createElement("p");
      excerpt.textContent = excerptOf(item) || "Open the saved article for the full verified details.";
      const action = document.createElement("span");
      action.className = "tv-news-card-more";
      action.textContent = "Read full story ↗";
      copy.append(date, title, excerpt, action);
      link.appendChild(copy);
      card.appendChild(link);
      grid.appendChild(card);
    });

    count.textContent = allItems.length + (allItems.length === 1 ? " STORY" : " STORIES");
    more.hidden = visibleCount >= allItems.length;
    more.textContent = "More news · " + (allItems.length - visibleCount) + " remaining ↓";
  };

  more.addEventListener("click", () => {
    visibleCount += 8;
    render();
  });

  fetch("News/newsjson.json?v=20261012-news-fix2", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("News snapshot request failed (" + response.status + ").");
      return response.json();
    })
    .then((data) => {
      const source = Array.isArray(data) ? data : (Array.isArray(data.news) ? data.news : []);
      const unique = new Map();
      source.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const rawUrl = item.webviewUrl || item.finalUrl || item.url || item.link || "";
        const url = officialArticleUrl(rawUrl);
        // Official-feed items remain BCCI-only. Admin-authored stories can use their
        // own optional source link and are identified by their stable manual ID.
        if (!url && item.manual !== true) return;
        const id = String(item.id || item.slug || (url ? url.split("/").filter(Boolean).pop() : "manual-" + index));
        const normalized = {
          ...item,
          id,
          webviewUrl: url || (item.manual === true ? "" : rawUrl),
          imageUrl: imageUrlOf(item),
          publishedAt: dateOf(item)
        };
        const key = url || ("manual:" + id);
        if (!unique.has(key)) unique.set(key, normalized);
      });

      allItems = Array.from(unique.values()).sort((a, b) => {
        const aTime = Date.parse(dateOf(a)) || 0;
        const bTime = Date.parse(dateOf(b)) || 0;
        return bTime - aTime;
      });

      render();
      updated.textContent = data.updatedAt
        ? "Last checked: " + dateLabel(data.updatedAt)"
        : "";
    })
    .catch((error) => {
      showEmpty("News snapshot unavailable", "The saved BCCI news file could not be loaded. Please try again after the next successful news refresh.");
      count.textContent = "NEWS ERROR";
      updated.textContent = error && error.message ? error.message : "Could not load the saved news data.";
    });
})();
