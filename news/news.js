(() => {
  "use strict";

  const main = document.querySelector("main");
  const section = document.getElementById("news");
  if (!main || !section || section.dataset.newsInitialized === "true") return;
  section.dataset.newsInitialized = "true";

  // Load the isolated styles once and use a versioned URL to avoid stale CDN/browser CSS.
  if (!document.querySelector("link[data-tv-news-styles]")) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "/news/news.css?v=20261015-news-polish1";
    style.dataset.tvNewsStyles = "true";
    document.head.appendChild(style);
  }

  section.classList.add("tv-news-section");
  section.innerHTML = `
    <div class="tv-news-heading">
      <div>
        <div class="tv-news-eyebrow">THE 72 CLUB · NEWS DESK</div>
        <h2>TILAK <em>IN THE NEWS</em></h2>
        <p>Official updates, squad news, match reports and milestones mentioning Tilak Varma.</p>
      </div>
      <span class="tv-news-count" id="tv-news-count">LOADING</span>
    </div>
    <div id="tv-news-tools" class="tv-news-tools" aria-label="Search and filter news"></div>
    <div class="tv-news-grid" id="tv-news-grid" aria-live="polite">
      <p class="tv-news-status" role="status">Loading saved Tilak Varma news…</p>
    </div>
    <div class="tv-news-more-wrap">
      <button type="button" id="tv-news-more" class="tv-news-more" hidden>More news ↓</button>
    </div>
    <p class="tv-news-foot" id="tv-news-updated"></p>`;

  const grid = section.querySelector("#tv-news-grid");
  const tools = section.querySelector("#tv-news-tools");
  const more = section.querySelector("#tv-news-more");
  const count = section.querySelector("#tv-news-count");
  const updated = section.querySelector("#tv-news-updated");
  let allItems = [];
  let visibleCount = 8;
  let activeCategory = "all";
  let searchQuery = "";
  const categoryDefinitions = [
    {
      id: "team",
      label: "Team & Squad",
      test: /squad|team|selection|selected|captain|vice captain|replacement|injury|tour|call.?up|named|announced/i,
    },
    {
      id: "match",
      label: "Match Reports",
      test: /match|innings|runs|score|centur|fifty|wicket|series|t20i|odi|test|final|semi.?final|performance/i,
    },
    {
      id: "interview",
      label: "Interviews",
      test: /interview|press conference|said|statement|speaks|reveals|conversation|quote/i,
    },
    {
      id: "records",
      label: "Records & Milestones",
      test: /record|milestone|rank|ranking|highest|fastest|achievement|landmark/i,
    },
    {
      id: "tournament",
      label: "Tournament News",
      test: /tournament|world cup|asian games|ipl|premier league|championship|new zealand|australia|england|west indies|sri lanka/i,
    },
  ];

  const categoryOf = (item) => {
    const content = [item.title, item.description, item.pageTitle, item.pageText, item.fullText]
      .map(plainText)
      .join(" ");
    for (const category of categoryDefinitions) {
      if (category.test.test(content)) return category.id;
    }
    return "latest";
  };

  const filteredItems = () =>
    allItems.filter((item) => {
      const categoryMatch = activeCategory === "all" || categoryOf(item) === activeCategory;
      const query = searchQuery.trim().toLocaleLowerCase();
      const searchMatch =
        !query ||
        [item.title, item.description, item.pageText, item.fullText]
          .map(plainText)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      return categoryMatch && searchMatch;
    });

  let searchOpen = false;

  const renderTools = () => {
    if (!tools) return;
    tools.replaceChildren();

    const searchToggle = document.createElement("button");
    searchToggle.type = "button";
    searchToggle.className = "tv-news-filter tv-news-search-toggle";
    searchToggle.textContent = searchOpen ? "✕ Close search" : "⌕ Search";
    searchToggle.setAttribute("aria-expanded", searchOpen ? "true" : "false");
    searchToggle.setAttribute("aria-controls", "tv-news-search-input");
    searchToggle.addEventListener("click", () => {
      searchOpen = !searchOpen;
      renderTools();
      const input = tools.querySelector(".tv-news-search");
      if (searchOpen && input) input.focus();
      if (!searchOpen && searchQuery) {
        searchQuery = "";
        visibleCount = 8;
        render();
      }
    });
    tools.appendChild(searchToggle);

    if (searchOpen) {
      const search = document.createElement("input");
      search.id = "tv-news-search-input";
      search.className = "tv-news-search";
      search.type = "search";
      search.placeholder = "Search Tilak news…";
      search.setAttribute("aria-label", "Search Tilak Varma news");
      search.value = searchQuery;
      search.addEventListener("input", () => {
        searchQuery = search.value;
        visibleCount = 8;
        render();
      });
      tools.appendChild(search);
    }

    const categories = [
      { id: "all", label: "All news" },
      ...categoryDefinitions.filter((category) =>
        allItems.some((item) => categoryOf(item) === category.id),
      ),
      { id: "latest", label: "Other updates" },
    ];
    categories.forEach((category) => {
      if (category.id === "latest" && !allItems.some((item) => categoryOf(item) === "latest"))
        return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tv-news-filter" + (activeCategory === category.id ? " is-active" : "");
      button.textContent = category.label;
      button.setAttribute("aria-pressed", activeCategory === category.id ? "true" : "false");
      button.addEventListener("click", () => {
        activeCategory = category.id;
        visibleCount = 8;
        renderTools();
        render();
        const replacement = tools.querySelector(".tv-news-search");
        if (searchOpen && replacement) {
          replacement.focus();
          replacement.setSelectionRange(searchQuery.length, searchQuery.length);
        }
      });
      tools.appendChild(button);
    });
  };

  const officialArticleUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      const officialHost =
        url.hostname === "bcci.tv" ||
        url.hostname === "www.bcci.tv" ||
        url.hostname.endsWith(".bcci.tv");
      const articlePath = /\/(?:webview\/)?news\/article\//i.test(url.pathname);
      return url.protocol === "https:" && officialHost && articlePath ? url.href : "";
    } catch (_) {
      return "";
    }
  };

  const imageUrlOf = (item) => {
    const value =
      item.imageUrl ||
      item.featuredImageUrl ||
      (item.featuredImageUrlSet &&
        (item.featuredImageUrlSet.large ||
          item.featuredImageUrlSet.medium ||
          item.featuredImageUrlSet.small)) ||
      "";
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
    return (
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date) + " IST"
    );
  };

  const plainText = (value) => {
    if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(" ");
    if (value && typeof value === "object") return String(value.text || "");
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
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
    const filtered = filteredItems();
    const shown = filtered.slice(0, visibleCount);
    if (!shown.length) {
      showEmpty(
        "No Tilak Varma stories found",
        searchQuery || activeCategory !== "all"
          ? "Try another search or choose All news to see more saved stories."
          : "The section will update when the official news scan saves relevant articles.",
      );
      count.textContent = "0 STORIES";
      more.hidden = true;
      return;
    }

    shown.forEach((item) => {
      const card = document.createElement("article");
      card.className = "tv-news-card";
      const link = document.createElement("a");
      link.className = "tv-news-card-link";
      link.href = "/News-details/index.html?id=" + encodeURIComponent(item.id);
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
      excerpt.textContent =
        excerptOf(item) || "Open the saved article for the full verified details.";
      const action = document.createElement("span");
      action.className = "tv-news-card-more";
      action.textContent = "Read full story ↗";
      copy.append(date, title, excerpt, action);
      link.appendChild(copy);
      card.appendChild(link);
      grid.appendChild(card);
    });

    count.textContent = filtered.length + (filtered.length === 1 ? " STORY" : " STORIES");
    more.hidden = visibleCount >= filtered.length;
    more.textContent = "More news · " + (filtered.length - visibleCount) + " remaining ↓";
  };

  more.addEventListener("click", () => {
    visibleCount += 8;
    render();
  });

  fetch("/News/newsjson.json?v=20261017-news-reliability1", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("News snapshot request failed (" + response.status + ").");
      return response.json();
    })
    .then((data) => {
      const source = Array.isArray(data) ? data : Array.isArray(data.news) ? data.news : [];
      const unique = new Map();
      source.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const rawUrl = item.webviewUrl || item.finalUrl || item.url || item.link || "";
        const url = officialArticleUrl(rawUrl);
        // Official-feed items remain BCCI-only. Admin-authored stories can use their
        // own optional source link and are identified by their stable manual ID.
        if (!url && item.manual !== true) return;
        const id = String(
          item.id || item.slug || (url ? url.split("/").filter(Boolean).pop() : "manual-" + index),
        );
        const normalized = {
          ...item,
          id,
          webviewUrl: url || (item.manual === true ? "" : rawUrl),
          imageUrl: imageUrlOf(item),
          publishedAt: dateOf(item),
        };
        const key = url || "manual:" + id;
        if (!unique.has(key)) unique.set(key, normalized);
      });

      allItems = Array.from(unique.values()).sort((a, b) => {
        const aTime = Date.parse(dateOf(a)) || 0;
        const bTime = Date.parse(dateOf(b)) || 0;
        return bTime - aTime;
      });

      renderTools();
      render();
      updated.textContent = data.updatedAt ? "Last checked: " + dateLabel(data.updatedAt) : "";
    })
    .catch((error) => {
      showEmpty(
        "News snapshot unavailable",
        "The saved BCCI news file could not be loaded. Please try again after the next successful news refresh.",
      );
      count.textContent = "NEWS ERROR";
      updated.textContent =
        error && error.message ? error.message : "Could not load the saved news data.";
    });
})();
