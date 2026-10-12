(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const formatIndiaTimestamp = (value) => {
    if (!value) return "time unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(date) + " IST";
  };
  const number = (value) =>
    typeof value === "number" ? value.toLocaleString("en-IN") : (value ?? "—");
  async function init() {
    const statsHost = $("home-quick-stats");
    const inningsHost = $("home-recent-innings");
    try {
      const data = await window.TilakSiteData.load();
      const career = data.careerFormats?.T20I || data.careerStats || {};
      if (statsHost) {
        const metrics = [
          ["T20I RUNS", number(career.runs ?? data.careerStats?.t20iRuns)],
          ["HIGHEST SCORE", career.highestScore ?? data.careerStats?.highestScore],
          ["BATTING AVERAGE", career.average ?? data.careerStats?.average],
          ["STRIKE RATE", career.strikeRate ?? data.careerStats?.strikeRate],
        ];
        statsHost.innerHTML = metrics
          .map(
            ([label, value]) =>
              '<article class="home-mini-stat"><span>' +
              esc(label) +
              "</span><strong>" +
              esc(value) +
              "</strong></article>",
          )
          .join("");
      }
      const formatHost = $("home-format-stats");
      if (formatHost) {
        const order = [
          ["ODI", "ODI"],
          ["FC", "First-class"],
          ["T20I", "T20I"],
          ["LIST A", "List A"],
          ["IPL", "IPL"],
          ["OVERALL T20", "Overall T20 (all competitions)"],
        ];
        formatHost.innerHTML = order
          .map(([label, key]) => {
            const s = data.careerFormats?.[key];
            if (!s) return "";
            return (
              '<article class="home-format-card"><span>' +
              esc(label) +
              "</span><strong>" +
              esc(number(s.runs)) +
              "</strong><small>" +
              esc(s.matches ?? "—") +
              " matches · HS " +
              esc(s.highestScore ?? "—") +
              '</small><div class="home-format-facts">' +
              [
                ["INN", s.innings],
                ["NO", s.notOuts],
                ["4s", s.fours],
                ["6s", s.sixes],
                ["50s", s.fifties],
                ["100s", s.hundreds],
              ]
                .map(
                  ([fact, value]) =>
                    '<div class="home-format-fact"><span>' +
                    esc(fact) +
                    "</span><strong>" +
                    esc(value ?? "—") +
                    "</strong></div>",
                )
                .join("") +
              "</div><small>AVG " +
              esc(s.average ?? "—") +
              " · SR " +
              esc(s.strikeRate ?? "—") +
              "</small></article>"
            );
          })
          .filter(Boolean)
          .join("");
      }
      if ($("home-data-updated")) {
        const stamps = [
          data.lastUpdated,
          data.lastChecked,
          data.careerStatsUpdated,
          data.recentUpdated,
          data.statsguru?.updatedAt,
          data.bowlingStats?.updatedAt,
        ]
          .filter((value) => typeof value === "string" && value.trim())
          .map((value) => ({
            value,
            time: Date.parse(value.replace(" UTC", "Z").replace(" ", "T")),
          }))
          .filter((item) => Number.isFinite(item.time))
          .sort((a, b) => b.time - a.time);
        $("home-data-updated").textContent =
          "Last update: " + formatIndiaTimestamp(stamps[0]?.value);
      }
      // Statsguru match rows refresh independently of the Cricsheet recent-form
      // archive. Prefer the verified cross-format match index so a new match can
      // appear here even while the secondary archive is a few days behind.
      const parseMatchDate = (value) => {
        const raw = String(value || "").trim();
        const direct = Date.parse(raw);
        if (Number.isFinite(direct)) return direct;
        const match = raw.match(/^(\\d{1,2})\\s+([A-Za-z]{3,})\\s+(\\d{4})$/);
        if (match) {
          const parsed = Date.parse(match[1] + " " + match[2] + " " + match[3] + " UTC");
          if (Number.isFinite(parsed)) return parsed;
        }
        return 0;
      };
      const normalizeOpponent = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/^v\\s+/, "")
          .replace(/^india\\s+vs\\s+/, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const candidates = [
        ...(Array.isArray(data.playerMatches)
          ? data.playerMatches.filter((row) => row.format === "T20I")
          : []),
        ...(Array.isArray(data.recentInnings) ? data.recentInnings : []),
      ]
        .filter((row) => row && row.date && row.opposition)
        .sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));
      const seenMatches = new Set();
      const rows = candidates
        .filter((row) => {
          const key = [
            Math.floor(parseMatchDate(row.date) / 86400000),
            normalizeOpponent(row.opposition),
          ].join("|");
          if (seenMatches.has(key)) return false;
          seenMatches.add(key);
          return true;
        })
        .slice(0, 4);
      if (inningsHost)
        inningsHost.innerHTML = rows.length
          ? rows
              .map((row) => {
                const runs = row.runs === "DNB" ? "DNB" : (row.runs ?? "—");
                return (
                  '<article class="home-innings-row"><div class="home-innings-score"><strong>' +
                  esc(runs) +
                  "</strong><span>" +
                  esc(row.balls === "—" || row.balls == null ? "balls —" : row.balls + " balls") +
                  '</span></div><div class="home-innings-detail"><strong>' +
                  esc(row.opposition || "Opponent unavailable") +
                  "</strong><span>" +
                  esc(row.date || "Date unavailable") +
                  " · " +
                  esc(row.format || "Cricket") +
                  "</span><small>" +
                  esc(row.result || row.venue || "") +
                  "</small></div></article>"
                );
              })
              .join("")
          : '<p class="activity-empty">No recent innings are available yet.</p>';
    } catch (error) {
      if (statsHost)
        statsHost.innerHTML =
          '<p class="activity-empty">Career snapshot temporarily unavailable.</p>';
      if (inningsHost)
        inningsHost.innerHTML = '<p class="activity-empty">Recent innings could not be loaded.</p>';
    }
  }
  init();
})();
