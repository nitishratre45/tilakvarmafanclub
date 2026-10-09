(async function () {
  const $ = (s) => document.querySelector(s);
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value ?? "—"; };
  set("year", new Date().getFullYear());
  $(".menu-toggle")?.addEventListener("click", () => $("nav")?.classList.toggle("open"));
  try {
    const response = await fetch("data/site-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Data feed unavailable");
    const data = await response.json();
    const stats = data.careerStats || {};
    const photo = document.getElementById("tilak-photo");
    if (photo && data.profile && data.profile.photo) photo.src = data.profile.photo;
    document.querySelectorAll("[data-stat]").forEach(el => {
      const key = el.dataset.stat;
      if (stats[key] !== undefined) el.textContent = stats[key];
    });
    const formatHost = document.getElementById("career-formats");
    if (formatHost && data.careerFormats) {
      formatHost.innerHTML = Object.entries(data.careerFormats).map(([name, s]) => `<article class="stat-card format-card"><span class="stat-label">${name.toUpperCase()}</span><strong>${Number(s.runs || 0).toLocaleString("en-IN")}</strong><span class="stat-note">${s.matches ?? "—"} matches · HS ${s.highestScore ?? "—"}</span><span class="format-detail">AVG ${s.average ?? "—"} · SR ${s.strikeRate ?? "—"} · 100s ${s.hundreds ?? "—"} · 50s ${s.fifties ?? "—"}</span></article>`).join("");
    }
    const src = $("#career-source");
    if (src) src.remove();
    set("career-updated", "Snapshot timestamp: " + (data.lastUpdated || "not recorded"));
    const rows = data.recentInnings || [];
    const tbody = $("#recent-table");
    if (tbody) tbody.innerHTML = rows.length ? rows.map(row => {
      const sr = row.strikeRate ?? (row.balls ? (row.runs * 100 / row.balls).toFixed(2) : "—");
      return "<tr>" + [row.date, row.opposition, row.runs, row.balls, row.fours, row.sixes, sr].map(v => "<td>" + (v ?? "—") + "</td>").join("") + "</tr>";
    }).join("") : '<tr><td colspan="7" class="empty">No recent innings have been loaded yet. See the Cricsheet source and refresh workflow.</td></tr>';
    set("recent-runs", rows.reduce((sum, r) => sum + (typeof r.runs === "number" && Number.isFinite(r.runs) ? r.runs : 0), 0));
    set("recent-count", rows.length);
    const lastChecked = Date.parse(data.lastChecked || data.lastUpdated || "");
    const stale = !Number.isFinite(lastChecked) || (Date.now() - lastChecked) > 36 * 60 * 60 * 1000;
    const refreshFailed = data.lastRefreshStatus === "source-unavailable";
    set("data-status", !rows.length ? "Awaiting feed" : refreshFailed ? "Source unavailable · saved data retained" : stale ? "Stale · last check overdue" : "Available · auto-refresh enabled");
    set("recent-updated", data.recentUpdated || "No refresh timestamp yet");

    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
    const featured = data.featuredMatch;
    const featuredHost = document.getElementById("featured-match");
    if (featuredHost && featured) {
      featuredHost.innerHTML = `
        <article class="featured-match-card">
          <div class="featured-match-top"><span class="match-pill">LATEST VERIFIED SCORECARD</span><span class="featured-date">${esc(featured.date)} · ${esc(featured.format || "T20I")}</span></div>
          <div class="featured-match-main"><div><p class="featured-kicker">${esc(featured.venue || "")}</p><h3>${esc(featured.title || "India match")}</h3><p class="featured-result">${esc(featured.result || "")}</p><p class="featured-partnership">${esc(featured.partnership || "")}</p></div><div class="featured-score"><strong>${esc(featured.runs)}<small>${featured.notOut ? "*" : ""}</small></strong><span>RUNS · ${esc(featured.balls)} BALLS</span></div></div>
          <div class="featured-stats"><span><b>${esc(featured.fours)}</b> FOURS</span><span><b>${esc(featured.sixes)}</b> SIXES</span><span><b>${esc(featured.strikeRate)}</b> STRIKE RATE</span><span><b>${esc(featured.teamScore || "")}</b> INDIA</span></div>
        </article>`;
    }
    const activityHost = document.getElementById("activity-feed");
    const activity = Array.isArray(data.activityLog) ? data.activityLog : [];
    if (activityHost) {
      activityHost.innerHTML = activity.length ? activity.map((item) => `
        <article class="activity-item"><div class="activity-content"><div class="activity-meta"><span>${esc(item.category || "UPDATE")}</span><time>${esc(item.date || "")}</time></div><h3>${esc(item.title || "Site update")}</h3><p>${esc(item.description || "")}</p></div></article>`).join("") : '<div class="activity-empty">No updates have been logged yet.</div>';
    }
  } catch (error) {
    set("data-status", "Source unavailable");
    const tbody = $("#recent-table");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Could not load the data file. Check the data source and try again.</td></tr>';
  }
})();