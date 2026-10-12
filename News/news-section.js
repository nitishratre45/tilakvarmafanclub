(() => {
  "use strict";
  const main = document.querySelector("main");
  const section = document.getElementById("news");
  if (!main || !section) return;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "News/news-section.css?v=1";
  document.head.appendChild(style);

  section.className = "section tv-news-section";
  section.innerHTML = `
    <div class="tv-news-heading">
      <div><div class="tv-news-eyebrow">THE 72 CLUB · NEWS DESK</div><h2>TILAK <em>IN THE NEWS</em></h2><p>Stories from BCCI that mention Tilak Varma.</p></div>
      <span class="tv-news-count" id="tv-news-count">SAVED STORIES</span>
    </div>
    <div class="tv-news-grid" id="tv-news-grid"><p class="tv-news-status">Loading saved Tilak Varma news…</p></div>
    <div class="tv-news-more-wrap"><button type="button" id="tv-news-more" class="tv-news-more" hidden>More news ↓</button></div>
    <p class="tv-news-foot" id="tv-news-updated"></p>`;
  let allItems = [];
  let visibleCount = 8;
  const grid = section.querySelector("#tv-news-grid");
  const more = section.querySelector("#tv-news-more");
  const count = section.querySelector("#tv-news-count");
  const safeUrl = (value) => {
    try { const url = new URL(value, location.href); return url.protocol === "https:" ? url.href : ""; }
    catch (_) { return ""; }
  };
  const dateLabel = (value) => {
    if (!value) return "BCCI · NEWS";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric"}).format(date);
  };
  function render() {
    grid.replaceChildren();
    if (!allItems.length) {
      const empty = document.createElement("div");
      empty.className = "tv-news-empty";
      empty.innerHTML = '<span class="tv-news-empty-mark">72</span><h3>No Tilak stories saved yet</h3><p>The section is ready. It will show articles after the scheduled BCCI news scan finds a Tilak Varma mention.</p>';
      grid.appendChild(empty);
      more.hidden = true;
      count.textContent = "0 STORIES";
      return;
    }
    allItems.slice(0, visibleCount).forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "tv-news-card";
      const link = document.createElement("a");
      link.className = "tv-news-card-link";
      link.href = `News-details/index.html?id=${encodeURIComponent(item.id || index)}`;
      const imageUrl = safeUrl(item.imageUrl);
      if (imageUrl) {
        const image = document.createElement("img");
        image.className = "tv-news-image";
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.onerror = () => image.remove();
        link.appendChild(image);
      } else {
        const visual = document.createElement("div");
        visual.className = "tv-news-image tv-news-placeholder";
        visual.innerHTML = '<span>72</span><small>TILAK VARMA</small>';
        link.appendChild(visual);
      }
      const copy = document.createElement("div");
      copy.className = "tv-news-copy";
      const date = document.createElement("span");
      date.className = "tv-news-date";
      date.textContent = dateLabel(item.publishedAt);
      const title = document.createElement("h3");
      title.textContent = item.title || "Tilak Varma mentioned in BCCI news";
      const excerpt = document.createElement("p");
      excerpt.textContent = (item.matchedLines || []).join(" ").replace(/\s+/g," ").slice(0,190) || "Open the details for the saved article reference.";
      const action = document.createElement("span");
      action.className = "tv-news-card-more";
      action.textContent = "More details ↗";
      copy.append(date,title,excerpt,action);
      link.appendChild(copy);
      card.appendChild(link);
      grid.appendChild(card);
    });
    count.textContent = `${allItems.length} ${allItems.length === 1 ? "STORY" : "STORIES"}`;
    more.hidden = visibleCount >= allItems.length;
    more.textContent = `More news · ${allItems.length - visibleCount} remaining ↓`;
  }
  more.addEventListener("click", () => { visibleCount += 8; render(); });
  fetch("News/tilak-news.json", {cache:"no-store"})
    .then((response) => { if (!response.ok) throw new Error("Saved news JSON not available"); return response.json(); })
    .then((data) => {
      allItems = (Array.isArray(data.news) ? data.news : []).map((item,index) => ({...item,id:item.id || String(index)}));
      render();
      const updated = document.getElementById("tv-news-updated");
      updated.textContent = data.updatedAt ? `Last checked: ${dateLabel(data.updatedAt)} · Source: BCCI` : "News data will appear after the first successful scheduled scan.";
    })
    .catch(() => {
      grid.innerHTML = '<div class="tv-news-empty"><span class="tv-news-empty-mark">72</span><h3>News snapshot not available</h3><p>The section is ready, but the saved news file could not be loaded.</p></div>';
    });
})();
