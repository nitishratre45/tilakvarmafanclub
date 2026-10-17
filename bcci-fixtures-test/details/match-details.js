(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const set = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value || "—";
  };
  const dateLabel = (v) => {
    if (!v) return "Date not confirmed";
    const d = new Date(v + "T12:00:00Z");
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  const timeLabel = (v) => {
    if (!v) return "Time TBA";
    const [h, m] = String(v).split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return v;
    return (
      new Date(Date.UTC(2020, 0, 1, h, m)).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      }) + " IST"
    );
  };
  const key = (f) =>
    [f.date, f.match, f.opponent || f.team]
      .map((v) =>
        String(v || "")
          .trim()
          .toLowerCase(),
      )
      .join("|");
  const teamLogoUrl = (name, supplied) => {
    const value = String(supplied || "").trim();
    // Prefer a real logo URL already present in the selected fixture/JSON.
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return "https://img1.hscicdn.com" + value;
    const n = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\s+/g, " ");
    const logos = {
      india: "https://flagcdn.com/w160/in.png",
      "west indies":
        "https://commons.wikimedia.org/wiki/Special:FilePath/Cricket_West_Indies_Logo_2017.svg",
      "new zealand": "https://flagcdn.com/w160/nz.png",
      australia: "https://flagcdn.com/w160/au.png",
      england: "https://flagcdn.com/w160/gb-eng.png",
      pakistan: "https://flagcdn.com/w160/pk.png",
      "south africa": "https://flagcdn.com/w160/za.png",
      bangladesh: "https://flagcdn.com/w160/bd.png",
      "sri lanka": "https://flagcdn.com/w160/lk.png",
      afghanistan: "https://flagcdn.com/w160/af.png",
      zimbabwe: "https://flagcdn.com/w160/zw.png",
      ireland: "https://flagcdn.com/w160/ie.png",
      nepal: "https://flagcdn.com/w160/np.png",
      namibia: "https://flagcdn.com/w160/na.png",
      netherlands: "https://flagcdn.com/w160/nl.png",
      scotland: "https://flagcdn.com/w160/gb-sct.png",
      "united arab emirates": "https://flagcdn.com/w160/ae.png",
      oman: "https://flagcdn.com/w160/om.png",
      canada: "https://flagcdn.com/w160/ca.png",
      usa: "https://flagcdn.com/w160/us.png",
      "united states": "https://flagcdn.com/w160/us.png",
      "hong kong": "https://flagcdn.com/w160/hk.png",
      "papua new guinea": "https://flagcdn.com/w160/pg.png",
      uganda: "https://flagcdn.com/w160/ug.png",
      kenya: "https://flagcdn.com/w160/ke.png",
      "mumbai indians": "https://scores.iplt20.com/ipl/teamlogos/MI.png",
      "chennai super kings": "https://scores.iplt20.com/ipl/teamlogos/CSK.png",
      "kolkata knight riders": "https://scores.iplt20.com/ipl/teamlogos/KKR.png",
      "royal challengers bengaluru": "https://scores.iplt20.com/ipl/teamlogos/RCB.png",
      "royal challengers bangalore": "https://scores.iplt20.com/ipl/teamlogos/RCB.png",
      "rajasthan royals": "https://scores.iplt20.com/ipl/teamlogos/RR.png",
      "sunrisers hyderabad": "https://scores.iplt20.com/ipl/teamlogos/SRH.png",
      "delhi capitals": "https://scores.iplt20.com/ipl/teamlogos/DC.png",
      "punjab kings": "https://scores.iplt20.com/ipl/teamlogos/PBKS.png",
      "gujarat titans": "https://scores.iplt20.com/ipl/teamlogos/GT.png",
      "lucknow super giants": "https://scores.iplt20.com/ipl/teamlogos/LSG.png",
    };
    return logos[n] || "";
  };
  function setTeamBadge(id, name, suppliedLogo) {
    const host = $(id);
    if (!host) return;
    const initials = String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    const src = teamLogoUrl(name, suppliedLogo);
    if (!src) {
      host.textContent = initials;
      return;
    }
    host.innerHTML = '<img src="' + esc(src) + '" alt="" aria-hidden="true" loading="eager">';
    const img = host.querySelector("img");
    img.addEventListener(
      "error",
      () => {
        host.textContent = initials;
        host.classList.add("details-team-mark-fallback");
      },
      { once: true },
    );
    host.setAttribute("aria-label", String(name || "Team"));
  }
  // Section switcher: show only the section the user selects; keep the scoreboard as its own panel.
  function initDetailsSectionTabs() {
    const nav = document.querySelector(".details-tabs");
    const sections = Array.from(
      document.querySelectorAll(".match-details-main > .details-section"),
    );
    if (!nav || !sections.length) return;
    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const activate = (id, updateHash) => {
      const target = sections.find((section) => section.id === id);
      if (!target) return;
      sections.forEach((section) => {
        const active = section === target;
        section.hidden = !active;
        section.setAttribute("aria-hidden", String(!active));
      });
      links.forEach((link) => {
        const active = link.hash === "#" + id;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      if (updateHash && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    };
    links.forEach((link) =>
      link.addEventListener("click", (event) => {
        const id = link.hash.slice(1);
        if (!sections.some((section) => section.id === id)) return;
        event.preventDefault();
        activate(id, true);
        window.scrollTo({
          top: Math.max(0, nav.getBoundingClientRect().top + window.scrollY - 88),
          behavior: "smooth",
        });
      }),
    );
    const initial = location.hash.slice(1);
    activate(sections.some((section) => section.id === initial) ? initial : "overview", false);
  }
  function showPlayers(id, players) {
    const host = $(id);
    if (!host) return;
    if (!Array.isArray(players) || !players.length) {
      host.innerHTML =
        '<p class="details-muted">Official squad not in saved data yet. Check the official source below.</p>';
      return;
    }
    host.innerHTML = players
      .map((p) => {
        const n = typeof p === "string" ? p : p.name || p.fullName || "Player";
        const role =
          typeof p === "string"
            ? ""
            : [p.role, p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · ");
        const initials = n
          .split(/\s+/)
          .map((x) => x[0])
          .slice(0, 2)
          .join("");
        const image = typeof p === "object" ? p.image || p.player_image || "" : "";
        const safeImage = /^https:\/\//i.test(String(image)) ? String(image) : "";
        return (
          '<div class="details-player-row"><span class="details-player-avatar">' +
          (safeImage
            ? '<img src="' +
              esc(safeImage) +
              '" alt="" loading="lazy" decoding="async"><span style="display:none">' +
              esc(initials) +
              "</span>"
            : esc(initials)) +
          '</span><span class="details-player-copy"><strong>' +
          esc(n) +
          "</strong><small>" +
          esc(role || "Squad member") +
          "</small></span></div>"
        );
      })
      .join("");
    host.querySelectorAll(".details-player-avatar img").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          img.remove();
          const fallback = img.parentElement?.querySelector("span");
          if (fallback) fallback.style.display = "inline";
        },
        { once: true },
      );
    });
  }
  function sourceLink(label, url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.origin);
      if (!["http:", "https:"].includes(u.protocol)) return "";
      return (
        '<a href="' +
        esc(u.href) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(label) +
        " ↗</a>"
      );
    } catch {
      return "";
    }
  }
  async function weather(venue, date) {
    const city = String(venue || "")
      .split(",")[0]
      .trim();
    if (!city || /tba|unknown/i.test(city)) {
      set("weather-summary", "A confirmed city is needed for a forecast.");
      return;
    }
    try {
      const g = await fetch(
        "https://geocoding-api.open-meteo.com/v1/search?name=" +
          encodeURIComponent(city) +
          "&count=1&language=en&format=json",
      );
      const place = (await g.json()).results?.[0];
      if (!place) throw Error("City unavailable");
      const w = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=" +
          place.latitude +
          "&longitude=" +
          place.longitude +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=16",
      );
      const d = (await w.json()).daily;
      const i = (d.time || []).indexOf(date);
      if (i < 0) {
        set("weather-label", "Forecast not available yet");
        set("weather-temperature", "—");
        set(
          "weather-summary",
          "This match date is outside the current forecast range. Check closer to matchday.",
        );
        set("workflow-weather", "Open-Meteo checked; date is outside forecast range.");
        return;
      }
      set("weather-label", place.name + ", " + (place.country || ""));
      set(
        "weather-temperature",
        Math.round(d.temperature_2m_max[i]) + "° / " + Math.round(d.temperature_2m_min[i]) + "°C",
      );
      set(
        "weather-rain",
        d.precipitation_probability_max?.[i] != null
          ? d.precipitation_probability_max[i] + "%"
          : "—",
      );
      set(
        "weather-wind",
        d.wind_speed_10m_max?.[i] != null ? Math.round(d.wind_speed_10m_max[i]) + " km/h" : "—",
      );
      set("weather-summary", "Daily forecast for " + date + ". Weather can change.");
      set("weather-symbol", (d.precipitation_probability_max?.[i] || 0) > 50 ? "🌧" : "☀");
      set(
        "workflow-weather",
        "Forecast loaded from Open-Meteo for " +
          place.name +
          ". Pitch report needs a verified source.",
      );
    } catch (e) {
      set("weather-label", "Weather unavailable");
      set("weather-temperature", "—");
      set("weather-summary", "Could not load a reliable forecast now; retry closer to matchday.");
      set("workflow-weather", "Weather provider did not return a usable forecast.");
    }
  }
  const escHtml = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const scorecardTeamKey = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  function renderScorecard(data) {
    const host = $("details-scoreboard");
    if (!host || !data) return false;
    const innings = Array.isArray(data.innings) ? data.innings : [];
    if (!innings.length) return false;
    const extrasText = (extras) => {
      if (!extras || typeof extras !== "object") return "Extras not listed";
      const bits = Object.entries(extras)
        .filter(([, value]) => Number(value) > 0)
        .map(([name, value]) => name + " " + value);
      return (
        "Extras: " +
        (Number(data.innings?.[0]?.extras || 0) >= 0 ? bits.join(", ") || "0" : bits.join(", "))
      );
    };
    host.innerHTML =
      (data.result
        ? '<div class="scoreboard-result"><h3>' +
          escHtml(data.result) +
          "</h3><p>" +
          escHtml([data.event, data.venue, data.date].filter(Boolean).join(" · ")) +
          "</p></div>"
        : "") +
      innings
        .map((inn) => {
          const batting = Array.isArray(inn.batting) ? inn.batting : [];
          const bowling = Array.isArray(inn.bowling) ? inn.bowling : [];
          const fow = Array.isArray(inn.fallOfWickets) ? inn.fallOfWickets : [];
          const batterRows = batting
            .map(
              (p) =>
                "<tr><td><strong>" +
                escHtml(p.batter) +
                '</strong><span class="scoreboard-dismissal">' +
                escHtml(p.dismissal || (p.notOut ? "not out" : "")) +
                "</span></td><td>" +
                escHtml(p.runs) +
                (p.notOut ? "*" : "") +
                "</td><td>" +
                escHtml(p.balls) +
                "</td><td>" +
                escHtml(p.fours) +
                "</td><td>" +
                escHtml(p.sixes) +
                "</td><td>" +
                escHtml(p.strikeRate) +
                "</td></tr>",
            )
            .join("");
          const bowlRows = bowling
            .map(
              (p) =>
                "<tr><td><strong>" +
                escHtml(p.bowler) +
                "</strong></td><td>" +
                escHtml(p.overs) +
                "</td><td>" +
                escHtml(p.maidens) +
                "</td><td>" +
                escHtml(p.runs) +
                "</td><td>" +
                escHtml(p.wickets) +
                "</td><td>" +
                escHtml(p.economy) +
                "</td></tr>",
            )
            .join("");
          const extras = Object.entries(inn.extrasBreakdown || {})
            .filter(([, v]) => Number(v) > 0)
            .map(([k, v]) => k + " " + v)
            .join(" · ");
          return (
            '<article class="scoreboard-innings"><div class="scoreboard-innings-head"><h3>' +
            escHtml(inn.team || "Innings " + inn.number) +
            "</h3><strong>" +
            escHtml(inn.runs) +
            "/" +
            escHtml(inn.wickets) +
            " <small>(" +
            escHtml(inn.overs) +
            " ov)</small></strong></div>" +
            '<div class="scoreboard-table-wrap"><table class="scoreboard-table"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>' +
            (batterRows ||
              '<tr><td colspan="6">Batting data unavailable in this scorecard.</td></tr>') +
            '</tbody></table></div><p class="scoreboard-extras">Extras: ' +
            escHtml(inn.extras ?? 0) +
            (extras ? " (" + escHtml(extras) + ")" : "") +
            '</p><h4 class="scoreboard-subheading">Bowling</h4>' +
            '<div class="scoreboard-table-wrap"><table class="scoreboard-table"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>' +
            (bowlRows ||
              '<tr><td colspan="6">Bowling data unavailable in this scorecard.</td></tr>') +
            "</tbody></table></div>" +
            (fow.length
              ? "<details><summary>Fall of wickets (" +
                fow.length +
                ')</summary><div class="scoreboard-fow">' +
                fow
                  .map(
                    (w) =>
                      escHtml(w.score) +
                      "/" +
                      escHtml(w.wicket) +
                      " · " +
                      escHtml(w.over) +
                      " ov · " +
                      escHtml(w.batter),
                  )
                  .join("<br>") +
                "</div></details>"
              : "") +
            "</article>"
          );
        })
        .join("");
    return true;
  }
  function renderBcciResultBoard(matches, team, opponent, date) {
    const host = $("details-scoreboard");
    if (!host || !Array.isArray(matches)) return false;
    const norm = (s) => scorecardTeamKey(s).replace(/westindies/g, "westindies");
    const names = [team, opponent].map(norm);
    const row = matches.find((item) => {
      const rowNames = [
        item.team1_name,
        item.team2_name,
        item.team1,
        item.team2,
        item.home_team,
        item.away_team,
      ].map(norm);
      const sameTeams = names.every((name) =>
        rowNames.some(
          (candidate) => candidate && (candidate.includes(name) || name.includes(candidate)),
        ),
      );
      const rowDate = String(item.date || item.match_date || item.start_date || "").slice(0, 10);
      return sameTeams && (!date || !rowDate || rowDate === String(date).slice(0, 10));
    });
    if (!row) return false;
    const innings = Array.isArray(row.summary?.team) ? row.summary.team : [];
    const scoreText = innings
      .map((entry) => (entry.team || entry.name || "") + " " + (entry.score || ""))
      .filter((v) => v.trim())
      .join(" · ");
    host.innerHTML =
      '<div class="scoreboard-result"><h3>' +
      escHtml(row.result_string || row.result || "Match result") +
      "</h3><p>" +
      escHtml(scoreText || "BCCI result snapshot has no innings score details.") +
      '</p><p class="scoreboard-status">BCCI results summary · Detailed innings scorecard is not present in this feed.</p></div>';
    return true;
  }
  async function init() {
    try {
      // Read saved JSON snapshots only; do not call BCCI's API from the browser.
      // Keep the multi-megabyte historical BCCI results archive off the normal page load.
      // It is fetched only as a fallback for a fixture with a verified provider match ID.
      const [
        newsResponse,
        statsResponse,
        scorecardIndexResponse,
        bcciFixturesResponse,
      ] = await Promise.all([
        fetch("/bcci-fixtures-test/bcci-fixtures.json?v=isolated-details1", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/bcci-fixtures-test/bcci-fixtures.json?v=isolated-details1", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/bcci-fixtures-test/scorecards/index.json?v=isolated-details1", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/bcci-fixtures-test/bcci-fixtures.json?v=20261017-bcci-fixtures1", {
          cache: "no-store",
        }).catch(() => null),
      ]);
      const snapshot =
        newsResponse && newsResponse.ok ? await newsResponse.json().catch(() => null) : null;
      const statsSnapshot =
        statsResponse && statsResponse.ok ? await statsResponse.json().catch(() => null) : null;
      const scorecardIndex =
        scorecardIndexResponse && scorecardIndexResponse.ok
          ? await scorecardIndexResponse.json().catch(() => null)
          : null;
      const bcciFixturesSnapshot =
        bcciFixturesResponse && bcciFixturesResponse.ok
          ? await bcciFixturesResponse.json().catch(() => null)
          : null;
      const bcciFixtureRows = Array.isArray(bcciFixturesSnapshot?.data?.match)
        ? bcciFixturesSnapshot.data.match
        : Array.isArray(bcciFixturesSnapshot?.data?.matches)
          ? bcciFixturesSnapshot.data.matches
          : [];
      const bcciFixtures = bcciFixtureRows.map((row) => {
        const side1 = String(row.team1_name || row.team1_short_name || "").trim();
        const side2 = String(row.team2_name || row.team2_short_name || "").trim();
        const indiaIsSide1 = side1.toLowerCase() === "india";
        const indiaIsSide2 = side2.toLowerCase() === "india";
        return {
          matchId: String(row.match_id || "").trim(),
          match_id: String(row.match_id || "").trim(),
          gid: String(row.gid || "").trim(),
          fixtureId: String(row.gid || "").trim(),
          date: String(row.start_date || row.date_string || "").trim(),
          match: String(row.match_short_name || row.title || row.comp_name || "Match").trim(),
          team: indiaIsSide1 || indiaIsSide2 ? "India" : side1,
          opponent: indiaIsSide1 ? side2 : indiaIsSide2 ? side1 : side2,
          venue: String(row.ground_name || row.ground_short_name || row.ground_city || "").trim(),
          time: String(row.start_time_local || "").trim(),
          tilakInSquad: false,
          rawBcci: row,
        };
      });
      let manual = { matches: [] };
      try {
        const mr = await fetch(
          "/bcci-fixtures-test/details/data/match-details.json?v=20261014-details1",
          {
            cache: "no-store",
          },
        );
        if (mr.ok) manual = await mr.json();
      } catch (_) {}
      const newsFixtures = Array.isArray(snapshot?.fixtures)
        ? snapshot.fixtures.map((x) => ({ ...x, team: x.team || "India", tilakInSquad: true }))
        : [];
      const statsFixtures = Array.isArray(statsSnapshot?.fixtures)
        ? statsSnapshot.fixtures.map((x) => ({ ...x, tilakInSquad: false }))
        : [];
      const fixtureKey = (x) => {
        const sides = [x.team, x.opponent]
          .map((v) =>
            String(v || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
          .sort();
        return [String(x.date || "").trim(), ...sides].join("|");
      };
      const byKey = new Map();
      [...statsFixtures, ...newsFixtures, ...bcciFixtures].forEach((x) => {
        const k = fixtureKey(x);
        const current = byKey.get(k);
        if (!current) {
          byKey.set(k, x);
          return;
        }
        const preferred = x.tilakInSquad === true ? x : current;
        const fallback = preferred === x ? current : x;
        byKey.set(k, {
          ...fallback,
          ...preferred,
          time: String(preferred.time || "").trim() || String(fallback.time || "").trim(),
          match:
            preferred.tilakInSquad === true && preferred.match !== "Match"
              ? preferred.match
              : fallback.match || preferred.match,
          venue: String(preferred.venue || "").trim() || String(fallback.venue || "").trim(),
          team: [preferred.team, preferred.opponent].some(
            (v) => String(v || "").toLowerCase() === "india",
          )
            ? "India"
            : preferred.team || fallback.team,
          opponent: [preferred.team, preferred.opponent].some(
            (v) => String(v || "").toLowerCase() === "india",
          )
            ? [preferred.team, preferred.opponent].find(
                (v) => String(v || "").toLowerCase() !== "india",
              ) || fallback.opponent
            : preferred.opponent || fallback.opponent,
          tilakInSquad: Boolean(preferred.tilakInSquad || fallback.tilakInSquad),
        });
      });
      const fixtures = [...byKey.values()];
      const date = q.get("date"),
        match = q.get("match"),
        opponent = q.get("opponent"),
        matchId = q.get("matchId");
      const fixtureIds = (x) =>
        [x.matchId, x.match_id, x.gid, x.fixtureId, x.id, x.rawBcci?.match_id, x.rawBcci?.gid]
          .map((v) => String(v || "").trim())
          .filter(Boolean);
      // Prefer the official ID, but allow the exact date + match label + opponent
      // route key if an older cached link carries a stale/missing provider ID.
      // This is not a score fallback: it only resolves the requested fixture.
      const initialFixture =
        (matchId ? fixtures.find((x) => fixtureIds(x).includes(matchId)) : null) ||
        fixtures.find(
          (x) =>
            (!date || x.date === date) &&
            (!match ||
              String(x.match || "")
                .trim()
                .toLowerCase() === match.trim().toLowerCase()) &&
            (!opponent ||
              String(x.opponent || "")
                .trim()
                .toLowerCase() === opponent.trim().toLowerCase()),
        );
      let resolvedFixture = initialFixture;
      // Resolve recent match links against the verified saved scorecard archive first.
      // Match only exact date, both teams and compatible format; never substitute another match.
      if (!resolvedFixture && !matchId && date && opponent) {
        const archiveRows = Array.isArray(scorecardIndex?.matches) ? scorecardIndex.matches : [];
        const normaliseName = (value) =>
          String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        const requestedFormat = String(match || "")
          .trim()
          .toLowerCase();
        const requestedOpponent = normaliseName(opponent);
        const requestedTeam = normaliseName(q.get("team") || "India");
        const archiveMatch = archiveRows.find((row) => {
          const rowDate = String(row.date || "").slice(0, 10);
          const rowTeams = [row.team, row.opposition].map(normaliseName);
          const rowFormat = String(row.format || "")
            .trim()
            .toLowerCase();
          const sameFormat =
            !requestedFormat ||
            requestedFormat === "match" ||
            rowFormat === requestedFormat ||
            (["t20i", "t20"].includes(rowFormat) && ["t20i", "t20"].includes(requestedFormat));
          return (
            rowDate === String(date).slice(0, 10) &&
            rowTeams.includes(requestedOpponent) &&
            rowTeams.includes(requestedTeam) &&
            sameFormat
          );
        });
        if (archiveMatch) {
          resolvedFixture = {
            date: archiveMatch.date,
            match: archiveMatch.format || match || "Match",
            team: archiveMatch.team,
            opponent: archiveMatch.opposition,
            venue: archiveMatch.venue || "",
            time: "",
            matchId: archiveMatch.matchId || "",
            rawBcci: {},
            result: archiveMatch.result || "",
            series: archiveMatch.event || "",
            format: archiveMatch.format || "",
            tilakInSquad: false,
          };
        }
      }
      // Recent/played matches may no longer be present in upcoming fixtures.
      // Resolve BCCI records by exact ID, or by exact date + both teams for recent rows.
      if (!resolvedFixture && (matchId || (date && opponent))) {
        try {
          const response = await fetch(
            "/bcci-fixtures-test/bcci-match-results.json?v=isolated-details1",
            { cache: "no-store" },
          );
          if (response.ok) {
            const saved = await response.json().catch(() => null);
            const rows = Array.isArray(saved?.matches) ? saved.matches : [];
            const normalizeTeam = (value) =>
              String(value || "")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
            const exact = rows.find((row) => {
              const ids = [row.gid, row.match_id, row.matchId].map((value) =>
                String(value || "").trim(),
              );
              if (matchId) return ids.includes(String(matchId).trim());
              const rowDate = String(
                row.start_date || row.end_date || row.match_date || row.date || "",
              ).slice(0, 10);
              const teams = [
                row.team1_name || row.home_team_name || row.team1_short_name || "",
                row.team2_name || row.away_team_name || row.team2_short_name || "",
              ].map(normalizeTeam);
              const wantedOpponent = normalizeTeam(opponent);
              const wantedTeam = normalizeTeam(q.get("team") || "India");
              return (
                rowDate === String(date).slice(0, 10) &&
                teams.includes(wantedOpponent) &&
                teams.includes(wantedTeam)
              );
            });
            if (exact) {
              const home =
                exact.team1_name ||
                exact.home_team_name ||
                exact.team1_short_name ||
                exact.home_team_short_name ||
                exact.team1 ||
                exact.home_team ||
                exact.team1_display_name ||
                "";
              const away =
                exact.team2_name ||
                exact.away_team_name ||
                exact.team2_short_name ||
                exact.away_team_short_name ||
                exact.team2 ||
                exact.away_team ||
                exact.team2_display_name ||
                "";
              const rawDate =
                exact.start_date ||
                exact.end_date ||
                exact.match_date ||
                exact.date ||
                exact.start_datetime_utc ||
                "";
              const parsedDate = String(rawDate).slice(0, 10);
              const matchLabel =
                exact.match_short_name ||
                exact.name ||
                exact.match_name ||
                exact.match_type ||
                "Match";
              resolvedFixture = {
                date: parsedDate,
                match: matchLabel,
                team: home,
                opponent: away,
                venue: exact.ground_name || exact.ground_city || exact.venue || exact.ground || "",
                time: exact.start_time || exact.start_time_ist || "",
                matchId: String(exact.match_id || exact.gid || exact.matchId || matchId),
                rawBcci: exact,
                result: exact.result_string || exact.result || "",
                series: exact.comp_name || exact.series_name || exact.event_name || "",
                format: exact.match_type || exact.format || "",
                tilakInSquad: false,
              };
            }
          }
        } catch (_) {}
      }
      // BCCI test-folder fallback: resolve the exact live/upcoming fixture by provider ID first.
      if (!resolvedFixture && (matchId || (date && opponent))) {
        try {
          const response = await fetch("/bcci-fixtures-test/bcci-fixtures.json?t=" + Date.now(), {
            cache: "no-store",
          });
          if (response.ok) {
            const payload = await response.json();
            const root = payload?.data ?? payload;
            const rows = Array.isArray(root?.match)
              ? root.match
              : Array.isArray(root?.matches)
                ? root.matches
                : Array.isArray(root?.fixtures)
                  ? root.fixtures
                  : [];
            const normal = (value) =>
              String(value || "")
                .toLowerCase()
                .replace(/&/g, "and")
                .replace(/[^a-z0-9]/g, "");
            const normalDate = (value) => {
              const raw = String(value || "").trim();
              if (!raw) return "";
              const iso = raw.match(/^(\\d{4}-\\d{2}-\\d{2})/);
              if (iso) return iso[1];
              const parsed = new Date(raw);
              return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
            };
            const requestedTeam = normal(q.get("team") || "India");
            const requestedOpponent = normal(opponent);
            const requestedDate = normalDate(date);
            const exact = rows.find((row) => {
              const ids = [
                row.gid,
                row.match_gid,
                row.match_id,
                row.matchId,
                row.fixtureId,
                row.id,
              ].map((v) => String(v || "").trim());
              if (matchId && ids.includes(String(matchId).trim())) return true;
              const rowDate = normalDate(
                row.start_date ||
                  row.date ||
                  row.end_date ||
                  row.start_datetime_utc ||
                  row.date_string,
              );
              const teams = [
                row.team1_name ||
                  row.team1_short_name ||
                  row.home_team_name ||
                  row.home_team_short_name ||
                  row.team1,
                row.team2_name ||
                  row.team2_short_name ||
                  row.away_team_name ||
                  row.away_team_short_name ||
                  row.team2,
              ].map(normal);
              const hasBothTeams =
                teams.includes(requestedTeam) && teams.includes(requestedOpponent);
              // BCCI date_string can be human-readable (e.g. "18 October 2026").
              // Match the selected fixture by date and both teams, not by ID alone.
              return Boolean(
                opponent &&
                  hasBothTeams &&
                  (!requestedDate || !rowDate || rowDate === requestedDate),
              );
            });
            if (exact) {
              const home =
                exact.team1_name ||
                exact.team1_short_name ||
                exact.home_team_name ||
                exact.team1 ||
                "Team 1";
              const away =
                exact.team2_name ||
                exact.team2_short_name ||
                exact.away_team_name ||
                exact.team2 ||
                "Team 2";
              const rawDate =
                exact.start_date ||
                exact.date ||
                exact.match_date ||
                exact.start_datetime_utc ||
                "";
              resolvedFixture = {
                date: String(rawDate).slice(0, 10),
                match:
                  exact.match_short_name ||
                  exact.name ||
                  exact.comp_name ||
                  exact.match_type ||
                  "Match",
                team: home,
                opponent: away,
                venue: [exact.ground_name, exact.ground_city, exact.venue]
                  .filter(Boolean)
                  .join(", "),
                time: exact.start_time || exact.start_time_ist || "",
                matchId: String(
                  exact.gid || exact.match_gid || exact.match_id || exact.id || matchId || "",
                ),
                rawBcci: exact,
                result: exact.result_string || exact.result || "",
                series: exact.comp_name || exact.series_name || exact.event_name || "",
                format: exact.match_type || exact.format || "",
                tilakInSquad: false,
                status:
                  exact.match_status ||
                  exact.match_status_str ||
                  exact.live_status_name ||
                  exact.status ||
                  "",
              };
            }
          }
        } catch (_) {}
      }
      if (!resolvedFixture) {
        set("details-title", "Match details unavailable");
        set(
          "details-series",
          "No exact match ID was found in the saved fixture or BCCI results JSON. No other match will be substituted.",
        );
        set("workflow-fixture", "Exact match not found in the saved JSON snapshots.");
        return;
      }
      const f = resolvedFixture;
      const liveRequested =
        q.get("live") === "1" ||
        /\\b(live|in play|in progress|innings break)\\b/i.test(
          String(f.status || f.rawBcci?.match_status || f.rawBcci?.live_status_name || ""),
        );
      const statusBadge = document.querySelector(".details-status");
      if (statusBadge) {
        statusBadge.innerHTML = liveRequested ? "<i></i> LIVE MATCH" : "<i></i> MATCH CENTRE";
        statusBadge.classList.toggle("is-live", liveRequested);
      }
      const detail = (manual.matches || []).find((x) => key(x) === key(f)) || {};
      const scorecardRows = Array.isArray(scorecardIndex?.matches) ? scorecardIndex.matches : [];
      const fixtureMatchId = String(
        f.matchId ||
          f.match_id ||
          f.gid ||
          f.fixtureId ||
          f.id ||
          f.rawBcci?.match_id ||
          f.rawBcci?.gid ||
          "",
      ).trim();
      const fixtureTeamIds = [
        f.rawBcci?.team1_id || f.rawBcci?.home_team_id,
        f.rawBcci?.team2_id || f.rawBcci?.away_team_id,
      ]
        .map((v) => String(v || "").trim())
        .filter(Boolean);
      // Load squads from the match-ID-specific snapshot written by fetch_bcci_squads.py.
      // The browser never calls the protected upstream squads API directly.
      let squadsSnapshot = null;
      if (fixtureMatchId && /^\\d+$/.test(fixtureMatchId)) {
        try {
          const squadResponse = await fetch(
            "/bcci-fixtures-test/squads/" + encodeURIComponent(fixtureMatchId) + ".json?v=" + Date.now(),
            { cache: "no-store" },
          );
          if (squadResponse.ok) squadsSnapshot = await squadResponse.json().catch(() => null);
        } catch (_) {}
      }
      const extractPlayerRows = (value, depth = 0) => {
        if (depth > 6 || value == null) return [];
        if (Array.isArray(value)) {
          if (value.length && value.every((item) => item && typeof item === "object" &&
            (item.player_name || item.player_known_as || item.name || item.full_name || item.player_id))) {
            return value;
          }
          for (const item of value) {
            const found = extractPlayerRows(item, depth + 1);
            if (found.length) return found;
          }
          return [];
        }
        if (typeof value !== "object") return [];
        for (const key of ["players", "player", "squad", "squads", "team_squad", "teamSquad", "data", "results", "items", "response"]) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            const found = extractPlayerRows(value[key], depth + 1);
            if (found.length) return found;
          }
        }
        return [];
      };
      const responseTeams = squadsSnapshot?.teams || {};
      const savedSquads = [
        {
          teamId: String(responseTeams.team1?.team_id || squadsSnapshot?.match?.team1_id || ""),
          teamName: String(squadsSnapshot?.match?.team1_name || ""),
          players: extractPlayerRows(responseTeams.team1?.response),
        },
        {
          teamId: String(responseTeams.team2?.team_id || squadsSnapshot?.match?.team2_id || ""),
          teamName: String(squadsSnapshot?.match?.team2_name || ""),
          players: extractPlayerRows(responseTeams.team2?.response),
        },
      ];
      const squadCheckedAt = squadsSnapshot?.fetched_at_utc || "";
      // Live scoreboard waits for the official ID; never substitute by date/team.
      const exactScorecardById = fixtureMatchId
        ? scorecardRows.find((row) => {
            const rowIds = [row.matchId, row.match_id, row.gid].map((v) => String(v || "").trim());
            return rowIds.includes(fixtureMatchId);
          })
        : null;
      const normaliseTeam = (value) =>
        scorecardTeamKey(value).replace(/unitedstatesofamerica/g, "usa");
      const formatKey = (value) => {
        const label = String(value || "").toLowerCase();
        if (/t20i|twenty20 international/.test(label)) return "t20i";
        if (/\bodi\b|one day international/.test(label)) return "odi";
        if (/test|first.class/.test(label)) return "test";
        return "";
      };
      // Cricsheet uses its own archive IDs, not BCCI match IDs. Connect only an
      // exact same-date, same-teams, same-format scorecard from the archive.
      const exactScorecardByFixture =
        exactScorecardById ||
        scorecardRows.find((row) => {
          const sameDate =
            String(row.date || "").slice(0, 10) === String(f.date || "").slice(0, 10);
          const fixtureTeams = [f.team, f.opponent].map(normaliseTeam).filter(Boolean).sort();
          const scorecardTeams = [row.team, row.opposition]
            .map(normaliseTeam)
            .filter(Boolean)
            .sort();
          const fixtureFormat = formatKey(f.match || f.format);
          const scorecardFormat = formatKey(row.format);
          return (
            sameDate &&
            fixtureTeams.length === 2 &&
            fixtureTeams[0] === scorecardTeams[0] &&
            fixtureTeams[1] === scorecardTeams[1] &&
            (!fixtureFormat || !scorecardFormat || fixtureFormat === scorecardFormat)
          );
        });
      let scorecardLoaded = false;
      if (exactScorecardByFixture?.scorecard) {
        try {
          const scorecardResponse = await fetch(exactScorecardByFixture.scorecard, {
            cache: "no-store",
          });
          if (scorecardResponse.ok) {
            const scorecardData = await scorecardResponse.json().catch(() => null);
            scorecardLoaded = renderScorecard(scorecardData);
          }
        } catch (_) {}
      }
      // Keep the saved results snapshot in init scope because the Recent Results,
      // form and Tilak summary panels also use it later in this render pass.
      let resultsSnapshot = null;
      // Match the BCCI results snapshot only by the fixture's official IDs and team IDs.
      // A result row for another match is never accepted by team names/date alone.
      if (!scorecardLoaded && fixtureMatchId) {
        try {
          const resultsResponse = await fetch(
            "/bcci-fixtures-test/bcci-match-results.json?v=isolated-details1",
            {
              cache: "no-store",
            },
          );
          if (resultsResponse.ok) resultsSnapshot = await resultsResponse.json().catch(() => null);
        } catch (_) {}
        const resultRows = Array.isArray(resultsSnapshot?.matches) ? resultsSnapshot.matches : [];
        const exactResult = resultRows.find((row) => {
          const rowIds = [row.gid, row.match_id, row.matchId].map((v) => String(v || "").trim());
          const rowTeamIds = [row.team1_id || row.home_team_id, row.team2_id || row.away_team_id]
            .map((v) => String(v || "").trim())
            .filter(Boolean);
          const sameId = rowIds.includes(fixtureMatchId);
          const sameTeams =
            !fixtureTeamIds.length || fixtureTeamIds.every((id) => rowTeamIds.includes(id));
          return sameId && sameTeams;
        });
        if (exactResult) {
          scorecardLoaded = renderBcciResultBoard([exactResult], f.team, f.opponent, f.date);
          if (scorecardLoaded) {
            const host = $("details-scoreboard");
            const note = document.createElement("p");
            note.className = "scoreboard-status";
            note.textContent =
              "BCCI match-ID verified result summary; live ball-by-ball data is not included in this feed.";
            host.prepend(note);
          }
        }
      }
      // Never use another match as a fallback. Keep the prior page/details intact.
      if (!scorecardLoaded) {
        const scoreHost = $("details-scoreboard");
        const matchStarted =
          f.date &&
          Date.parse(String(f.date) + "T" + String(f.time || "00:00") + ":00+05:30") <= Date.now();
        if (scoreHost) {
          const bcciLiveScoresUrl =
            "https://stats.bcci.tv/match/live_scores/?comp_gid=65d2b784-4a75-41ca-8415-a345042030d6&comp_gid=34154bc1-ebbf-4109-ba78-67cf9cf7aafa&comp_gid=6a64053e-55fc-47ed-9cae-4c58e9b0e551&comp_gid=9a12946b-9277-4b5f-ba94-34d02355bf03&comp_gid=2c9a58d0-365c-4301-839e-b1d2a0803b2b&comp_gid=04d7f468-3b06-4dcc-88de-594afd83c561&comp_gid=52f44249-0afd-41aa-bb88-c6e7778a4f0d&comp_gid=97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2&comp_gid=5cd3ede8-16d7-4914-9d4c-2eb59671fe50&comp_gid=39a2078a-2e87-4f90-86eb-53696579466c&comp_gid=7ca2538b-b8e8-4221-b76f-4705cb75af1f&comp_gid=ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc&comp_gid=13de0d47-83d7-4351-8e6a-57d28a18be48&comp_gid=1cf7ed18-0c14-452c-840b-447aeb5dd020&comp_gid=96f00b0b-c06b-4764-bbc3-7ed388abb24b&comp_gid=dd82f86a-6aa4-477c-b0de-2706a677d0d2&team_gid=71790c66-0e3c-4d0b-96a5-e04526040f94&team_gid=cf9ec6b2-8d90-41a9-a834-f2f120b37811&team_gid=83151b98-bbed-42ba-b397-944059ef5830&team_gid=0f99bbe0-3198-4f82-8520-e18a9e24545f&team_gid=f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8&team_gid=4eb0e97b-6e43-47f3-8e46-bedf6de77cea&team_gid=611a0e16-280f-4fe2-98e8-366ba9719962&team_gid=01d41b53-68f6-48f8-a8d0-c9ec2f338749&team_gid=eb81d735-6436-4dac-9a7a-15a7a347d5e6&team_gid=08dc4ba8-22a1-4e5a-9862-20f8a8643f99";
          const normTeam = (value) => scorecardTeamKey(value);
          const canonicalTeam = (value) => {
            const name = normTeam(value);
            const aliases = {
              unitedstates: "usa",
              unitedstatesofamerica: "usa",
              westindies: "westindies",
              uae: "unitedarabemirates",
              emirates: "unitedarabemirates",
            };
            return aliases[name] || name;
          };
          const sameTeam = (left, right) =>
            Boolean(canonicalTeam(left)) && canonicalTeam(left) === canonicalTeam(right);
          const selectedTeams = [f.team, f.opponent].map(canonicalTeam).filter(Boolean);
          const renderLiveSnapshot = async () => {
            try {
              const response = await fetch("/bcci-fixtures-test/live-matches.json?v=isolated-details1", {
                cache: "no-store",
              });
              if (!response.ok) throw new Error("Live snapshot unavailable");
              const payload = await response.json();
              const liveRows = Array.isArray(payload.matches) ? payload.matches : [];
              const liveMatch = liveRows.find((row) => {
                const rowTeams = [row.team1, row.team2].map(normTeam).filter(Boolean);
                return (
                  selectedTeams.length === 2 &&
                  selectedTeams.every((name) =>
                    rowTeams.some((candidate) => sameTeam(candidate, name)),
                  )
                );
              });
              if (liveMatch) {
                const score1 = String(liveMatch.score1 || "Score updating…");
                const score2 = String(liveMatch.score2 || "Score updating…");
                scoreHost.innerHTML =
                  '<div class="scoreboard-result scoreboard-live-card"><p class="scoreboard-live-pill"><span></span> LIVE · BCCI VERIFIED SNAPSHOT</p>' +
                  "<h3>" +
                  escHtml(liveMatch.team1 || f.team) +
                  " <strong>" +
                  escHtml(score1) +
                  "</strong></h3>" +
                  "<h3>" +
                  escHtml(liveMatch.team2 || f.opponent) +
                  " <strong>" +
                  escHtml(score2) +
                  "</strong></h3>" +
                  '<p class="scoreboard-status">' +
                  escHtml(liveMatch.status || "Match in progress") +
                  (liveMatch.match ? " · " + escHtml(liveMatch.match) : "") +
                  (liveMatch.venue ? " · " + escHtml(liveMatch.venue) : "") +
                  "</p>" +
                  '<p class="scoreboard-status">Updated: ' +
                  escHtml(payload.checkedAt || "latest saved snapshot") +
                  ' · Refreshes automatically</p><p class="scoreboard-actions">' +
                  (fixtureMatchId
                    ? '<a class="bcci-live-score-link" href="/bcci-fixtures-test/bcci-scorecard-page.html?gid=' +
                      encodeURIComponent(fixtureMatchId) +
                      '">Open full scorecard ↗</a>'
                    : "") +
                  '<a class="bcci-live-score-link" href="' +
                  escHtml(bcciLiveScoresUrl) +
                  '" target="_blank" rel="noopener noreferrer">Open official BCCI live scores ↗</a></p></div>';
                return;
              }
              scoreHost.innerHTML =
                '<div class="scoreboard-result"><h3>' +
                (matchStarted ? "Waiting for verified live score…" : "Official BCCI scoreboard") +
                "</h3><p>" +
                (liveRows.length
                  ? "A live match is available, but it does not match this fixture. This page will not show another match’s score."
                  : "Live scores will appear here after BCCI publishes this match as live. This panel checks the saved BCCI snapshot automatically.") +
                '</p><p class="scoreboard-status">Fixture: ' +
                escHtml([f.team, f.opponent, f.date].filter(Boolean).join(" · ")) +
                '</p><p><a class="bcci-live-score-link" href="' +
                escHtml(bcciLiveScoresUrl) +
                '" target="_blank" rel="noopener noreferrer">Open official BCCI live scores ↗</a></p></div>';
            } catch (_) {
              scoreHost.innerHTML =
                '<div class="scoreboard-result"><h3>Live scoreboard temporarily unavailable</h3><p>Could not load the latest saved BCCI score snapshot. Please retry shortly.</p><p><a class="bcci-live-score-link" href="' +
                escHtml(bcciLiveScoresUrl) +
                '" target="_blank" rel="noopener noreferrer">Open official BCCI live scores ↗</a></p></div>';
            }
          };
          renderLiveSnapshot();
          // Refresh the visible scoreboard without reloading the page.
          window.setInterval(renderLiveSnapshot, 30000);
        }
      }
      const a = f.team || "India",
        b = f.opponent || "Opponent TBA";
      document.title = a + " vs " + b + " | Match Details";
      set("details-title", a + " vs " + b);
      set("details-series", detail.series || f.series || "Upcoming fixture");
      set("details-team-name", a);
      set("details-opponent-name", b);
      const logoFrom = (object, keys) => {
        for (const key of keys) {
          const value = object?.[key];
          if (typeof value === "string" && value.trim()) return value.trim();
          if (value && typeof value === "object") {
            const nested = value.url || value.imageUrl || value.src;
            if (typeof nested === "string" && nested.trim()) return nested.trim();
          }
        }
        return "";
      };
      const rawTeams = f.rawBcci || {};
      setTeamBadge(
        "details-team-mark-home",
        a,
        logoFrom(f, ["teamLogo", "teamImageUrl", "teamLogoUrl", "team_image", "team_image_url"]) ||
          logoFrom(rawTeams, [
            "team1_logo",
            "team1_image",
            "team1_image_url",
            "home_team_logo",
            "home_team_image",
          ]),
      );
      setTeamBadge(
        "details-team-mark-away",
        b,
        logoFrom(f, [
          "opponentLogo",
          "opponentImageUrl",
          "opponentLogoUrl",
          "opponent_image",
          "opponent_image_url",
        ]) ||
          logoFrom(rawTeams, [
            "team2_logo",
            "team2_image",
            "team2_image_url",
            "away_team_logo",
            "away_team_image",
          ]),
      );
      set("details-date", dateLabel(f.date) + " · " + timeLabel(f.time));
      set("details-venue", f.venue || "Venue TBA");
      set("details-location", detail.ground || "City / ground as listed by source");
      set("details-match-name", f.match || "Match");
      set("details-format", detail.format || f.format || "MATCH PREVIEW");
      set("details-status-note", "Pre-match information");
      set("overview-schedule", dateLabel(f.date) + " · " + timeLabel(f.time));
      set("overview-venue", f.venue || "Venue TBA");
      set(
        "overview-series",
        (detail.series || f.series || "Series not specified") + " · " + (f.match || "Match"),
      );
      set("squad-team-heading", a + " squad");
      set("squad-opponent-heading", b + " squad");
      const matchLabel = String(f.match || detail.format || f.format || "");
      const squadClassId = /t20/i.test(matchLabel)
        ? "3"
        : /odi|one.?day/i.test(matchLabel)
          ? "2"
          : "";
      const rawFixture = f.rawBcci || {};
      const idForTeam = (teamName) => {
        const wanted = String(teamName || "")
          .trim()
          .toLowerCase();
        const firstName = String(
          rawFixture.team1_name ||
            rawFixture.home_team_name ||
            rawFixture.team1_short_name ||
            rawFixture.home_team_short_name ||
            "",
        )
          .trim()
          .toLowerCase();
        const secondName = String(
          rawFixture.team2_name ||
            rawFixture.away_team_name ||
            rawFixture.team2_short_name ||
            rawFixture.away_team_short_name ||
            "",
        )
          .trim()
          .toLowerCase();
        if (wanted && wanted === firstName)
          return String(rawFixture.team1_id || rawFixture.home_team_id || "");
        if (wanted && wanted === secondName)
          return String(rawFixture.team2_id || rawFixture.away_team_id || "");
        // The BCCI fixture feed does not always include stable team IDs.
        // Keep known squad IDs as a fallback so the saved official NZC T20I
        // snapshot can render even when rawBcci only contains team names.
        if (wanted === "india") return "6";
        if (wanted === "west indies") return "4";
        if (wanted === "new zealand" || wanted === "new zealand women") return "5";
        return "";
      };
      const teamId = idForTeam(a);
      const opponentTeamId = idForTeam(b);
      const normaliseTeamName = (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/&/g, "and")
          .replace(/[^a-z0-9]/g, "");
      const findSquad = (id, teamName) => {
        if (!savedSquads.length) return null;
        const candidates = savedSquads.filter(
          (squad) =>
            (id && String(squad.teamId || "").trim() === String(id).trim()) ||
            (teamName && normaliseTeamName(squad.teamName) === normaliseTeamName(teamName)),
        );
        if (!candidates.length) return null;
        // Prefer the matching match format, but don't hide an available official squad
        // merely because a fixture label uses a different format spelling/class ID.
        return (
          candidates.find((squad) => squadClassId && String(squad.classId) === squadClassId) ||
          candidates.find((squad) => Array.isArray(squad.players) && squad.players.length) ||
          candidates[0]
        );
      };
      const teamSquad = findSquad(teamId, a);
      const opponentSquad = findSquad(opponentTeamId, b);
      const adaptPlayers = (squad) =>
        (squad?.players || []).map((p) => ({
          name: p.player_known_as || p.player_name || "Player",
          image: p.player_image || "",
          role: [p.player_role, p.is_captain ? "Captain" : "", p.is_keeper ? "Wicketkeeper" : ""]
            .filter(Boolean)
            .join(" · "),
        }));
      // Additive fallback order: keep the existing manual/fixture squads working
      // unless the refreshed BCCI snapshot actually contains player records.
      const firstNonEmptyPlayers = (...lists) =>
        lists.find((list) => Array.isArray(list) && list.length > 0) || [];
      const homePlayers = firstNonEmptyPlayers(
        detail.squads?.[a],
        f.squad,
        adaptPlayers(teamSquad),
      );
      const awayPlayers = firstNonEmptyPlayers(
        detail.squads?.[b],
        f.opponentSquad,
        adaptPlayers(opponentSquad),
      );
      // Enrich already-selected squad rows with official portraits when a matching
      // player exists in the saved snapshot. This keeps the fixture's roster order
      // intact and never inserts players from another team into the list.
      const normalisePlayerName = (value) =>
        String(value || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
      const portraitsFor = (squad) =>
        new Map(
          (squad?.players || []).flatMap((player) => {
            const name = player.player_known_as || player.player_name || "";
            const image = player.player_image || player.image || "";
            return name && /^https:\/\//i.test(image) ? [[normalisePlayerName(name), image]] : [];
          }),
        );
      const enrichPlayers = (players, squad) => {
        const portraits = portraitsFor(squad);
        return players.map((player) => {
          if (typeof player === "string") {
            return { name: player, image: portraits.get(normalisePlayerName(player)) || "" };
          }
          const image =
            player.image ||
            player.player_image ||
            portraits.get(normalisePlayerName(player.name || player.fullName)) ||
            "";
          return { ...player, image };
        });
      };
      const homeDisplayPlayers = enrichPlayers(homePlayers, teamSquad);
      const awayDisplayPlayers = enrichPlayers(awayPlayers, opponentSquad);
      showPlayers("squad-team-list", homeDisplayPlayers);
      showPlayers("squad-opponent-list", awayDisplayPlayers);
      if (!homePlayers.length || !awayPlayers.length) {
        const missingSides = [!homePlayers.length ? a : "", !awayPlayers.length ? b : ""]
          .filter(Boolean)
          .join(" and ");
        set(
          "playing-xi-note",
          "Squad data is not available for " +
            missingSides +
            ". Official squad snapshot is missing or does not include this team/format yet. Existing match details are unchanged.",
        );
      }
      if (squadCheckedAt) {
        set(
          "workflow-squad",
          "Saved official match-ID squad snapshot checked " +
            squadCheckedAt +
            ". Displayed list: " +
            (teamSquad?.players?.length || 0) +
            " " +
            a +
            " and " +
            (opponentSquad?.players?.length || 0) +
            " " +
            b +
            " player records for class " +
            squadClassId +
            ".",
        );
      }
      set(
        "playing-xi-note",
        detail.playingXIStatus ||
          "Playing XI is not confirmed in saved data. Add only official announcements.",
      );
      set(
        "pitch-report",
        detail.pitchReport ||
          "Not yet verified. Add a sourced pitch report when an official preview is published.",
      );
      set(
        "toss-report",
        detail.tossReport ||
          "Toss has not happened yet. Tactical notes are previews, not confirmed facts.",
      );
      set("ground-report", detail.groundReport || "Verified venue records are not attached yet.");
      set(
        "tilak-preview",
        detail.tilakPreview ||
          "See Tilak Varma's verified career and recent match stats in the Stats section.",
      );
      set("h2h-title", a + " vs " + b);
      set(
        "h2h-summary",
        detail.headToHead ||
          "Verified head-to-head figures are not in the saved fixture source yet.",
      );
      const resultMatches = Array.isArray(resultsSnapshot?.matches) ? resultsSnapshot.matches : [];
      // Recent Match Results uses the Cricsheet archive already loaded above. The
      // BCCI result JSON may be empty, so this section must not depend on it.
      const recentResultsHost = $("recent-match-results");
      if (recentResultsHost) {
        let recentArchiveIndex = scorecardIndex;
        if (!Array.isArray(recentArchiveIndex?.matches)) {
          try {
            const recentIndexResponse = await fetch(
              "/bcci-fixtures-test/scorecards/index.json?v=isolated-details1",
              { cache: "no-store" },
            );
            if (recentIndexResponse.ok) recentArchiveIndex = await recentIndexResponse.json();
          } catch (_) {}
        }
        const archiveMatches = Array.isArray(recentArchiveIndex?.matches)
          ? recentArchiveIndex.matches
          : [];
        const normaliseRecentTeam = (value) =>
          String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
        const recentTeamNames = [a, b].filter(Boolean);
        const resultPerspective = (row, teamName) => {
          const result = String(row.result || "").trim();
          if (!result) return { outcome: "N", label: "Result unavailable" };
          if (/no result|abandoned|cancelled|canceled|tied|drawn/i.test(result))
            return { outcome: "N", label: result };
          if (/\s+won\s+/i.test(result)) {
            const winner = normaliseRecentTeam(result.split(/\s+won\s+/i)[0]);
            return winner === normaliseRecentTeam(teamName)
              ? { outcome: "W", label: result }
              : { outcome: "L", label: result };
          }
          return { outcome: "N", label: result };
        };
        const recentRowsForTeam = (teamName) =>
          archiveMatches
            .filter(
              (row) =>
                [row.team, row.opposition].some(
                  (name) => normaliseRecentTeam(name) === normaliseRecentTeam(teamName),
                ) &&
                String(row.date || "").slice(0, 10) < String(f.date || "9999-12-31").slice(0, 10),
            )
            .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")))
            .slice(0, 8);
        recentResultsHost.innerHTML =
          '<div class="recent-results-team-picker" role="group" aria-label="Choose team recent results">' +
          recentTeamNames
            .map(
              (teamName, i) =>
                '<button type="button" class="recent-results-team-button" data-recent-team="' +
                i +
                '" aria-pressed="' +
                (i === 0) +
                '">' +
                escHtml(teamName) +
                "<span>Recent matches</span></button>",
            )
            .join("") +
          "</div>" +
          recentTeamNames
            .map((teamName, i) => {
              const teamKey = normaliseRecentTeam(teamName);
              const rows = recentRowsForTeam(teamName);
              const logo = teamLogoUrl(teamName, "");
              const logoMarkup = logo
                ? '<img src="' + escHtml(logo) + '" alt="" onerror="this.style.display=\'none\'">'
                : "";
              const cards = rows.length
                ? rows
                    .map((row) => {
                      const opponent =
                        normaliseRecentTeam(row.team) === teamKey ? row.opposition : row.team;
                      const perspective = resultPerspective(row, teamName);
                      const dateText = row.date
                        ? new Date(row.date + "T12:00:00Z").toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })
                        : "Date unavailable";
                      const scorecardUrl =
                        typeof row.matchId === "string" && row.matchId
                          ? "/bcci-fixtures-test/scorecards/?match=" +
                            encodeURIComponent(row.matchId)
                          : "";
                      return (
                        '<article class="recent-result-row"><span class="recent-result-badge recent-result-' +
                        escHtml(perspective.outcome.toLowerCase()) +
                        '">' +
                        escHtml(perspective.outcome === "N" ? "–" : perspective.outcome) +
                        '</span><div class="recent-result-copy"><h4>v ' +
                        escHtml(opponent || "Opponent") +
                        "</h4><p>" +
                        escHtml(perspective.label) +
                        "</p>" +
                        (scorecardUrl
                          ? '<a href="' + escHtml(scorecardUrl) + '">Open full scorecard ↗</a>'
                          : "") +
                        "</div><time>" +
                        escHtml(dateText) +
                        "</time></article>"
                      );
                    })
                    .join("")
                : '<article class="recent-result-row"><p>No verified recent matches in the saved archive.</p></article>';
              return (
                '<section class="recent-team-group" data-recent-team-panel="' +
                i +
                '"' +
                (i ? " hidden" : "") +
                '><h3 class="recent-team-heading"><span class="recent-team-logo">' +
                logoMarkup +
                "</span>" +
                escHtml(teamName) +
                " recent matches</h3>" +
                cards +
                "</section>"
              );
            })
            .join("");
        recentResultsHost.querySelectorAll("[data-recent-team]").forEach((button) =>
          button.addEventListener("click", () => {
            const selected = button.getAttribute("data-recent-team");
            recentResultsHost
              .querySelectorAll("[data-recent-team]")
              .forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
            recentResultsHost.querySelectorAll("[data-recent-team-panel]").forEach((panel) => {
              panel.hidden = panel.getAttribute("data-recent-team-panel") !== selected;
            });
          }),
        );
      }
      const teamNames = [a, b].map((name) => String(name || "").toLowerCase());
      const recentForTeams = resultMatches
        .filter((row) => {
          const names = [row.team1_name, row.team2_name].map((name) =>
            String(name || "").toLowerCase(),
          );
          return names.some((name) => teamNames.includes(name)) && row.match_status === "complete";
        })
        .slice(0, 6);
      const recentLines = recentForTeams.map((row) => {
        const innings = Array.isArray(row.summary?.team) ? row.summary.team : [];
        const scores = innings
          .map((entry) => String(entry.score || "").trim())
          .filter(Boolean)
          .join(" · ");
        return [row.title || row.match_short_name || row.name, scores, row.result_string]
          .filter(Boolean)
          .join(": ");
      });
      const tilakLines = resultMatches
        .filter(
          (row) =>
            row.match_status === "complete" &&
            /tilak varma/i.test(
              (Array.isArray(row.summary?.player) ? row.summary.player : [])
                .map((entry) => String(entry.batting || ""))
                .join("\n"),
            ),
        )
        .slice(0, 5)
        .map((row) => {
          const innings = (Array.isArray(row.summary?.player) ? row.summary.player : [])
            .filter((entry) => /tilak varma/i.test(String(entry.batting || "")))
            .map((entry) =>
              String(entry.batting)
                .split("\n")
                .filter((line) => /tilak varma/i.test(line))
                .join(", "),
            );
          return [row.title || row.match_short_name || row.name, ...innings]
            .filter(Boolean)
            .join(": ");
        });
      set(
        "team-form-summary",
        detail.recentForm ||
          (recentLines.length
            ? recentLines.join(" | ")
            : "Recent completed results are not available in the saved BCCI results snapshot."),
      );
      if (!detail.tilakPreview && tilakLines.length) {
        set("tilak-preview", "Recent BCCI result summaries: " + tilakLines.join(" | "));
      }
      if (resultsSnapshot?.checkedAt) {
        set(
          "workflow-fixture",
          "Upcoming fixtures: " +
            fixtures.length +
            ". BCCI results snapshot: " +
            resultMatches.length +
            " unique matches; checked " +
            resultsSnapshot.checkedAt +
            ". India and West Indies results are merged by BCCI match ID.",
        );
      }
      set(
        "workflow-fixture",
        "Loaded " +
          fixtures.length +
          " fixture(s) from saved News/BCCI Stats JSON. " +
          "News fixtures: " +
          newsFixtures.length +
          "; BCCI Stats fixtures: " +
          statsFixtures.length +
          ".",
      );
      set(
        "details-updated",
        "Source: " +
          (f.tilakInSquad
            ? snapshot?.source || "saved News JSON"
            : statsSnapshot?.source || f.source || "saved fixture JSON") +
          " · Snapshot checked: " +
          (f.tilakInSquad
            ? snapshot?.checkedAt || "not recorded"
            : statsSnapshot?.checkedAt || "not recorded") +
          ". Missing squad/pitch fields are not fabricated.",
      );
      const reviewedSources = Array.isArray(detail.sources)
        ? detail.sources.map((source) => sourceLink(source.label || "Verified source", source.url))
        : [];
      $("details-source-links").innerHTML = [
        ...reviewedSources,
        sourceLink("Official match source", f.newsUrl || f.source),
        sourceLink(
          "BCCI match squads",
          "https://www.bcci.tv/",
        ),
        sourceLink(
          "EllipseData squad source · India",
          "https://epr.ellipsedata.com/redirect/1/comp/9060/squads?team_id=6",
        ),
        sourceLink(
          "EllipseData squad source · West Indies",
          "https://epr.ellipsedata.com/redirect/1/comp/9060/squads?team_id=4",
        ),
        sourceLink(
          "New Zealand Cricket · official T20I squad updates",
          "https://www.nzc.nz/blackcaps-unleash-pace-attack-milne-returns-ravindra-ruled-out/",
        ),
        sourceLink("Original fixture source", f.source),
        sourceLink("Weather · Open-Meteo", "https://open-meteo.com/"),
        sourceLink("Tilak Varma stats", "/stats/"),
        sourceLink("All matches", "/bcci-fixtures-test/"),
      ]
        .filter(Boolean)
        .filter((link, index, links) => links.indexOf(link) === index)
        .join("");
      const startTime = f.time
        ? Date.parse(String(f.date || "") + "T" + String(f.time) + ":00+05:30")
        : Number.NaN;
      if (Number.isFinite(startTime)) {
        const mins = Math.floor((startTime - Date.now()) / 60000);
        set(
          "details-countdown",
          mins > 0
            ? Math.floor(mins / 1440) +
                " days · " +
                Math.floor((mins % 1440) / 60) +
                " hrs to start"
            : "Start time reached / passed",
        );
      } else set("details-countdown", "Start time not confirmed");
      weather(f.venue, f.date);
    } catch (e) {
      console.error("Match details:", e);
      // Keep already-rendered fixture details visible if an optional panel fails.
      // The old catch incorrectly made a late rendering error look like unreadable fixture JSON.
      const message = String(e?.message || e || "Unknown rendering error").slice(0, 180);
      const title = $("details-title");
      if (title && (!title.textContent || /loading/i.test(title.textContent))) {
        title.textContent = "Match details partially loaded";
      }
      set("details-series", "Some match information could not load. Refresh the page to retry.");
      set("workflow-fixture", "Match detail rendering issue: " + message);
    }
  }
  initDetailsSectionTabs();
  init();
})();
