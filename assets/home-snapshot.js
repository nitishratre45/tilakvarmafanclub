(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "—").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[ch]);
  const safeUrl = value => {
    try { const u = new URL(value); return u.protocol === "https:" ? u.href : ""; }
    catch { return ""; }
  };
  const number = value => typeof value === "number" ? value.toLocaleString("en-IN") : (value ?? "—");
  async function init() {
    const statsHost = $("home-quick-stats");
    const inningsHost = $("home-recent-innings");
    const newsHost = $("home-latest-news");
    try {
      const response = await fetch("data/site-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Stats unavailable");
      const data = await response.json();
      const career = data.careerFormats?.T20I || data.careerStats || {};
      if (statsHost) {
        const metrics = [
          ["T20I RUNS", number(career.runs ?? data.careerStats?.t20iRuns)],
          ["HIGHEST SCORE", career.highestScore ?? data.careerStats?.highestScore],
          ["BATTING AVERAGE", career.average ?? data.careerStats?.average],
          ["STRIKE RATE", career.strikeRate ?? data.careerStats?.strikeRate]
        ];
        statsHost.innerHTML = metrics.map(([label, value]) =>
          '<article class="home-mini-stat"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></article>'
        ).join("");
      }
      const formatHost = $("home-format-stats");
      if (formatHost) {
        const order = [["ODI","ODI"],["FC","First-class"],["T20I","T20I"],["LIST A","List A"],["IPL","IPL"],["OVERALL T20","Overall T20 (all competitions)"]];
        formatHost.innerHTML = order.map(([label,key]) => {
          const s = data.careerFormats?.[key];
          if (!s) return "";
          return '<article class="home-format-card"><span>' + esc(label) + '</span><strong>' + esc(number(s.runs)) + '</strong><small>' + esc(s.matches ?? "—") + ' matches · HS ' + esc(s.highestScore ?? "—") + '</small><small>AVG ' + esc(s.average ?? "—") + ' · SR ' + esc(s.strikeRate ?? "—") + '</small></article>';
        }).filter(Boolean).join("");
      }
      if ($("home-data-updated")) $("home-data-updated").textContent = data.lastUpdated || "Timestamp unavailable";
      const rows = Array.isArray(data.recentInnings) ? data.recentInnings.slice(0, 4) : [];
      if (inningsHost) inningsHost.innerHTML = rows.length ? rows.map(row => {
        const url = safeUrl(row.source);
        const runs = row.runs === "DNB" ? "DNB" : (row.runs ?? "—");
        return '<article class="home-innings-row"><div class="home-innings-score"><strong>' + esc(runs) + '</strong><span>' + esc(row.balls === "—" || row.balls == null ? "balls —" : row.balls + " balls") + '</span></div><div class="home-innings-detail"><strong>' + esc(row.opposition || "Opponent unavailable") + '</strong><span>' + esc(row.date || "Date unavailable") + ' · ' + esc(row.format || "Cricket") + '</span><small>' + esc(row.result || row.venue || "") + '</small></div>' + (url ? '<a class="home-row-source" href="' + url + '" target="_blank" rel="noopener noreferrer" aria-label="Open scorecard source">↗</a>' : '') + '</article>';
      }).join("") : '<p class="activity-empty">No recent innings are available yet.</p>';
    } catch (error) {
      if (statsHost) statsHost.innerHTML = '<p class="activity-empty">Career snapshot temporarily unavailable.</p>';
      if (inningsHost) inningsHost.innerHTML = '<p class="activity-empty">Recent innings could not be loaded.</p>';
    }
    try {
      const response = await fetch("data/tilak-news.json", { cache: "no-store" });
      if (!response.ok) throw new Error("News unavailable");
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items.slice(0, 2) : [];
      if (newsHost) newsHost.innerHTML = items.length ? items.map(item => {
        const url = safeUrl(item.url);
        return '<article class="home-news-item"><span>' + esc(item.publisher || "Cricket news") + ' · ' + esc(item.published || "Latest") + '</span><h4>' + (url ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + '</a>' : esc(item.title)) + '</h4><p>' + esc(item.summary || "") + '</p></article>';
      }).join("") : '<p class="activity-empty">No recent stories available. Check Photos & News for more.</p>';
    } catch (error) {
      if (newsHost) newsHost.innerHTML = '<p class="activity-empty">Latest news is temporarily unavailable.</p>';
    }
  }
  init();
})();