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
  const teamLogoUrl = (name) => {
    const n = String(name || "")
      .trim()
      .toLowerCase();
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
    };
    return logos[n] || "";
  };
  function setTeamBadge(id, name) {
    const host = $(id);
    if (!host) return;
    const initials = String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    const src = teamLogoUrl(name);
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
        return (
          '<div class="details-player-row"><span class="details-player-avatar">' +
          esc(
            n
              .split(/\s+/)
              .map((x) => x[0])
              .slice(0, 2)
              .join(""),
          ) +
          '</span><span class="details-player-copy"><strong>' +
          esc(n) +
          "</strong><small>" +
          esc(role || "Squad member") +
          "</small></span></div>"
        );
      })
      .join("");
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
      const [newsResponse, statsResponse, resultsResponse, squadsResponse, scorecardIndexResponse] =
        await Promise.all([
          fetch("/matches/upcoming-fixtures-refresh.json?v=20261015-details3", {
            cache: "no-store",
          }).catch(() => null),
          fetch("/matches/bcci-stats-fixtures.json?v=20261015-details3", {
            cache: "no-store",
          }).catch(() => null),
          fetch("/matches/bcci-match-results.json?v=20261015-results1", {
            cache: "no-store",
          }).catch(() => null),
          fetch("/matches/bcci-squads.json?v=20261015-squads1", { cache: "no-store" }).catch(
            () => null,
          ),
          fetch("/matches/scorecards/index.json?v=20261015-full-scoreboard1", {
            cache: "no-store",
          }).catch(() => null),
        ]);
      const snapshot =
        newsResponse && newsResponse.ok ? await newsResponse.json().catch(() => null) : null;
      const statsSnapshot =
        statsResponse && statsResponse.ok ? await statsResponse.json().catch(() => null) : null;
      const resultsSnapshot =
        resultsResponse && resultsResponse.ok
          ? await resultsResponse.json().catch(() => null)
          : null;
      const squadsSnapshot =
        squadsResponse && squadsResponse.ok
          ? await squadsResponse.json().catch(() => null)
          : null;
      const scorecardIndex =
        scorecardIndexResponse && scorecardIndexResponse.ok
          ? await scorecardIndexResponse.json().catch(() => null)
          : null;
      let manual = { matches: [] };
      try {
        const mr = await fetch("/matches/details/data/match-details.json?v=20261014-details1", {
          cache: "no-store",
        });
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
      [...statsFixtures, ...newsFixtures].forEach((x) => {
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
      const f = fixtures.find((x) =>
        matchId
          ? fixtureIds(x).includes(matchId)
          : (!date || x.date === date) &&
            (!match || String(x.match || "").toLowerCase() === match.toLowerCase()) &&
            (!opponent || String(x.opponent || "").toLowerCase() === opponent.toLowerCase()),
      );
      if (!f) {
        set("details-title", "Match details unavailable");
        set(
          "details-series",
          "No matching fixture in saved JSON snapshots. Return to Matches and choose a listed fixture.",
        );
        set("workflow-fixture", "No matching fixture found in the saved News/BCCI Stats JSON.");
        return;
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
      // Live scoreboard waits for the official ID; never substitute by date/team.
      const exactScorecard = fixtureMatchId
        ? scorecardRows.find((row) => {
            const rowId = String(row.matchId || row.match_id || row.gid || "").trim();
            return Boolean(rowId && rowId === fixtureMatchId);
          })
        : null;
      let scorecardLoaded = false;
      if (exactScorecard?.scorecard) {
        try {
          const scorecardResponse = await fetch(exactScorecard.scorecard, { cache: "no-store" });
          if (scorecardResponse.ok) {
            const scorecardData = await scorecardResponse.json().catch(() => null);
            scorecardLoaded = renderScorecard(scorecardData);
          }
        } catch (_) {}
      }
      // Match the BCCI results snapshot only by the fixture's official IDs and team IDs.
      // A result row for another match is never accepted by team names/date alone.
      if (!scorecardLoaded && fixtureMatchId) {
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
          scoreHost.innerHTML =
            '<div class="scoreboard-result"><h3>' +
            (matchStarted
              ? "Live score not available yet"
              : "Live scoreboard will appear when the match starts") +
            "</h3><p>" +
            (matchStarted
              ? "No verified live score feed is connected for this match yet. The previous match score will not be shown here."
              : "This fixture has not started. No score is shown yet, and previous matches are never used as a substitute.") +
            '</p><p class="scoreboard-status">Fixture: ' +
            escHtml([f.team, f.opponent, f.date].filter(Boolean).join(" · ")) +
            ". Waiting for this match's own verified score data.</p></div>";
        }
      }
      const a = f.team || "India",
        b = f.opponent || "Opponent TBA";
      document.title = a + " vs " + b + " | Match Details";
      set("details-title", a + " vs " + b);
      set("details-series", detail.series || f.series || "Upcoming fixture");
      set("details-team-name", a);
      set("details-opponent-name", b);
      setTeamBadge("details-team-mark-home", a);
      setTeamBadge("details-team-mark-away", b);
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
      const savedSquads = Array.isArray(squadsSnapshot?.squads) ? squadsSnapshot.squads : [];
      const rawFixture = f.rawBcci || {};
      const idForTeam = (teamName) => {
        const wanted = String(teamName || "")
          .trim()
          .toLowerCase();
        const firstName = String(rawFixture.team1_name || rawFixture.home_team_name || "")
          .trim()
          .toLowerCase();
        const secondName = String(rawFixture.team2_name || rawFixture.away_team_name || "")
          .trim()
          .toLowerCase();
        if (wanted && wanted === firstName)
          return String(rawFixture.team1_id || rawFixture.home_team_id || "");
        if (wanted && wanted === secondName)
          return String(rawFixture.team2_id || rawFixture.away_team_id || "");
        if (wanted === "india") return "6";
        if (wanted === "west indies") return "4";
        return "";
      };
      const teamId = idForTeam(a);
      const opponentTeamId = idForTeam(b);
      const findSquad = (id) =>
        id && squadClassId
          ? savedSquads.find((s) => String(s.teamId) === id && String(s.classId) === squadClassId)
          : null;
      const teamSquad = findSquad(teamId);
      const opponentSquad = findSquad(opponentTeamId);
      const adaptPlayers = (squad) =>
        (squad?.players || []).map((p) => ({
          name: p.player_known_as || p.player_name || "Player",
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
      showPlayers("squad-team-list", homePlayers);
      showPlayers("squad-opponent-list", awayPlayers);
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
      if (squadsSnapshot?.checkedAt) {
        set(
          "workflow-squad",
          "Saved official squad snapshot checked " +
            squadsSnapshot.checkedAt +
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
          "https://www.bcci.tv/matches/b567f7d4-7455-48b3-8ec2-f76ce4788e70/india-vs-west-indies/squads",
        ),
        sourceLink(
          "EllipseData squad source · India",
          "https://epr.ellipsedata.com/redirect/1/comp/9060/squads?team_id=6",
        ),
        sourceLink(
          "EllipseData squad source · West Indies",
          "https://epr.ellipsedata.com/redirect/1/comp/9060/squads?team_id=4",
        ),
        sourceLink("Original fixture source", f.source),
        sourceLink("Weather · Open-Meteo", "https://open-meteo.com/"),
        sourceLink("Tilak Varma stats", "/stats/"),
        sourceLink("All matches", "/matches/"),
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
      set("details-title", "Match details could not load");
      set(
        "details-series",
        "Saved fixture JSON could not be read. Return to Matches and try again.",
      );
      set("workflow-fixture", "Fixture request failed; refresh and retry.");
    }
  }
  init();
})();
