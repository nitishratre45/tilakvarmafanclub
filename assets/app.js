(async function () {
  const $ = (s) => document.querySelector(s);
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value ?? "—"; };
  set("year", new Date().getFullYear());
  const menuButton=$(".menu-toggle"), nav=$("nav");
  menuButton?.setAttribute("aria-expanded","false");
  menuButton?.addEventListener("click",()=>{const open=nav?.classList.toggle("open")||false;menuButton.setAttribute("aria-expanded",String(open));});
  nav?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{nav.classList.remove("open");menuButton?.setAttribute("aria-expanded","false");}));
  try {
    const response = await fetch("data/site-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Data feed unavailable");
    const data = await response.json();
    const stats = data.careerStats || {};
    const photo = document.getElementById("tilak-photo");
    if (photo && data.profile && data.profile.photo) photo.src = data.profile.photo;
    if (photo) photo.addEventListener("error",()=>{photo.style.display="none";},{once:true});
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
    const rankings = data.iccRankings || {};
    set("icc-ranking-t20i", rankings.T20I ? "T20I #" + rankings.T20I : "T20I ranking unavailable");
    set("icc-ranking-odi", rankings.ODI ? "ODI #" + rankings.ODI : "ODI ranking unavailable");
    set("icc-ranking-updated", rankings.updatedAt ? "Updated " + rankings.updatedAt : "Official ICC ranking snapshot");
    const recordHost = document.getElementById("icc-record-highlights");
    if (recordHost) {
      const records = Array.isArray(data.iccRecords) ? data.iccRecords : [];
      const formats = data.careerFormats || {};
      const careerRecords = [
        {rank:formats.T20I?.highestScore,category:"T20I career",title:"Highest international T20 score"},
        {rank:formats.IPL?.highestScore,category:"IPL career",title:"Highest IPL score"},
        {rank:formats["List A"]?.highestScore,category:"List A career",title:"Highest List A score"}
      ].filter(record => record.rank);
      const cards = records.concat(careerRecords);
      recordHost.innerHTML = cards.length ? cards.map(record =>
        '<article class="official-record-card"><strong>' + esc(record.rank || "—") + '</strong><span>' + esc(record.category || "Career record") + '</span><h4>' + esc(record.title || "Player record") + '</h4></article>'
      ).join("") : '<p class="activity-empty">Record data is temporarily unavailable.</p>';
    }
    set("icc-records-updated", data.iccRecordsCheckedAt ? "Checked " + data.iccRecordsCheckedAt : (data.iccRecordsUpdated ? "Last updated " + data.iccRecordsUpdated : "Official record snapshot"));


  } catch (error) {
    set("data-status", "Source unavailable");
    const tbody = $("#recent-table");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Could not load the data file. Check the data source and try again.</td></tr>';
  }
})();