/* Independent recovery renderer for Records and Recent Innings sections. */
(async function () {
  const esc = (value) => String(value ?? "—").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const stamp = (...values) => values.find((v) => typeof v === "string" && v.trim()) || "Saved data";
  try {
    const response = await fetch("data/site-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Saved career data unavailable");
    const data = await response.json();

    const recordsHost = document.getElementById("icc-record-highlights");
    if (recordsHost) {
      const records = Array.isArray(data.iccRecords) ? data.iccRecords : [];
      const formats = data.careerFormats || {};
      const careerRecords = [
        { rank: formats.T20I?.highestScore, category: "T20I career", title: "Highest T20I score" },
        { rank: formats.IPL?.highestScore, category: "IPL career", title: "Highest IPL score" },
        { rank: formats["List A"]?.highestScore, category: "List A career", title: "Highest List A score" }
      ].filter((r) => r.rank);
      const cards = records.concat(careerRecords);
      recordsHost.innerHTML = cards.length ? cards.map((record) =>
        '<article class="official-record-card"><strong>' + esc(record.rank || "—") +
        '</strong><span>' + esc(record.category || "Career record") +
        '</span><h4>' + esc(record.title || "Player record") + '</h4></article>'
      ).join("") : '<p class="activity-empty">No verified record highlights are saved yet.</p>';
    }
    const recordsUpdated = document.getElementById("icc-records-updated");
    if (recordsUpdated) recordsUpdated.textContent = "Updated " + stamp(data.iccRecordsCheckedAt, data.iccRecordsUpdated, data.lastUpdated);

    const table = document.getElementById("recent-table");
    const rows = Array.isArray(data.recentInnings) ? data.recentInnings : [];
    if (table) {
      table.innerHTML = rows.length ? rows.map((row) => {
        const sr = row.strikeRate ?? (Number.isFinite(Number(row.runs)) && Number.isFinite(Number(row.balls)) && Number(row.balls) > 0
          ? (Number(row.runs) * 100 / Number(row.balls)).toFixed(2) : "—");
        return "<tr>" + [row.date, row.opposition, row.runs, row.balls, row.fours, row.sixes, sr]
          .map((value) => "<td>" + esc(value) + "</td>").join("") + "</tr>";
      }).join("") : '<tr><td colspan="7" class="empty">No verified innings are available in the saved snapshot yet.</td></tr>';
    }
    const numericRows = rows.filter((row) => Number.isFinite(row.runs));
    const runsEl = document.getElementById("recent-runs");
    if (runsEl) runsEl.textContent = numericRows.reduce((sum, row) => sum + row.runs, 0).toLocaleString("en-IN");
    const countEl = document.getElementById("recent-count");
    if (countEl) countEl.textContent = rows.length;
    const updatedEl = document.getElementById("recent-updated");
    if (updatedEl) updatedEl.textContent = stamp(data.recentUpdated, data.lastUpdated);
  } catch (error) {
    const recordsHost = document.getElementById("icc-record-highlights");
    if (recordsHost && recordsHost.querySelector(".activity-empty")) {
      recordsHost.innerHTML = '<p class="activity-empty">Records could not load. Please refresh shortly.</p>';
    }
    const table = document.getElementById("recent-table");
    if (table && table.querySelector(".empty")) {
      table.innerHTML = '<tr><td colspan="7" class="empty">Innings could not load. Please refresh shortly.</td></tr>';
    }
  }
})();
