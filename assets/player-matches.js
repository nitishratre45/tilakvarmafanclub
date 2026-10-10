/* ESPNcricinfo-based debut/last and recent match browser. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
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
  const dateValue = (value) => {
    const raw = String(value || "").trim();
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;
    const m = raw.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{4})$/);
    if (m) {
      const d = Date.parse(m[1] + " " + m[2] + " " + m[3]);
      if (Number.isFinite(d)) return d;
    }
    return 0;
  };
  const prettyDate = (value) => {
    const raw = String(value || "—"),
      ts = dateValue(raw);
    return ts
      ? new Date(ts).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : raw;
  };
  const score = (r) => {
    if (r.score && r.score !== "—") return r.score;
    if (["DNB", "TDNB"].includes(r.runs)) return r.runs;
    if (r.runs === null || r.runs === undefined || r.runs === "") return "—";
    return String(r.runs) + (r.notOut ? "*" : "");
  };
  function render(data) {
    const all = Array.isArray(data.playerMatches) ? data.playerMatches.slice() : [];
    const formats = data.statsguru?.formats || {};
    for (const [fmt, entry] of Object.entries(formats)) {
      for (const r of Array.isArray(entry?.innings) ? entry.innings : [])
        all.push({ ...r, format: fmt });
    }
    for (const r of Array.isArray(data.recentInnings) ? data.recentInnings : [])
      all.push({ ...r, ground: r.ground || r.venue, format: r.format || "T20I" });
    const unique = new Map();
    for (const r of all) {
      const fmt = r.format || "T20I",
        date = r.date || "",
        opposition = r.opposition || "",
        ground = r.ground || r.venue || "";
      if (!date || !opposition) continue;
      const key = [fmt, dateValue(date) || date, opposition, ground].join("|").toLowerCase();
      unique.set(key, { ...(unique.get(key) || {}), ...r, format: fmt, ground });
    }
    const matches = Array.from(unique.values()).sort(
      (a, b) => dateValue(b.date) - dateValue(a.date),
    );
    const milestones = $("player-match-milestones");
    if (milestones) {
      milestones.innerHTML =
        ["ODI", "T20I", "FC", "List A", "T20"]
          .map((fmt) => {
            const rows = matches
              .filter((r) => r.format === fmt)
              .sort((a, b) => dateValue(a.date) - dateValue(b.date));
            const saved = data.playerMatchMilestones?.[fmt];
            const first = saved?.debut || rows[0];
            const last = saved?.last || rows[rows.length - 1];
            if (!first || !last) return "";
            return (
              '<article class="player-match-milestone"><b>' +
              esc(fmt) +
              " Matches</b><div><small>Debut</small><span>" +
              esc(first.opposition) +
              " · " +
              esc(prettyDate(first.date)) +
              "</span><em>" +
              esc(first.ground || "Ground unavailable") +
              "</em></div><div><small>Last</small><span>" +
              esc(last.opposition) +
              " · " +
              esc(prettyDate(last.date)) +
              "</span><em>" +
              esc(last.ground || "Ground unavailable") +
              "</em></div></article>"
            );
          })
          .join("") ||
        '<p class="activity-empty">Debut/last-match records will appear when verified Statsguru rows are available.</p>';
    }
    const sourceLabel = $("player-match-source");
    if (sourceLabel)
      sourceLabel.textContent =
        (data.playerMatchesSource || "ESPNcricinfo Statsguru + saved verified scorecards") +
        " · Last update: " +
        (data.playerMatchesUpdatedAt ||
          data.statsguru?.updatedAt ||
          "waiting for scheduled refresh");
    const bowlMap = new Map();
    for (const [fmt, entry] of Object.entries(data.bowlingStats?.formats || {}))
      for (const b of Array.isArray(entry?.innings) ? entry.innings : []) {
        const key = [fmt, dateValue(b.date) || b.date || "", b.opposition || "", b.ground || ""]
          .join("|")
          .toLowerCase();
        bowlMap.set(key, b.figures || (b.wickets ?? "—") + "/" + (b.runsConceded ?? "—"));
      }
    const selector = $("player-match-format"),
      selected = selector?.value || "All";
    const listed = selected === "All" ? matches : matches.filter((r) => r.format === selected),
      table = $("player-matches-table");
    if (table)
      table.innerHTML = listed.length
        ? listed
            .slice(0, 100)
            .map((r) => {
              const fmt = r.format || "T20I",
                key = [fmt, r.date || "", r.opposition || "", r.ground || r.venue || ""]
                  .join("|")
                  .toLowerCase();
              return (
                "<tr><td>" +
                esc(r.opposition || "—") +
                "</td><td>" +
                esc(score(r)) +
                "</td><td>" +
                esc(r.bowlingFigures || r.bowling || bowlMap.get(key) || "—") +
                "</td><td>" +
                esc(prettyDate(r.date)) +
                "</td><td>" +
                esc(r.ground || r.venue || "—") +
                "</td><td>" +
                esc(fmt) +
                "</td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="6" class="empty">No verified match rows are available for this format yet. Existing saved scorecards are preserved during refresh.</td></tr>';
  }
  let snapshot = null;
  const selector = $("player-match-format");
  if (selector) selector.addEventListener("change", () => snapshot && render(snapshot));
  fetch("data/site-data.json", { cache: "no-store" })
    .then((r) => {
      if (!r.ok) throw new Error("site data unavailable");
      return r.json();
    })
    .then((d) => {
      snapshot = d;
      render(d);
    })
    .catch(() => {
      const table = $("player-matches-table");
      if (table)
        table.innerHTML =
          '<tr><td colspan="6" class="empty">Match history is temporarily unavailable.</td></tr>';
    });
})();
