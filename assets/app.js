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
      formatHost.innerHTML = Object.entries(data.careerFormats).map(([name, s]) => `<article class="stat-card format-card"><span class="stat-label">${name.toUpperCase()}</span><strong>${Number(s.runs || 0).toLocaleString("en-IN")}</strong><span class="stat-note">${s.matches ?? "—"} matches · HS ${s.highestScore ?? "—"}</span><span class="format-detail">AVG ${s.average ?? "—"} · SR ${s.strikeRate ?? "—"} · 100s ${s.hundreds ?? "—"} · 50s ${s.fifties ?? "—"}</span><a href="${s.source || data.careerSource || "#"}" target="_blank" rel="noreferrer">Source ↗</a></article>`).join("");
    }
    const src = $("#career-source");
    if (src && data.careerSource) src.href = data.careerSource;
    set("career-updated", "Snapshot timestamp: " + (data.lastUpdated || "not recorded"));
    const rows = data.recentInnings || [];
    const tbody = $("#recent-table");
    if (tbody) tbody.innerHTML = rows.length ? rows.map(row => {
      const sr = row.strikeRate ?? (row.balls ? (row.runs * 100 / row.balls).toFixed(2) : "—");
      return "<tr>" + [row.date, row.opposition, row.runs, row.balls, row.fours, row.sixes, sr].map(v => "<td>" + (v ?? "—") + "</td>").join("") + "</tr>";
    }).join("") : '<tr><td colspan="7" class="empty">No recent innings have been loaded yet. See the Cricsheet source and refresh workflow.</td></tr>';
    set("recent-runs", rows.reduce((sum, r) => sum + Number(r.runs || 0), 0));
    set("recent-count", rows.length);
    set("data-status", rows.length ? "Available" : "Awaiting feed");
    set("recent-updated", data.recentUpdated || "No refresh timestamp yet");
  } catch (error) {
    set("data-status", "Source unavailable");
    const tbody = $("#recent-table");
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="empty">Could not load the data file. Check the data source and try again.</td></tr>';
  }
})();