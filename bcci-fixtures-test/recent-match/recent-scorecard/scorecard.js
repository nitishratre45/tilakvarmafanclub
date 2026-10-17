(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const id = q.get("matchId");
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const fmtDate = (v) =>
    v
      ? new Date(v + "T12:00:00Z").toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : "Date unavailable";
  function table(heads, rows) {
    return (
      '<div class="sc-table-wrap"><table class="sc-table"><thead><tr>' +
      heads.map((h) => "<th>" + esc(h) + "</th>").join("") +
      "</tr></thead><tbody>" +
      (Array.isArray(rows) ? rows.join("") : String(rows ?? "")) +
      "</tbody></table></div>"
    );
  }
  function battingRows(rows) {
    return (rows || [])
      .map(
        (p) =>
          "<tr><td>" +
          esc(p.batter) +
          '<span class="sc-dismissal">' +
          esc(p.dismissalDetails || p.dismissal || (p.notOut ? "not out" : "")) +
          "</span></td><td>" +
          esc(p.runs ?? "—") +
          "</td><td>" +
          esc(p.balls ?? "—") +
          "</td><td>" +
          esc(p.fours ?? 0) +
          "</td><td>" +
          esc(p.sixes ?? 0) +
          "</td><td>" +
          esc(p.strikeRate ?? "—") +
          "</td></tr>",
      )
      .join("");
  }
  function bowlingRows(rows) {
    return (rows || [])
      .map(
        (p) =>
          "<tr><td>" +
          esc(p.bowler) +
          "</td><td>" +
          esc(p.overs ?? "—") +
          "</td><td>" +
          esc(p.maidens ?? 0) +
          "</td><td>" +
          esc(p.runs ?? "—") +
          "</td><td>" +
          esc(p.wickets ?? 0) +
          "</td><td>" +
          esc(p.economy ?? "—") +
          "</td></tr>",
      )
      .join("");
  }
  function inningsView(inn) {
    const extras = inn.extrasBreakdown || {};
    const ex =
      Object.entries(extras)
        .map(([k, v]) => k.replace(/_/g, " ") + ": " + v)
        .join(" · ") || "No extras recorded";
    const fow =
      (inn.fallOfWickets || [])
        .map((w) => w.wicket + "-" + w.score + " (" + w.batter + ", " + w.over + ")")
        .join(" · ") || "Fall of wickets unavailable";
    return (
      '<section class="sc-innings"><h3>' +
      esc(inn.team) +
      ' <span class="sc-total">' +
      esc(inn.runs) +
      "/" +
      esc(inn.wickets) +
      " · " +
      esc(inn.overs) +
      " ov</span></h3>" +
      table(["Batter", "R", "B", "4s", "6s", "SR"], battingRows(inn.batting)) +
      '<div class="sc-extras"><b>Extras ' +
      esc(inn.extras ?? 0) +
      ":</b> " +
      esc(ex) +
      "</div>" +
      table(["Bowler", "O", "M", "R", "W", "Econ"], bowlingRows(inn.bowling)) +
      '<div class="sc-fow"><b>Fall of wickets:</b> ' +
      esc(fow) +
      "</div></section>"
    );
  }
  function findCompatibleMatch(matches, requestedId) {
    const parts = String(requestedId || "").match(
      /^(\d{4})(?:-(\d{2})-(\d{2}))?-(t20i|odi|test)-(.+)$/i,
    );
    if (!parts) return null;
    const year = parts[1];
    const date = parts[2] && parts[3] ? year + "-" + parts[2] + "-" + parts[3] : "";
    const format = { t20i: "T20I", odi: "ODI", test: "Test" }[parts[4].toLowerCase()];
    const tail = parts[5].toLowerCase();
    const slug = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return (
      (matches || []).find((m) => {
        if (String(m.format || "").toLowerCase() !== format.toLowerCase()) return false;
        if (String(m.date || "").slice(0, 4) !== year) return false;
        if (date && String(m.date || "").slice(0, 10) !== date) return false;
        const teams = m.teams || [];
        if (teams.length !== 2) return false;
        const teamPair = slug(teams[0]) + "-vs-" + slug(teams[1]);
        const reversePair = slug(teams[1]) + "-vs-" + slug(teams[0]);
        return tail.startsWith(teamPair) || tail.startsWith(reversePair);
      }) || null
    );
  }
  async function fetchWithTimeout(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  async function init() {
    if (!id) {
      $("sc-loading").hidden = true;
      $("sc-error").hidden = false;
      $("sc-error").textContent =
        "No match selected. Return to Recent Matches and open a scorecard.";
      return;
    }
    try {
      let match = null;
      let lastError = null;

      // Fast path: match IDs identify the year and format, so load only that compact year bundle first.
      // Supports IDs shaped like YYYY-MM-DD-format-... and older YYYY-format-... IDs.
      const idParts = id.match(/^(\d{4})-(?:(\d{2})-(\d{2})-)?(t20i|odi|test)-/i);
      if (idParts) {
        const year = idParts[1];
        const formatSlug = (idParts[4] || idParts[2] || "").toLowerCase();
        try {
          const response = await fetchWithTimeout(
            "/bcci-fixtures-test/recent-match/data/" + formatSlug + "-" + year + ".json",
            45000,
          );
          if (!response.ok) throw Error("Year bundle returned HTTP " + response.status);
          const bundle = await response.json();
          match =
            (bundle.matches || []).find((m) => m.matchId === id) ||
            findCompatibleMatch(bundle.matches, id);
          if (!match) lastError = Error("Selected match ID was not found in the year bundle.");
        } catch (error) {
          lastError = error;
        }
      }

      // Fallback to the archive index only if the year bundle did not contain this match.
      if (!match) {
        try {
          const indexResponse = await fetchWithTimeout(
            "/bcci-fixtures-test/recent-match/archive-index.json",
            45000,
          );
          if (!indexResponse.ok) throw Error("Archive index returned HTTP " + indexResponse.status);
          const index = await indexResponse.json();
          const row = (index.matches || []).find((m) => m.matchId === id);
          if (!row) throw Error("Selected match ID is not in the archive index.");
          const bundleResponse = await fetchWithTimeout(row.scorecard, 45000);
          if (!bundleResponse.ok)
            throw Error("Scorecard bundle returned HTTP " + bundleResponse.status);
          const bundle = await bundleResponse.json();
          match = (bundle.matches || []).find((m) => m.matchId === id) || null;
          if (!match) throw Error("Selected match ID was not found in the scorecard bundle.");
        } catch (error) {
          lastError = error;
        }
      }
      if (!match) {
        const idParts = id.match(/^(\d{4})-(?:(\d{2})-(\d{2})-)?(t20i|odi|test)-/i);
        if (idParts) {
          const year = idParts[1];
          const formatSlug = (idParts[4] || idParts[2] || "").toLowerCase();
          const bundleUrl =
            "/bcci-fixtures-test/recent-match/data/" + formatSlug + "-" + year + ".json";
          const response = await fetchWithTimeout(bundleUrl);
          if (response.ok) {
            const bundle = await response.json();
            match = (bundle.matches || []).find((m) => m.matchId === id) || null;
          }
        }
      }
      if (!match) {
        throw Error(
          (lastError && lastError.message ? lastError.message + " " : "") +
            "Scorecard data could not be found. Check that the daily Cricsheet archive workflow has completed.",
        );
      }
      // Stable fallback navigation; keep scorecard loading independent from browser history.
      // Back button was intentionally removed from the scorecard page.
      $("sc-loading").hidden = true;
      const teams = (match.teams || []).join(" vs ");
      $("sc-content").hidden = false;
      $("sc-content").innerHTML =
        '<section class="sc-hero"><p class="sc-kicker">' +
        esc(match.format) +
        " · INTERNATIONAL MATCH SCORECARD</p><h1>" +
        esc(teams) +
        '</h1><p class="sc-result">' +
        esc(match.result || "Result unavailable") +
        '</p><div class="sc-meta"><div><small>DATE</small><strong>' +
        esc(fmtDate(match.date)) +
        "</strong></div><div><small>VENUE</small><strong>" +
        esc([match.venue, match.city].filter(Boolean).join(", ") || "Not recorded") +
        "</strong></div><div><small>PLAYER OF THE MATCH</small><strong>" +
        esc((match.playerOfMatch || []).join(", ") || "Not recorded") +
        "</strong></div><div><small>TOSS</small><strong>" +
        esc(
          match.toss?.winner
            ? match.toss.winner + " elected to " + (match.toss.decision || "")
            : "Not recorded",
        ) +
        "</strong></div><div><small>EVENT / SEASON</small><strong>" +
        esc([match.event, match.season].filter(Boolean).join(" · ") || "Not recorded") +
        '</strong></div><div><small>DATA SOURCE</small><strong>Cricsheet</strong></div></div></section><section class="sc-panel"><h2>Full Scorecard</h2>' +
        (match.innings || []).map(inningsView).join("") +
        '</section><section class="sc-panel"><h2>Match officials</h2><p>' +
        esc((match.officials?.umpires || []).join(", ") || "Umpires not recorded") +
        "</p><p>" +
        esc((match.officials?.match_referees || []).join(", ") || "Match referee not recorded") +
        "</p></section>";
      // Test matches use a full innings-by-innings layout; limited-overs formats keep the team switcher.
      if (String(match.format || "").toLowerCase() === "test") {
        const inningsSections = Array.from(document.querySelectorAll("#sc-content .sc-innings"));
        const ordinal = (n) => ({ 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" })[n] || n + "th";
        inningsSections.forEach((section, index) => {
          section.classList.add("sc-test-innings");
          const heading = section.querySelector("h3");
          if (heading) {
            const label = document.createElement("span");
            label.className = "sc-innings-label";
            label.textContent = ordinal(index + 1) + " INNINGS";
            heading.insertBefore(label, heading.firstChild);
          }
        });
        const innings = (match.innings || []).map((inn, index) => ({
          label: ordinal(index + 1) + " innings",
          team: inn.team || "Team",
          score: (inn.runs ?? 0) + "/" + (inn.wickets ?? 0),
          overs: inn.overs || "—",
        }));
        const summary = document.createElement("section");
        summary.className = "sc-panel sc-test-summary";
        summary.innerHTML =
          '<h2>Test Match · Innings Summary</h2><div class="sc-test-summary-grid">' +
          innings
            .map(
              (inn) =>
                '<article class="sc-test-summary-card"><small>' +
                esc(inn.label) +
                "</small><strong>" +
                esc(inn.team) +
                "</strong><span>" +
                esc(inn.score) +
                "</span><em>" +
                esc(inn.overs) +
                " overs</em></article>",
            )
            .join("") +
          '</div><p class="sc-test-note">All innings are shown in match order, including both innings for each team.</p>';
        const heroSection = document.querySelector("#sc-content .sc-hero");
        if (heroSection) heroSection.insertAdjacentElement("afterend", summary);

        // Sticky innings navigation: show one innings at a time, preserving match order.
        const fullScorecard = document.querySelector("#sc-content .sc-panel h2");
        const fullPanel = fullScorecard && fullScorecard.closest(".sc-panel");
        if (fullPanel && inningsSections.length) {
          const tabs = document.createElement("nav");
          tabs.className = "sc-test-innings-nav";
          tabs.setAttribute("aria-label", "Choose Test match innings");
          const teamCounts = {};
          const buttons = inningsSections.map((section, index) => {
            const team = (match.innings[index] && match.innings[index].team) || "Team";
            teamCounts[team] = (teamCounts[team] || 0) + 1;
            const teamInning = teamCounts[team];
            const ordinalTeamInning =
              { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" }[teamInning] || teamInning + "th";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sc-test-innings-tab";
            button.textContent = ordinalTeamInning + " · " + team;
            button.setAttribute("aria-controls", "sc-test-innings-" + (index + 1));
            button.addEventListener("click", () => {
              inningsSections.forEach((item, itemIndex) => {
                item.hidden = itemIndex !== index;
              });
              buttons.forEach((tab, tabIndex) => {
                tab.classList.toggle("is-active", tabIndex === index);
                tab.setAttribute("aria-pressed", tabIndex === index ? "true" : "false");
              });
            });
            section.id = "sc-test-innings-" + (index + 1);
            section.hidden = index !== 0;
            tabs.appendChild(button);
            return button;
          });
          buttons[0].classList.add("is-active");
          buttons[0].setAttribute("aria-pressed", "true");
          buttons.slice(1).forEach((button) => button.setAttribute("aria-pressed", "false"));
          // Keep the sticky bar outside the scorecard panel so ancestor overflow cannot break sticky positioning.
          summary.insertAdjacentElement("afterend", tabs);
        }
      }
      // Add compact metadata styling and a sticky two-team innings switcher.
      const hero = document.querySelector("#sc-content .sc-hero");
      if (hero) {
        const teamNamesForHero = (match.teams || []).slice(0, 2);
        const logoForTeam = (name) => {
          const n = String(name || "").toLowerCase();
          if (/india/.test(n)) return "https://flagcdn.com/w160/in.png";
          if (/west indies|windies/.test(n))
            return "https://commons.wikimedia.org/wiki/Special:FilePath/WestIndiesCricketlogo.png";
          if (/australia/.test(n)) return "https://flagcdn.com/w160/au.png";
          if (/england/.test(n)) return "https://flagcdn.com/w160/gb-eng.png";
          if (/pakistan/.test(n)) return "https://flagcdn.com/w160/pk.png";
          if (/new zealand/.test(n)) return "https://flagcdn.com/w160/nz.png";
          if (/south africa/.test(n)) return "https://flagcdn.com/w160/za.png";
          if (/sri lanka/.test(n)) return "https://flagcdn.com/w160/lk.png";
          if (/bangladesh/.test(n)) return "https://flagcdn.com/w160/bd.png";
          if (/afghanistan/.test(n)) return "https://flagcdn.com/w160/af.png";
          if (/ireland/.test(n)) return "https://flagcdn.com/w160/ie.png";
          if (/zimbabwe/.test(n)) return "https://flagcdn.com/w160/zw.png";
          return "";
        };
        const matchup = document.createElement("div");
        matchup.className = "sc-matchup";
        matchup.setAttribute("aria-label", "Teams playing");
        teamNamesForHero.forEach((team, i) => {
          const side = document.createElement("div");
          side.className = "sc-team-identity";
          const src = logoForTeam(team);
          if (src) {
            const img = document.createElement("img");
            img.className = "sc-team-logo";
            img.src = src;
            img.alt = team + " team logo";
            img.loading = "lazy";
            img.onerror = () => {
              img.remove();
              const fallback = document.createElement("span");
              fallback.className = "sc-team-logo-fallback";
              fallback.setAttribute("aria-hidden", "true");
              fallback.textContent = String(team)
                .split(/\\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase();
              side.insertBefore(fallback, side.firstChild);
            };
            side.appendChild(img);
          }
          const label = document.createElement("span");
          label.textContent = team;
          side.appendChild(label);
          matchup.appendChild(side);
          if (i === 0) {
            const vs = document.createElement("span");
            vs.className = "sc-vs";
            vs.textContent = "VS";
            matchup.appendChild(vs);
          }
        });
        const title = hero.querySelector("h1");
        if (title) {
          title.hidden = true;
          title.insertAdjacentElement("afterend", matchup);
        } else hero.appendChild(matchup);
      }
      if (hero) {
        hero.classList.add("sc-hero-compact");
        const meta = hero.querySelector(".sc-meta");
        if (meta) {
          meta.classList.add("sc-meta-compact");
          const items = Array.from(meta.children);
          items.forEach((item, i) => {
            if (i > 1) item.hidden = true;
          });
        }
        const result = hero.querySelector(".sc-result");
        if (result) result.classList.add("sc-result-compact");
      }
      const innings = Array.from(document.querySelectorAll("#sc-content .sc-innings"));
      const teamNames = (match.teams || []).slice(0, 2);
      if (
        String(match.format || "").toLowerCase() !== "test" &&
        innings.length &&
        teamNames.length === 2
      ) {
        const scorePanel = document.querySelector("#sc-content .sc-panel");
        const nav = document.createElement("nav");
        nav.className = "sc-team-switch";
        nav.setAttribute("aria-label", "Choose team scorecard");
        nav.setAttribute("role", "tablist");
        const list = document.createElement("div");
        list.className = "sc-team-innings-list";
        const groups = teamNames.map(() => []);
        innings.forEach((section) => {
          const heading = section.querySelector("h3");
          const team = heading
            ? heading.textContent
                .trim()
                .replace(/\s+\d+\s*\/.*/, "")
                .trim()
            : "";
          let index = teamNames.findIndex((name) => team === name || team.startsWith(name + " "));
          if (index < 0) index = 0;
          groups[index].push(section);
        });
        teamNames.forEach((team, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "sc-team-tab" + (index === 0 ? " is-active" : "");
          button.setAttribute("role", "tab");
          button.setAttribute("aria-selected", index === 0 ? "true" : "false");
          button.textContent = team;
          button.addEventListener("click", () => {
            nav.querySelectorAll(".sc-team-tab").forEach((tab, i) => {
              tab.classList.toggle("is-active", i === index);
              tab.setAttribute("aria-selected", i === index ? "true" : "false");
            });
            groups.forEach((sections, i) =>
              sections.forEach((section) => {
                section.hidden = i !== index;
              }),
            );
          });
          nav.appendChild(button);
        });
        if (scorePanel) {
          innings.forEach((section) => list.appendChild(section));
          scorePanel.classList.add("sc-score-panel");
          scorePanel.insertBefore(nav, scorePanel.querySelector("h2")?.nextSibling || null);
          scorePanel.insertBefore(list, nav.nextSibling);
          const firstButton = nav.querySelector(".sc-team-tab");
          if (firstButton) firstButton.click();
        }
      }
    } catch (e) {
      $("sc-loading").hidden = true;
      $("sc-error").hidden = false;
      $("sc-error").textContent = e.message || "Could not load scorecard.";
    }
  }
  init();
})();
