(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const list = $("list"),
    search = $("search"),
    format = $("format"),
    sort = $("sort");
  const count = $("count"),
    updated = $("updated");
  if (!list || !search || !format || !sort || !count || !updated) return;

  const ARCHIVE_URL = "/matches/scorecards/index.json";
  let matches = [];
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const matchDate = (m) => String(m.date || m.start_date || m.match_date || "");
  const formatOf = (m) => {
    const raw = String(m.format || m.match_type || "").toLowerCase();
    if (/t20i/.test(raw)) return "T20I";
    if (/\bodi\b/.test(raw)) return "ODI";
    if (/first.class/.test(raw)) return "First-class";
    if (/test/.test(raw)) return "Test";
    if (/list.a/.test(raw)) return "List A";
    if (/t20|ipl/.test(raw)) return "T20";
    return "Other";
  };
  const formatLabel = (value) =>
    ({
      T20I: "T20I",
      ODI: "ODI",
      Test: "Test",
      T20: "T20 / IPL",
      "List A": "List A",
      "First-class": "First-class",
      Other: "Cricket",
    })[value] ||
    value ||
    "Cricket";
  const dateLabel = (value) => {
    if (!value) return "Date unavailable";
    const d = new Date(value + "T12:00:00Z");
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  function render() {
    const q = search.value.trim().toLowerCase();
    const selectedFormat = format.value;
    const rows = matches.filter((m) => {
      const haystack = [m.team, m.opposition, m.event, m.venue, m.result, m.date, m.format]
        .join(" ")
        .toLowerCase();
      return (
        (!q || haystack.includes(q)) && (selectedFormat === "all" || formatOf(m) === selectedFormat)
      );
    });
    rows.sort((a, b) => {
      const delta = matchDate(a).localeCompare(matchDate(b));
      return sort.value === "old" ? delta : -delta;
    });
    count.textContent =
      rows.length.toLocaleString("en-IN") +
      " completed Tilak Varma match" +
      (rows.length === 1 ? "" : "es");
    updated.textContent = "";
    if (!rows.length) {
      list.innerHTML =
        '<div class="empty"><span class="empty-icon">🏏</span><h2>No matching completed matches</h2><p>Try another team, format or date.</p></div>';
      return;
    }
    list.innerHTML = rows
      .map((m) => {
        const id = String(m.matchId || m.match_id || m.gid || "");
        const scorecardUrl = "/matches/scorecards/?match=" + encodeURIComponent(id);
        return (
          '<article class="match">' +
          '<div class="match-main">' +
          '<div class="meta"><span class="format-pill">' +
          esc(formatLabel(formatOf(m))) +
          "</span><span>" +
          esc(m.event || "Completed match") +
          "</span><span>" +
          esc(dateLabel(matchDate(m))) +
          "</span></div>" +
          '<h2 class="teams">' +
          esc(m.team || "Team") +
          " <span>vs</span> " +
          esc(m.opposition || "Opponent") +
          "</h2>" +
          '<p class="result">' +
          esc(m.result || "Completed") +
          "</p>" +
          '<p class="venue">' +
          esc(m.venue || "Venue unavailable") +
          "</p>" +
          '</div><a class="btn scorecard-btn" href="' +
          esc(scorecardUrl) +
          '">Full scorecard ↗</a></article>'
        );
      })
      .join("");
  }
  async function load() {
    count.textContent = "Loading completed matches…";
    list.innerHTML = '<div class="empty">Loading saved completed matches…</div>';
    try {
      const response = await fetch(ARCHIVE_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("Saved completed-match archive unavailable");
      const archive = await response.json();
      const rows = Array.isArray(archive.matches) ? archive.matches : [];
      const unique = new Map();
      rows.forEach((m) => {
        const id = String(m.matchId || m.match_id || m.gid || "").trim();
        if (!id) return;
        unique.set(id, { ...m, matchId: id });
      });
      matches = [...unique.values()].sort((a, b) => matchDate(b).localeCompare(matchDate(a)));
      if (!matches.length) throw new Error("No saved completed matches were found.");
      const updatedAt = archive.updatedAt ? new Date(archive.updatedAt) : null;
      updated.textContent =
        updatedAt && !Number.isNaN(updatedAt.getTime())
          ? "Updated " +
            updatedAt.toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "";
      render();
    } catch (error) {
      count.textContent = "Completed matches unavailable";
      list.innerHTML =
        '<div class="empty"><span class="empty-icon">⚠️</span><h2>Could not load completed matches</h2><p>' +
        esc(error.message) +
        '</p><button class="btn" type="button" id="retry-load">Retry</button></div>';
      $("retry-load")?.addEventListener("click", load);
    }
  }
  search.addEventListener("input", render);
  format.addEventListener("change", render);
  sort.addEventListener("change", render);
  load();
})();
