(function () {
  "use strict";
  const host = document.getElementById("match-center-grid");
  if (!host) return;
  const toolbar = document.querySelector(".match-center-toolbar");
  const bar = document.createElement("div");
  bar.className = "mc-live-toolbar";
  bar.innerHTML =
    '<div class="mc-view-tabs" role="group" aria-label="Match category">' +
    '<button type="button" data-view="all" class="is-active">All matches</button>' +
    '<button type="button" data-view="live">🔴 Live</button>' +
    '<button type="button" data-view="upcoming">Upcoming</button>' +
    '<button type="button" data-view="results">Results</button></div>' +
    '<span id="mc-provider-status" role="status">Connecting to live score feed…</span>';
  if (toolbar) toolbar.insertAdjacentElement("afterend", bar);
  const search = document.getElementById("mc-search");
  const format = document.getElementById("mc-format");
  const team = document.getElementById("mc-team");
  const count = document.getElementById("mc-count");
  // Preserve the BCCI snapshot rendered by match-center.js before trying the live API.
  const snapshotCards = Array.from(host.querySelectorAll(".match-center-card")).filter((card) => {
    const text = card.querySelector(".mc-teams")?.innerText || "";
    const teams = text.split(/\\s+VS\\s+/i).map((s) => s.trim());
    return teams.some((name) => /^India(?:\\s+(?:Women|Men))?$/i.test(name));
  });
  const fallbackHTML = snapshotCards.length
    ? snapshotCards.map((card) => card.outerHTML).join("")
    : '<p class="activity-empty">CricAPI data is loading. India fixtures will appear here when available.</p>';
  const fallbackCount = String(snapshotCards.length);
  let view = "all";
  let matches = [];
  let hasLiveData = false;
  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const link = (url, label) =>
    '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + " ↗</a>";
  function render() {
    const q = ((search && search.value) || "").trim().toLowerCase();
    const f = format ? format.value : "all";
    const t = team ? team.value : "all";
    const filtered = matches.filter((m) => {
      const hay = [m.title, m.team1, m.team2, m.series, m.venue, m.format].join(" ").toLowerCase();
      const women = /women/i.test(m.team1 + " " + m.team2);
      const indiaA = /india a/i.test(m.team1 + " " + m.team2);
      const indiaMen = /india/i.test(m.team1 + " " + m.team2) && !women && !indiaA;
      return (
        (!q || hay.includes(q)) &&
        (f === "all" || m.format === f) &&
        (t === "all" ||
          (t === "women" && women) ||
          (t === "india-a" && indiaA) ||
          (t === "india-men" && indiaMen))
      );
    });
    if (count) count.textContent = String(filtered.length);
    host.innerHTML = filtered.length
      ? filtered
          .map((m) => {
            const d = m.startTime ? new Date(m.startTime) : null;
            const dateLabel =
              d && !Number.isNaN(d.getTime())
                ? d.toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })
                : "Date to be confirmed";
            const timeLabel =
              d && !Number.isNaN(d.getTime())
                ? d.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  }) + " IST"
                : "Time TBA";
            const scores =
              m.score1 || m.score2
                ? '<div class="mc-live-scores"><strong>' +
                  esc(m.score1 || "Yet to bat") +
                  "</strong><span>VS</span><strong>" +
                  esc(m.score2 || "Yet to bat") +
                  "</strong></div>"
                : "";
            return (
              '<article class="match-center-card">' +
              '<div class="mc-card-top"><span class="mc-date">' +
              esc(dateLabel) +
              '</span><span class="mc-status ' +
              (m.status === "Live" ? "is-live" : "") +
              '">' +
              esc(m.status) +
              "</span></div>" +
              '<div class="mc-series">' +
              esc(m.series) +
              "</div>" +
              '<div class="mc-teams"><strong>' +
              esc(m.team1) +
              "</strong><span>VS</span><strong>" +
              esc(m.team2) +
              "</strong></div>" +
              "<h3>" +
              esc(m.title || m.team1 + " vs " + m.team2) +
              "</h3>" +
              scores +
              '<div class="mc-meta"><span>◷ ' +
              esc(timeLabel) +
              "</span><span>⌖ " +
              esc(m.venue || "Venue TBA") +
              "</span><span>" +
              esc(m.format || "Cricket") +
              "</span></div>" +
              '<div class="mc-card-links">' +
              link(
                m.scorecardUrl || m.matchUrl || "https://www.espncricinfo.com/live-cricket-score",
                "Scorecard",
              ) +
              link(m.bcciUrl || "https://www.bcci.tv/matches", "BCCI details") +
              "</div></article>"
            );
          })
          .join("")
      : '<p class="activity-empty">' +
        (hasLiveData
          ? "No matches found for this category or filters."
          : "No match data is available right now. Please try again shortly.") +
        "</p>";
  }
  async function refresh() {
    const status = document.getElementById("mc-provider-status");
    if (status) status.textContent = "Updating fixtures and scores…";
    try {
      const response = await fetch("/api/matches?view=" + encodeURIComponent(view), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!Array.isArray(data.matches)) throw new Error("Invalid feed");
      matches = data.matches.map((m) => {
        const rawFormat = String(m.format || "").toLowerCase();
        return Object.assign({}, m, {
          format: /test|first.?class/.test(rawFormat)
            ? "FC"
            : /odi|one.day/.test(rawFormat)
              ? "ODI"
              : /list.?a/.test(rawFormat)
                ? "List A"
                : /t20/.test(rawFormat)
                  ? "T20I"
                  : m.format || "Other",
        });
      });
      hasLiveData = Boolean(data.providerOk && matches.length);
      if (!data.providerOk || matches.length === 0) {
        // Do not replace known fixtures with an empty screen when the external feed fails.
        matches = [];
        host.innerHTML = fallbackHTML;
        if (count) count.textContent = fallbackCount;
      } else {
        render();
      }
      if (status)
        status.textContent =
          (data.providerOk && data.total > 0
            ? "CricAPI connected"
            : "CricAPI unavailable · showing saved India fixtures") +
          (data.providerOk && data.total > 0
            ? " · " + data.total + " matches · Refreshed "
            : " · Refreshed ") +
          new Date(data.updatedAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          }) +
          " IST";
    } catch (_) {
      hasLiveData = false;
      if (status) status.textContent = "CricAPI unavailable · showing saved India fixtures";
      host.innerHTML = fallbackHTML;
      if (count) count.textContent = fallbackCount;
    }
  }
  bar.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      view = button.dataset.view;
      bar
        .querySelectorAll("[data-view]")
        .forEach((b) => b.classList.toggle("is-active", b === button));
      refresh();
    }),
  );
  [search, format, team]
    .filter(Boolean)
    .forEach((el) => el.addEventListener(el.tagName === "INPUT" ? "input" : "change", render));
  refresh();
  window.setInterval(refresh, 60000);
})();
