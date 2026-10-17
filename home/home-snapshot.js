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
      const formatOrder = [
        ["ODIs", "ODI"],
        ["T20Is", "T20I"],
        ["FC", "First-class"],
        ["List A", "List A"],
        ["T20s", "Overall T20 (all competitions)"],
      ];
      const cell = (value) => "<td>" + esc(value ?? "—") + "</td>";
      const table = (heading, columns, rows, className) =>
        '<section class="home-career-table-section ' +
        className +
        '-section" aria-label="' +
        esc(heading) +
        '"><h3 class="home-career-table-title">' +
        esc(heading) +
        '</h3><div class="home-career-table-wrap"><table class="home-career-table ' +
        className +
        '"><thead><tr>' +
        columns.map((column) => '<th scope="col">' + esc(column) + "</th>").join("") +
        "</tr></thead><tbody>" +
        rows.join("") +
        "</tbody></table></div></section>";
      if (formatHost) {
        const formats = formatOrder
          .map(([label, key]) => {
            const s = data.careerFormats?.[key];
            if (!s) return "";
            // Fielding totals live in the dedicated fieldingStats dataset,
            // not in the batting Statsguru format object.
            const fieldingKey =
              key === "First-class" ? "FC" : key === "Overall T20 (all competitions)" ? "T20" : key;
            const fielding = data.fieldingStats?.formats?.[fieldingKey]?.summary || {};
            const rows = [
              label,
              s.matches,
              s.innings,
              s.notOuts,
              number(s.runs),
              s.highestScore,
              s.average,
              number(s.balls),
              s.strikeRate,
              s.hundreds,
              s.fifties,
              s.fours,
              s.sixes,
              s.catches ?? fielding.catches ?? fielding.Ct,
              s.stumpings ?? fielding.stumpings ?? fielding.St,
            ];
            return "<tr>" + rows.map(cell).join("") + "</tr>";
          })
          .filter(Boolean);
        formatHost.innerHTML = table(
          "BATTING & FIELDING",
          [
            "Format",
            "Mat",
            "Inns",
            "NO",
            "Runs",
            "HS",
            "Ave",
            "BF",
            "SR",
            "100s",
            "50s",
            "4s",
            "6s",
            "Ct",
            "St",
          ],
          formats,
          "home-batting-table",
        );
      }
      const bowlingHost = $("home-bowling-stats");
      const bowlingUpdated = $("home-bowling-updated");
      const bowling = data.bowlingStats || {};
      const bowlingFormats = bowling.formats || {};
      if (bowlingHost) {
        const bowlingOrder = [
          ["ODIs", "ODI"],
          ["T20Is", "T20I"],
          ["FC", "FC"],
          ["List A", "List A"],
          ["T20s", "T20"],
        ];
        const rows = bowlingOrder
          .map(([label, key]) => {
            const s = bowlingFormats[key]?.summary || bowlingFormats[key];
            if (!s) return "";
            return (
              "<tr>" +
              [
                label,
                s.matches,
                s.innings,
                s.balls ??
                  (typeof s.overs === "number"
                    ? Math.floor(s.overs) * 6 + Math.round((s.overs % 1) * 10)
                    : null),
                number(s.runs ?? s.runsConceded),
                s.wickets ?? s.wicketsTaken,
                s.bestBowling ?? s.bestFigures,
                s.bestMatchBowling ?? s.bestMatchFigures,
                s.average,
                s.economy,
                s.strikeRate,
                s.fourWickets ?? s.fourWicketHauls,
                s.fiveWickets ?? s.fiveWicketHauls,
                s.tenWickets ?? s.tenWicketHauls,
              ]
                .map(cell)
                .join("") +
              "</tr>"
            );
          })
          .filter(Boolean);
        bowlingHost.innerHTML = rows.length
          ? table(
              "BOWLING",
              [
                "Format",
                "Mat",
                "Inns",
                "Balls",
                "Runs",
                "Wkts",
                "BBI",
                "BBM",
                "Ave",
                "Econ",
                "SR",
                "4w",
                "5w",
                "10w",
              ],
              rows,
              "home-bowling-table",
            )
          : '<p class="activity-empty">No verified bowling summary is saved yet.</p>';
      }
      // Keep CAREER SUMMARY above the career tables and place the Stats link underneath them.
      const summaryHeading = document.querySelector(
        ".home-snapshot-section .home-snapshot-heading",
      );
      const bowlingTableSection = document.querySelector(
        ".home-snapshot-section .home-bowling-table-section",
      );
      if (summaryHeading) {
        const label = summaryHeading.querySelector(".eyebrow");
        if (label) {
          label.textContent = "CAREER SUMMARY";
          label.setAttribute("aria-label", "Career summary");
        }
        const oldTitle = summaryHeading.querySelector("h2");
        if (oldTitle) oldTitle.remove();
        const actions = summaryHeading.querySelector(".home-heading-actions");
        if (actions) actions.remove();
        summaryHeading.classList.add("home-summary-animated-label");
        const formatHost = $("home-format-stats");
        if (formatHost && summaryHeading.parentElement !== formatHost.parentElement) {
          formatHost.insertAdjacentElement("beforebegin", summaryHeading);
        }
      }
      if (bowlingTableSection) {
        let allStatsLink = document.querySelector(".home-snapshot-section .home-all-stats-bottom");
        if (!allStatsLink) {
          allStatsLink = document.createElement("a");
          allStatsLink.className = "button outline home-all-stats-bottom";
          allStatsLink.href = "/stats/";
          allStatsLink.textContent = "All career stats ↗";
          allStatsLink.setAttribute("aria-label", "Open all career stats in the Stats section");
        }
        bowlingTableSection.insertAdjacentElement("afterend", allStatsLink);
      }
      if (bowlingUpdated) {
        const updated = bowling.updatedAt || bowling.lastUpdated;
        const source = bowling.source || "Saved bowling snapshot";
        bowlingUpdated.textContent =
          source + " · " + (updated ? formatIndiaTimestamp(updated) : "update date unavailable");
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
        const match = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
        if (match) {
          const parsed = Date.parse(match[1] + " " + match[2] + " " + match[3] + " UTC");
          if (Number.isFinite(parsed)) return parsed;
        }
        return 0;
      };
      // Calendar-date key avoids timezone drift between ISO dates and text dates.
      const matchDayKey = (value) => {
        const raw = String(value || "").trim();
        const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
        const human = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
        if (human) {
          const month = new Date(human[2] + " 1, 2000").getMonth() + 1;
          if (month >= 1 && month <= 12)
            return (
              human[3] + "-" + String(month).padStart(2, "0") + "-" + human[1].padStart(2, "0")
            );
        }
        const timestamp = parseMatchDate(raw);
        return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
      };
      const normalizeOpponent = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/^v\s+/, "")
          .replace(/^india\s+vs\s+/, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const candidates = [
        ...(data.statsguru?.formats?.T20I?.innings || []).map((row) => ({
          ...row,
          format: "T20I",
          source: row.source || "ESPNcricinfo Statsguru",
        })),
      ]
        .filter((row) => row && row.date && row.opposition)
        .sort((a, b) => parseMatchDate(b.date) - parseMatchDate(a.date));
      const seenMatches = new Set();
      const rows = candidates
        .filter((row) => {
          const key = [matchDayKey(row.date), normalizeOpponent(row.opposition)].join("|");
          if (seenMatches.has(key)) return false;
          seenMatches.add(key);
          return true;
        })
        .slice(0, 5);
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

  // Lock horizontal swipes to the Bowling table so diagonal finger movement
  // does not accidentally scroll the whole page. Vertical gestures remain native.
  let bowlingTouchStart = null;
  document.addEventListener(
    "touchstart",
    (event) => {
      const wrap = event.target.closest(".home-bowling-table-section .home-career-table-wrap");
      if (!wrap || !event.touches || event.touches.length !== 1) {
        bowlingTouchStart = null;
        return;
      }
      bowlingTouchStart = {
        wrap,
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        scrollLeft: wrap.scrollLeft,
        axis: null,
      };
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      if (!bowlingTouchStart || !event.touches || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - bowlingTouchStart.x;
      const dy = touch.clientY - bowlingTouchStart.y;
      if (!bowlingTouchStart.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 7) {
        bowlingTouchStart.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      }
      if (bowlingTouchStart.axis === "x") {
        if (event.cancelable) event.preventDefault();
        bowlingTouchStart.wrap.scrollLeft = bowlingTouchStart.scrollLeft - dx;
      }
    },
    { passive: false },
  );
  document.addEventListener(
    "touchend",
    () => {
      bowlingTouchStart = null;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchcancel",
    () => {
      bowlingTouchStart = null;
    },
    { passive: true },
  );

  init();
})();
