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
    const teams = text.split(/\s+VS\s+/i).map((s) => s.trim());
    return teams.some((name) => /^India(?:\s+(?:Women|Men))?$/i.test(name));
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
                ? '<div class="mc-live-scoreboard ' +
                  (m.status === "Live" ? "is-live" : "") +
                  '">' +
                  '<div class="mc-scoreboard-heading"><span>' +
                  (m.status === "Live"
                    ? '<i class="mc-live-dot"></i> LIVE SCOREBOARD'
                    : "SCOREBOARD") +
                  "</span><small>" +
                  esc(m.format || "CRICKET") +
                  "</small></div>" +
                  '<div class="mc-live-scores"><strong>' +
                  esc(m.score1 || "Yet to bat") +
                  "</strong><span>VS</span><strong>" +
                  esc(m.score2 || "Yet to bat") +
                  "</strong></div>" +
                  (m.status === "Live"
                    ? '<div class="mc-live-progress"><span></span></div><small class="mc-scoreboard-note">Live feed · updates automatically</small>'
                    : "") +
                  "</div>"
                : m.status === "Live"
                  ? '<div class="mc-live-scoreboard is-live"><div class="mc-scoreboard-heading"><span><i class="mc-live-dot"></i> LIVE MATCH</span></div><p class="mc-scoreboard-note">Live score is not available from the feed yet.</p></div>'
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
              '<button type="button" class="mc-open-scoreboard" data-scoreboard-id="' +
              esc(m.id) +
              '">Scoreboard ↗</button>' +
              link(m.bcciUrl || "https://www.bcci.tv/matches", "BCCI fixtures") +
              "</div></article>"
            );
          })
          .join("")
      : '<p class="activity-empty">' +
        (hasLiveData
          ? "No matches found for this category or filters."
          : view === "upcoming"
            ? "No upcoming India fixtures returned by CricAPI yet."
            : view === "live"
              ? "No India matches are live right now."
              : view === "results"
                ? "No recent India results returned right now."
                : "No India matches returned right now.") +
        "</p>";
  }
  function ensureScoreboardModal() {
    if (document.getElementById("mc-scoreboard-modal")) return;
    const modal = document.createElement("div");
    modal.id = "mc-scoreboard-modal";
    modal.className = "mc-scoreboard-modal";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="mc-scoreboard-backdrop" data-scoreboard-close></div><section class="mc-scoreboard-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-scoreboard-title"><header class="mc-scoreboard-modal-head"><div><span class="mc-scoreboard-kicker">TILAK VARMA FAN CLUB · MATCH CENTER</span><h2 id="mc-scoreboard-title">MATCH SCOREBOARD</h2></div><button type="button" class="mc-scoreboard-close" data-scoreboard-close aria-label="Close scoreboard">✕</button></header><div id="mc-scoreboard-content"></div></section>';
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-scoreboard-close]")) {
        modal.hidden = true;
        document.body.classList.remove("mc-scoreboard-open");
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) {
        modal.hidden = true;
        document.body.classList.remove("mc-scoreboard-open");
      }
    });
  }
  async function openScoreboard(id) {
    const m = matches.find((item) => String(item.id) === String(id));
    if (!m) return;
    ensureScoreboardModal();
    const modal = document.getElementById("mc-scoreboard-modal");
    const content = document.getElementById("mc-scoreboard-content");
    const d = m.startTime ? new Date(m.startTime) : null;
    const date =
      d && !Number.isNaN(d.getTime())
        ? d.toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Kolkata",
          }) + " IST"
        : "Date / time TBA";
    const isLive = m.status === "Live";
    const score = (value) => (value ? esc(value) : '<span class="mc-score-yet">Yet to bat</span>');
    content.innerHTML =
      '<div class="mc-scoreboard-match-meta"><span class="' +
      (isLive ? "is-live" : "") +
      '">' +
      (isLive ? '<i class="mc-live-dot"></i> LIVE' : esc(m.status || "Scheduled")) +
      "</span><span>" +
      esc(m.format || "Cricket") +
      "</span><span>" +
      esc(date) +
      '</span></div><div class="mc-scoreboard-teams"><article><span class="mc-score-team-label">TEAM 1</span><h3>' +
      esc(m.team1 || "Team 1") +
      "</h3><strong>" +
      score(m.score1) +
      '</strong></article><div class="mc-scoreboard-vs">VS</div><article><span class="mc-score-team-label">TEAM 2</span><h3>' +
      esc(m.team2 || "Team 2") +
      "</h3><strong>" +
      score(m.score2) +
      '</strong></article></div><div class="mc-scoreboard-result">' +
      esc(
        m.result ||
          (isLive
            ? "Match in progress"
            : m.status === "Result"
              ? "Match completed"
              : "Match has not started yet"),
      ) +
      '</div><div class="mc-scoreboard-details"><div><small>SERIES</small><strong>' +
      esc(m.series || "International cricket") +
      "</strong></div><div><small>VENUE</small><strong>" +
      esc(m.venue || "Venue TBA") +
      '</strong></div></div><div id="mc-scoreboard-details-live"><p class="mc-scorecard-loading">Loading full batting &amp; bowling scorecard…</p></div><p class="mc-scoreboard-disclaimer">Detailed innings appear when CricAPI provides them for this match.</p><div class="mc-scoreboard-actions">' +
      link(m.bcciUrl || "https://www.bcci.tv/matches", "Official BCCI match centre") +
      '<button type="button" data-scoreboard-close>Close scoreboard</button></div>';
    modal.hidden = false;
    document.body.classList.add("mc-scoreboard-open");
    const root = document.getElementById("mc-scoreboard-details-live");
    if (!m.matchId) {
      root.innerHTML =
        '<p class="mc-scorecard-loading">No provider match ID is available for detailed scorecard.</p>';
      return;
    }
    try {
      const response = await fetch("/api/scoreboard?id=" + encodeURIComponent(m.matchId), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok)
        throw new Error(payload.error || "Detailed scorecard unavailable");
      const data = payload.data || {};
      const innings = Array.isArray(data.scorecard)
        ? data.scorecard
        : Array.isArray(data.innings)
          ? data.innings
          : Array.isArray(data.scorecards)
            ? data.scorecards
            : [];
      const rows = (items, type) =>
        (Array.isArray(items) ? items : [])
          .map((p) => {
            const name =
              type === "bat"
                ? p.batsman?.name || p.batter?.name || p.name || p.batsman || p.batter || "Batter"
                : p.bowler?.name || p.name || p.bowler || "Bowler";
            if (type === "bat")
              return (
                "<tr><td><strong>" +
                esc(name) +
                "</strong>" +
                (p.dismissal || p.outDesc || p.howOut
                  ? "<small>" + esc(p.dismissal || p.outDesc || p.howOut) + "</small>"
                  : "") +
                "</td><td>" +
                esc(p.r ?? p.runs ?? "—") +
                "</td><td>" +
                esc(p.b ?? p.balls ?? p.ballsFaced ?? "—") +
                "</td><td>" +
                esc(p["4s"] ?? p.fours ?? "—") +
                "</td><td>" +
                esc(p["6s"] ?? p.sixes ?? "—") +
                "</td><td>" +
                esc(p.sr ?? p.strikeRate ?? "—") +
                "</td></tr>"
              );
            return (
              "<tr><td><strong>" +
              esc(name) +
              "</strong></td><td>" +
              esc(p.o ?? p.overs ?? "—") +
              "</td><td>" +
              esc(p.m ?? p.maidens ?? "—") +
              "</td><td>" +
              esc(p.r ?? p.runs ?? "—") +
              "</td><td>" +
              esc(p.w ?? p.wickets ?? "—") +
              "</td><td>" +
              esc(p.eco ?? p.economy ?? "—") +
              "</td></tr>"
            );
          })
          .join("");
      const tables = innings
        .map((inn, i) => {
          const batting = inn.batting || inn.batsmen || inn.battingScorecard || [];
          const bowling = inn.bowling || inn.bowlers || inn.bowlingScorecard || [];
          const title =
            inn.inning || inn.innings || inn.teamName || inn.team?.name || "Innings " + (i + 1);
          const total = [
            inn.r ?? inn.runs ?? inn.score,
            inn.w != null ? inn.w + " wkts" : inn.wickets != null ? inn.wickets + " wkts" : "",
            inn.o != null ? inn.o + " ov" : inn.overs != null ? inn.overs + " ov" : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            '<section class="mc-innings-card"><header><h3>' +
            esc(title) +
            "</h3><strong>" +
            esc(total) +
            "</strong></header>" +
            (batting.length
              ? '<h4>Batting</h4><div class="mc-score-table-wrap"><table class="mc-score-table"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>' +
                rows(batting, "bat") +
                "</tbody></table></div>"
              : "") +
            (bowling.length
              ? '<h4>Bowling</h4><div class="mc-score-table-wrap"><table class="mc-score-table"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>' +
                rows(bowling, "bowl") +
                "</tbody></table></div>"
              : "") +
            "</section>"
          );
        })
        .join("");
      root.innerHTML =
        tables ||
        '<p class="mc-scorecard-loading">CricAPI responded, but detailed batting/bowling innings were not included for this match.</p>';
    } catch (error) {
      root.innerHTML =
        '<p class="mc-scorecard-loading">' +
        esc(error.message || "Detailed scorecard could not be loaded.") +
        "</p>";
    }
  }
  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-scoreboard-id]");
    if (button) openScoreboard(button.dataset.scoreboardId);
  });
  async function refresh() {
    const status = document.getElementById("mc-provider-status");
    if (status) status.textContent = "Refreshing live scoreboards…";
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
      hasLiveData = Boolean(data.providerOk);
      if (!data.providerOk) {
        // Do not replace known fixtures with an empty screen when the external feed fails.
        matches = [];
        host.innerHTML = fallbackHTML;
        if (count) count.textContent = fallbackCount;
      } else {
        render();
      }
      if (status)
        status.textContent =
          (data.providerOk ? "CricAPI connected" : "CricAPI unavailable") +
          (data.providerOk ? " · " + data.total + " matches · Refreshed " : " · Refreshed ") +
          new Date(data.updatedAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          }) +
          " IST";
    } catch (_) {
      hasLiveData = false;
      if (status) status.textContent = "CricAPI unavailable · retrying automatically";
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
  window.setInterval(refresh, 30000);
})();
