(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { fixtures: [] };

  const pick = (obj, keys, fallback = "") => {
    for (const key of keys) {
      const value = obj?.[key];
      if (value === undefined || value === null || value === "") continue;
      if (typeof value === "object") {
        const name = value.name || value.team_name || value.title || value.short_name;
        if (name) return String(name);
      } else {
        return String(value);
      }
    }
    return fallback;
  };

  function normalise(payload) {
    // The saved Python wrapper contains the original BCCI response under payload.data.
    const bcci = payload?.data ?? payload;
    const matches = Array.isArray(bcci?.match)
      ? bcci.match
      : Array.isArray(bcci?.live_scores)
        ? bcci.live_scores
        : Array.isArray(bcci?.data?.match)
          ? bcci.data.match
          : Array.isArray(bcci?.fixtures)
            ? bcci.fixtures
            : Array.isArray(bcci?.matches)
              ? bcci.matches
              : [];
    // BCCI uses canonical values such as "forthcoming", "live", and "complete".
    // Exclude active/terminal games, but do not mistake the scheduled placeholder
    // "Teams will be announced at the toss" for a completed result.
    const upcoming = matches.filter((m) => {
      const status = [
        m.match_status,
        m.match_status_str,
        m.match_status_name,
        m.live_status_name,
        m.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/[_-]+/g, " ");
      const result = String(m.result_string || m.result || "")
        .trim()
        .toLowerCase();
      const placeholder =
        !result ||
        /^(teams will be announced(?: at the toss)?|match yet to begin|to be announced|toss yet to take place|scheduled|to be played)$/.test(
          result,
        );
      const specificStatus = String(
        m.live_status_name || m.match_status_name || m.match_status_str || "",
      ).toLowerCase().replace(/[_-]+/g, " ").trim();
      const explicitlyPreMatch =
        /^(pre match|scheduled|forthcoming|upcoming|not started)$/.test(specificStatus);
      const live =
        !explicitlyPreMatch &&
        /(^|\b)(live|in progress|in play|innings break|stumps|lunch|tea break|drinks|rain delay|match delayed|match start delayed|start delayed|delayed start)(\b|$)/.test(
          status,
        );
      const terminal =
        /(^|\b)(complete|completed|finished|result|abandoned|no result|cancelled|canceled|won by|win by|drawn|tied|end of match)(\b|$)/.test(
          status,
        );
      const resultIsFinal =
        !placeholder &&
        /\b(win by|won by|drawn|tied|no result|abandoned|match forfeited)\b/.test(result);
      if (live || terminal || resultIsFinal) return false;

      // This fixtures feed contains team-level records, not confirmed player squads.
      // Keep only upcoming senior India men's fixtures as Tilak Varma-related fixtures;
      // exclude women's, A-team, and domestic fixtures that cannot feature him for India.
      const teams = [m.team1_name, m.team2_name, m.home_team_name, m.away_team_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const competition = [
        m.comp_name,
        m.alt_comp_name,
        m.primary_event_name,
        m.name,
        m.match_short_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const hasIndiaMen =
        /(^|\b)india(\b|$)/.test(teams) &&
        !/women|\b(a team|india a|emerging|under ?19|u19|youth|junior)\b/.test(
          teams + " " + competition,
        );
      return hasIndiaMen;
    });
    return upcoming.map((m, i) => {
      // BCCI's start_time_local is the venue's clock, not IST. Prefer UTC kickoff.
      const utcKickoff = String(m.start_datetime_utc || m.startDateTimeUtc || "").trim();
      const utcIso = utcKickoff
        ? (utcKickoff.includes("T") ? utcKickoff : utcKickoff.replace(" ", "T")) +
          (/(Z|[+-]\d{2}:?\d{2})$/i.test(utcKickoff) ? "" : "Z")
        : "";
      const kickoffDate = utcIso ? new Date(utcIso) : null;
      const istTime =
        kickoffDate && Number.isFinite(kickoffDate.getTime())
          ? new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Kolkata",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(kickoffDate)
          : pick(m, ["start_time_ist", "startTimeIST"]);
      return {
        home: pick(m, ["team1_name", "team1_short_name", "home_team_name"], "Team A"),
        away: pick(m, ["team2_name", "team2_short_name", "away_team_name"], "Team B"),
        date:
          kickoffDate && Number.isFinite(kickoffDate.getTime())
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(kickoffDate)
            : pick(m, ["start_date", "date_string", "start_datetime_utc", "end_date"]),
        time: istTime,
        kickoffTimestamp:
          kickoffDate && Number.isFinite(kickoffDate.getTime()) ? kickoffDate.getTime() : null,
        venue: pick(m, ["ground_name", "ground_city", "ground_short_name"]),
        competition: pick(m, ["comp_name", "primary_event_name", "alt_comp_name"], "BCCI Fixture"),
        status: pick(m, ["live_status_name", "match_status_name", "match_status_str", "match_status"], "Scheduled"),
        id: pick(m, ["match_id", "gid"], String(i)),
        title: pick(m, ["title", "match_short_name", "name"]),
        result: pick(m, ["result_string"]),
      };
    });
  }

  const esc = (s) =>
    String(s ?? "").replace(
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

  function fmt(value) {
    if (!value) return "Date TBA";
    // BCCI's date_string is already human-readable (e.g. "16 October 2026").
    if (/\D/.test(value) && !/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(date);
  }

  // Reuse the free team-logo strategy from /matches/match-centre.js: official IPL PNGs,
  // country flag PNGs, and a Commons-hosted West Indies cricket crest.
  const teamAssets = {
    india: { flag: "in" },
    "west indies": {
      logo: "https://commons.wikimedia.org/wiki/Special:FilePath/Cricket_West_Indies_Logo_2017.svg",
    },
    pakistan: { flag: "pk" },
    "sri lanka": { flag: "lk" },
    bangladesh: { flag: "bd" },
    afghanistan: { flag: "af" },
    australia: { flag: "au" },
    england: { flag: "gb-eng" },
    ireland: { flag: "ie" },
    "new zealand": { flag: "nz" },
    "south africa": { flag: "za" },
    zimbabwe: { flag: "zw" },
    nepal: { flag: "np" },
    namibia: { flag: "na" },
    netherlands: { flag: "nl" },
    scotland: { flag: "gb-sct" },
    "united arab emirates": { flag: "ae" },
    oman: { flag: "om" },
    canada: { flag: "ca" },
    usa: { flag: "us" },
    "united states": { flag: "us" },
    japan: { flag: "jp" },
    "mumbai indians": { ipl: "MI" },
    "chennai super kings": { ipl: "CSK" },
    "kolkata knight riders": { ipl: "KKR" },
    "royal challengers bengaluru": { ipl: "RCB" },
    "royal challengers bangalore": { ipl: "RCB" },
    "rajasthan royals": { ipl: "RR" },
    "sunrisers hyderabad": { ipl: "SRH" },
    "delhi capitals": { ipl: "DC" },
    "punjab kings": { ipl: "PBKS" },
    "gujarat titans": { ipl: "GT" },
    "lucknow super giants": { ipl: "LSG" },
  };
  const teamInitials = (name) => {
    const words = String(name || "?")
      .replace(/[^a-z0-9 ]/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [(words[0] || "?").slice(0, 2)])
      .join("")
      .toUpperCase();
  };
  const renderTeam = (name) => {
    const label = String(name || "Team");
    const asset = teamAssets[label.trim().toLowerCase().replace(/\s+/g, " ")] || {};
    const src =
      asset.logo ||
      (asset.ipl
        ? "https://scores.iplt20.com/ipl/teamlogos/" + asset.ipl + ".png"
        : asset.flag
          ? "https://flagcdn.com/w80/" + asset.flag + ".png"
          : "");
    const initials = esc(teamInitials(label));
    const logo = src
      ? '<span class="team-logo"><img src="' +
        esc(src) +
        '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'logo-unavailable\');"><span class="team-logo-fallback" aria-hidden="true">' +
        initials +
        "</span></span>"
      : '<span class="team-logo team-logo-fallback-only" aria-hidden="true">' +
        initials +
        "</span>";
    return (
      '<span class="team-identity">' +
      logo +
      '<span class="team-name">' +
      esc(label) +
      "</span></span>"
    );
  };

  const isLiveMatch = (match) => {
    const status = [
      match?.match_status,
      match?.match_status_str,
      match?.match_status_name,
      match?.live_status_name,
      match?.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[_-]+/g, " ");
    // BCCI's broad match_status can say "live" before play starts. The
    // specific live_status_name is authoritative for the actual match state.
    const specificStatus = String(
      match?.live_status_name || match?.match_status_name || match?.match_status_str || "",
    ).toLowerCase().replace(/[_-]+/g, " ").trim();
    const isPreMatch = /^(pre match|scheduled|forthcoming|upcoming|not started)$/.test(specificStatus);
    // Keep the current-day India fixture in the top match-centre card before
    // the first ball, while preserving its truthful PRE-MATCH status.
    const startValue = match?.start_datetime_utc || match?.start_date || match?.date_string || "";
    const startDate = startValue ? new Date(startValue) : null;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const matchDay = startDate && !Number.isNaN(startDate.getTime())
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(startDate)
      : String(startValue).slice(0, 10);
    if (isPreMatch) return matchDay === today;
    const effectiveStatus = specificStatus || status;
    return (
      /\b(live|in progress|in play|innings break|stumps|lunch|tea break|drinks|rain delay|match delayed|match start delayed|start delayed|delayed start)\b/.test(
        effectiveStatus,
      ) &&
      !/complete|completed|finished|end of match|result|abandoned|no result|cancelled|canceled/.test(
        effectiveStatus,
      )
    );
  };
  const isRelevantIndiaLiveMatch = (match) => {
    if (!isLiveMatch(match)) return false;
    const teams = [
      match?.team1_name,
      match?.team2_name,
      match?.team1_short_name,
      match?.team2_short_name,
      match?.home_team_name,
      match?.away_team_name,
      match?.comp_name,
      match?.alt_comp_name,
      match?.name,
      match?.match_short_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    // Only senior India men's matches belong in this live section; exclude women's, A and youth teams.
    return (
      /(^|\b)india(\b|$)/.test(teams) &&
      !/women|\b(india a|a team|emerging|under ?19|u19|youth|junior)\b/.test(teams)
    );
  };
  function renderLiveMatches(matches) {
    const section = $("liveMatchesSection");
    const host = $("liveMatchList");
    const count = $("liveMatchCount");
    if (!section || !host) return;
    const unique = new Map();
    (Array.isArray(matches) ? matches : []).filter(isRelevantIndiaLiveMatch).forEach((m) => {
      const id = String(m.gid || m.match_gid || m.match_id || m.id || "").trim();
      if (id) unique.set(id, m);
    });
    const rows = [...unique.values()];
    section.hidden = rows.length === 0;
    document.body.classList.toggle("has-live-matches", rows.length > 0);
    if (count)
      count.textContent = rows.length + (rows.length === 1 ? " live match" : " live matches");
    host.innerHTML = rows
      .map((m) => {
        const home = pick(m, ["team1_name", "team1_short_name", "home_team_name"], "Team 1");
        const away = pick(m, ["team2_name", "team2_short_name", "away_team_name"], "Team 2");
        const id = String(m.gid || m.match_gid || m.match_id || m.id || "");
        const innings = Array.isArray(m.summary?.innings) ? m.summary.innings : [];
        const scoreFor = (teamId) => {
          const row = innings.find(
            (inn) => String(inn.batting_team_id ?? inn.team_id) === String(teamId),
          );
          if (!row) return "";
          const runs = row.runs ?? row.total_runs ?? row.score;
          if (runs == null) return "";
          const balls = Number(row.balls ?? row.balls_faced ?? 0);
          const numericRuns = Number(runs);
          const numericWickets = Number(row.wickets ?? 0);
          // BCCI may publish empty innings as 0/0 at a delayed start.
          // Do not present that placeholder as a real live score.
          if (balls === 0 && numericRuns === 0 && numericWickets === 0) return "";
          return (
            String(runs) +
            (row.wickets != null ? "/" + row.wickets : "") +
            (row.overs != null ? " (" + row.overs + " ov)" : "")
          );
        };
        const scoreA = scoreFor(m.team1_id),
          scoreB = scoreFor(m.team2_id);
        const scoreMarkup =
          scoreA || scoreB
            ? '<div class="live-score-line"><span>' +
              esc(scoreA || "Yet to bat") +
              "</span><b>LIVE SCORE</b><span>" +
              esc(scoreB || "Yet to bat") +
              "</span></div>"
            : '<div class="live-score-line live-score-pending">' +
              (/^(pre match|scheduled|forthcoming|upcoming|not started)$/i.test(String(pick(m, ["live_status_name", "match_status_name", "match_status_str", "match_status"], "")).replace(/[_-]+/g, " ").trim())
                ? 'Scoreboard will appear when the first ball is bowled.'
                : 'Live score is updating from BCCI…') +
              '</div>';
        const status = pick(
          m,
          ["live_status_name", "match_status_name", "match_status_str", "match_status"],
          "LIVE",
        );
        const venue = [m.ground_name, m.ground_city].filter(Boolean).join(", ");
        return (
          '<article class="fixture-card upcoming-match-card live-match-card">' +
          '<div class="upcoming-card-top"><span class="live-now-pill ' +
          (/^(pre match|scheduled|forthcoming|upcoming|not started)$/i.test(String(status).replace(/[_-]+/g, " ").trim()) ? 'is-upcoming' : '') +
          '"><i></i> ' +
          (/^(pre match|scheduled|forthcoming|upcoming|not started)$/i.test(String(status).replace(/[_-]+/g, " ").trim()) ? 'UPCOMING · BCCI' : 'LIVE NOW') +
          '</span><span class="upcoming-date">' +
          esc(fmt(pick(m, ["date_string", "start_date", "date"]))) +
          "</span></div>" +
          '<div class="upcoming-teams"><div class="upcoming-team">' +
          renderTeam(home) +
          (scoreA ? '<span class="live-team-score">' + esc(scoreA) + "</span>" : "") +
          '</div><span class="upcoming-versus">VS</span><div class="upcoming-team">' +
          renderTeam(away) +
          (scoreB ? '<span class="live-team-score">' + esc(scoreB) + "</span>" : "") +
          "</div></div>" +
          scoreMarkup +
          '<div class="upcoming-match-info"><strong>' +
          esc(pick(m, ["name", "match_short_name", "comp_name"], home + " vs " + away)) +
          "</strong>" +
          (venue ? '<span class="upcoming-venue">⌖ ' + esc(venue) + "</span>" : "") +
          '<span class="live-status-text">' +
          esc(status) +
          "</span></div>" +
          '<a class="upcoming-details live-match-centre-link" href="./bcci-scorecard-page.html?gid=' +
          encodeURIComponent(id) +
          '">Match Centre <span aria-hidden="true">↗</span></a></article>'
        );
      })
      .join("");
  }

  let countdownTimer = null;
  function renderNextMatchCountdown(fixtures) {
    const existing = $("bcciNextMatchCountdown");
    if (existing) existing.remove();
    if (countdownTimer) clearInterval(countdownTimer);

    // BCCI can return a date-only field, a local clock time, or a complete
    // ISO datetime in either field. Parse those shapes consistently as IST.
    const matchTimestamp = (fixture) => {
      // Prefer the exact UTC kickoff from BCCI so countdown matches the displayed IST time.
      const exactKickoff = Number(fixture?.kickoffTimestamp);
      if (Number.isFinite(exactKickoff) && exactKickoff > 0) return exactKickoff;
      const dateValue = String(fixture?.date || "").trim();
      const timeValue = String(fixture?.time || "").trim();
      if (!dateValue) return NaN;

      const isoDateTime = (value) => {
        if (!value) return NaN;
        const normalised = value.includes("T") ? value : value.replace(" ", "T");
        if (!/^\d{4}-\d{2}-\d{2}T/.test(normalised)) return NaN;
        const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalised)
          ? normalised
          : normalised + "+05:30";
        const parsed = Date.parse(withZone);
        return Number.isFinite(parsed) ? parsed : NaN;
      };

      const fullFromTime = isoDateTime(timeValue);
      if (Number.isFinite(fullFromTime)) return fullFromTime;
      const fullFromDate = isoDateTime(dateValue);
      if (Number.isFinite(fullFromDate)) return fullFromDate;

      const date = dateValue.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
      const clock = timeValue.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
      if (!clock) return Date.parse(date + "T00:00:00+05:30");

      let hours = Number(clock[1]);
      const minutes = Number(clock[2]);
      const seconds = Number(clock[3] || "0");
      const meridiem = String(clock[4] || "").toUpperCase();
      if (hours > 23 || minutes > 59 || seconds > 59) return NaN;
      if (meridiem) {
        if (hours < 1 || hours > 12) return NaN;
        hours = (hours % 12) + (meridiem === "PM" ? 12 : 0);
      }
      return Date.parse(
        date +
          "T" +
          String(hours).padStart(2, "0") +
          ":" +
          String(minutes).padStart(2, "0") +
          ":" +
          String(seconds).padStart(2, "0") +
          "+05:30",
      );
    };

    const now = Date.now();
    const next = fixtures
      .filter(
        (fixture) =>
          Number.isFinite(matchTimestamp(fixture)) &&
          matchTimestamp(fixture) > now &&
          !/live|completed|result|abandoned|cancelled|canceled/i.test(String(fixture.status || "")),
      )
      .sort((a, b) => matchTimestamp(a) - matchTimestamp(b))[0];
    if (!next) return;

    const host = $("fixtureList");
    if (!host) return;
    if (!document.getElementById("bcci-next-countdown-style")) {
      const style = document.createElement("style");
      style.id = "bcci-next-countdown-style";
      style.textContent = `.bcci-next-countdown{box-sizing:border-box;width:100%;margin:22px 0 26px;padding:clamp(18px,3vw,32px);text-align:center;color:#f4f7ff;background:radial-gradient(circle at 18% 20%,#123e82 0,transparent 40%),linear-gradient(135deg,#071d57,#06143d 70%,#0b255b);border:1px solid #234b91;border-radius:22px;box-shadow:0 14px 34px #020b2240;overflow:hidden}.bcci-countdown-teams{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;justify-content:center;gap:clamp(10px,2.4vw,32px);width:100%;max-width:920px;margin:0 auto}.bcci-countdown-side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;width:100%;min-width:0;font-weight:800;text-align:center}.bcci-countdown-side .team-identity{display:contents}.bcci-countdown-side .team-name{display:none!important}.bcci-countdown-side .team-logo,.bcci-countdown-side .team-crest{display:grid;place-items:center;flex:0 0 auto;width:clamp(62px,7vw,86px);height:clamp(48px,5.8vw,66px);padding:0;overflow:hidden;box-sizing:border-box;object-fit:contain;border:1px solid #ffffff24;border-radius:12px;background:rgba(255,255,255,.06);box-shadow:0 6px 16px #0002}.bcci-countdown-side .team-logo img{display:block;width:100%;height:100%;padding:2px;object-fit:contain;box-sizing:border-box}.bcci-countdown-side .team-logo .team-logo-fallback{font-size:12px}.bcci-countdown-label{display:block;width:100%;max-width:220px;font-size:clamp(13px,1.8vw,20px);line-height:1.25;overflow-wrap:anywhere}.bcci-countdown-clock{display:flex;align-items:stretch;justify-content:center;gap:clamp(4px,1vw,10px);min-width:0}.bcci-countdown-clock>div{display:flex;flex-direction:column;justify-content:center;min-width:clamp(54px,8vw,78px);padding:14px 8px;box-sizing:border-box;background:#e8edff;color:#061746;border-radius:13px;box-shadow:0 5px 14px #020b2230}.bcci-countdown-clock strong{display:block;font-size:clamp(21px,3.2vw,38px);line-height:1.05;font-variant-numeric:tabular-nums}.bcci-countdown-clock small{display:block;margin-top:7px;font-size:clamp(9px,1vw,12px);font-weight:900;letter-spacing:.04em}.bcci-countdown-title{margin:22px 0 6px;font-weight:900;font-size:clamp(18px,2.6vw,28px);color:#8ee8ff}.bcci-countdown-meta{margin:0;color:#c4d5f7;font-size:clamp(12px,1.7vw,17px);line-height:1.55;overflow-wrap:anywhere}@media(max-width:520px){.bcci-next-countdown{padding:18px 10px;border-radius:18px}.bcci-countdown-teams{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:6px}.bcci-countdown-side{gap:7px;max-width:none}.bcci-countdown-side .team-logo,.bcci-countdown-side .team-crest{width:clamp(48px,15vw,64px);height:clamp(42px,12vw,52px);border-radius:10px}.bcci-countdown-label{font-size:clamp(11px,3.2vw,14px);line-height:1.2}.bcci-countdown-clock{gap:4px}.bcci-countdown-clock>div{min-width:clamp(39px,12vw,49px);padding:9px 3px;border-radius:9px}.bcci-countdown-clock strong{font-size:clamp(17px,5vw,23px)}.bcci-countdown-clock small{font-size:8px;margin-top:5px;letter-spacing:0}.bcci-countdown-title{margin-top:18px;font-size:20px}.bcci-countdown-meta{font-size:12px}}`;
      document.head.appendChild(style);
    }

    const banner = document.createElement("section");
    banner.id = "bcciNextMatchCountdown";
    banner.className = "bcci-next-countdown";
    banner.innerHTML =
      '<div class="bcci-countdown-teams"><div class="bcci-countdown-side">' +
      renderTeam(next.home || "India") +
      '<span class="bcci-countdown-label">' +
      esc(next.home || "India") +
      '</span></div><div class="bcci-countdown-clock" role="timer" aria-label="Countdown to next match"><div><strong data-h>00</strong><small>HRS</small></div><div><strong data-m>00</strong><small>MINS</small></div><div><strong data-s>00</strong><small>SECS</small></div></div><div class="bcci-countdown-side">' +
      renderTeam(next.away || "Opponent") +
      '<span class="bcci-countdown-label">' +
      esc(next.away || "Opponent") +
      '</span></div></div><p class="bcci-countdown-title">' +
      esc(next.title || next.competition || "Upcoming match") +
      '</p><p class="bcci-countdown-meta">' +
      esc(fmt(next.date)) +
      (next.time ? " · " + esc(next.time) + " IST" : "") +
      (next.venue ? " · " + esc(next.venue) : "") +
      "</p>";
    host.parentNode.insertBefore(banner, host);

    const targetTime = matchTimestamp(next);
    const tick = () => {
      const left = Math.max(0, targetTime - Date.now());
      banner.querySelector("[data-h]").textContent = String(Math.floor(left / 3600000)).padStart(
        2,
        "0",
      );
      banner.querySelector("[data-m]").textContent = String(
        Math.floor((left % 3600000) / 60000),
      ).padStart(2, "0");
      banner.querySelector("[data-s]").textContent = String(
        Math.floor((left % 60000) / 1000),
      ).padStart(2, "0");
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function render() {
    const query = $("searchInput").value.trim().toLowerCase();
    const statusFilter = $("statusFilter").value;
    const sort = $("sortFilter").value;
    const list = state.fixtures.filter(
      (f) =>
        [f.home, f.away, f.venue, f.competition, f.status, f.date, f.title, f.result]
          .join(" ")
          .toLowerCase()
          .includes(query) &&
        (statusFilter === "all" || f.status.toLowerCase() === statusFilter.toLowerCase()),
    );

    list.sort((a, b) => {
      const aDate = Date.parse(a.date) || 0;
      const bDate = Date.parse(b.date) || 0;
      return sort === "date-desc" ? bDate - aDate : aDate - bDate;
    });

    $("resultCount").textContent = list.length + " of " + state.fixtures.length + " matches";
    renderNextMatchCountdown(state.fixtures);
    $("fixtureList").innerHTML = list
      .map((f) => {
        const isLive = /live|progress|in play/i.test(f.status);
        const extra =
          f.result && !/teams will be announced/i.test(f.result)
            ? '<div class="match-meta"><span>' + esc(f.result) + "</span></div>"
            : "";
        return (
          '<article class="fixture-card upcoming-match-card">' +
          '<div class="upcoming-card-top"><span class="upcoming-date">◷ ' +
          esc(fmt(f.date)) +
          '</span><span class="squad-confirmed"><i aria-hidden="true"></i> INDIA MEN’S FIXTURE</span></div>' +
          '<div class="upcoming-teams"><div class="upcoming-team">' +
          renderTeam(f.home) +
          '</div><span class="upcoming-versus">VS</span><div class="upcoming-team">' +
          renderTeam(f.away) +
          "</div></div>" +
          '<div class="upcoming-match-info"><strong>' +
          esc(f.title || f.competition || "Upcoming match") +
          "</strong>" +
          (f.venue ? '<span class="upcoming-venue">⌖ ' + esc(f.venue) + "</span>" : "") +
          (f.time ? '<span class="upcoming-time">' + esc(f.time) + " IST</span>" : "") +
          "</div>" +
          extra +
          '<a class="upcoming-details" href="./details/index.html?matchId=' +
          encodeURIComponent(f.id) +
          "&date=" +
          encodeURIComponent(f.date) +
          "&team=" +
          encodeURIComponent(f.home) +
          "&opponent=" +
          encodeURIComponent(f.away) +
          "&match=" +
          encodeURIComponent(f.title || f.competition || "Match") +
          '">Full Match Details <span aria-hidden="true">↗</span></a>' +
          "</article>"
        );
      })
      .join("");

    $("emptyState").hidden = list.length !== 0;
    $("fixtureList").hidden = list.length === 0;
  }

  async function load() {
    const button = $("refreshBtn");
    if (button) button.disabled = true;
    $("fixtureList").hidden = false;
    $("fixtureList").innerHTML = '<div class="loading-state">Loading BCCI fixtures…</div>';
    try {
      // Fixture grid uses only bcci-fixtures.json. Live grid remains on its own
      // independent live-matches.json polling pipeline below.
      const response = await fetch("./bcci-fixtures.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load bcci-fixtures.json");
      const payload = await response.json();
      if (payload.status && payload.status !== "ok") {
        throw new Error(payload.error || "BCCI snapshot status: " + payload.status);
      }

      state.fixtures = normalise(payload).sort((a, b) => a.date.localeCompare(b.date));
      const root = payload.data ?? payload;
      const page = root.page ?? {};
      if ($("totalCount")) $("totalCount").textContent = state.fixtures.length;
      if ($("pageCount")) $("pageCount").textContent = page.last_page ?? 1;
      if ($("lastUpdated"))
        $("lastUpdated").textContent = payload.fetchedAt ? fmt(payload.fetchedAt) : "Loaded";
      if ($("sourceStatus"))
        $("sourceStatus").textContent = "BCCI fixtures snapshot · live grid uses separate feed";

      const statuses = [...new Set(state.fixtures.map((f) => f.status).filter(Boolean))].sort();
      const filter = $("statusFilter");
      const previous = filter.value;
      filter.innerHTML =
        '<option value="all">All statuses</option>' +
        statuses
          .map((status) => '<option value="' + esc(status) + '">' + esc(status) + "</option>")
          .join("");
      if (statuses.includes(previous)) filter.value = previous;
      render();

      if (!state.fixtures.length) {
        $("fixtureList").hidden = false;
        $("fixtureList").innerHTML =
          '<div class="loading-state">No upcoming India men’s fixtures found in bcci-fixtures.json.</div>';
        $("emptyState").hidden = true;
      }
    } catch (error) {
      if ($("totalCount")) $("totalCount").textContent = "—";
      if ($("pageCount")) $("pageCount").textContent = "—";
      if ($("lastUpdated")) $("lastUpdated").textContent = "Unavailable";
      if ($("sourceStatus")) $("sourceStatus").textContent = "Could not load snapshot";
      $("fixtureList").hidden = false;
      $("fixtureList").innerHTML =
        '<div class="loading-state">' +
        esc(error.message) +
        '<br><br><a class="secondary-btn" href="./bcci-fixtures.json" target="_blank" rel="noopener">Open JSON file</a></div>';
      $("resultCount").textContent = "No data";
    } finally {
      if (button) button.disabled = false;
    }
  }

  if ($("refreshBtn")) $("refreshBtn").addEventListener("click", load);
  $("searchInput")?.addEventListener("input", render);
  $("statusFilter")?.addEventListener("change", render);
  $("sortFilter")?.addEventListener("change", render);

  // The dedicated bcci-fixtures-test/live-matches.json snapshot is the live-status source.
  let liveMode = false;
  let liveRefreshTimer = null;
  async function checkLiveMode() {
    try {
      const response = await fetch("./live-matches.json?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("BCCI live-matches snapshot unavailable");
      const payload = await response.json();
      const matches = (Array.isArray(payload?.matches) ? payload.matches : []).map((m) => ({
        ...((m && typeof m.raw === "object" && m.raw) || {}),
        id: m.id || m.gid || m.match_id,
        team1_name: m.team1 || m.team1_name || m.team1Name,
        team2_name: m.team2 || m.team2_name || m.team2Name,
        team1_score: m.score1 || m.team1_score,
        team2_score: m.score2 || m.team2_score,
        // Preserve BCCI's broad and specific status fields separately.
        match_status: m.raw?.match_status || m.match_status || m.status,
        live_status_name: m.raw?.live_status_name || m.live_status_name || m.status,
        name: m.match || m.name,
        comp_name: m.series || m.comp_name,
        ground_name: m.venue || m.ground_name,
      }));
      // If the live-score endpoint briefly returns an empty snapshot, recover
      // currently-live fixtures from the separately refreshed BCCI fixtures feed.
      // This keeps the match visible without inventing a score.
      let fixtureFallback = [];
      try {
        const fixtureResponse = await fetch("./bcci-fixtures.json?t=" + Date.now(), {
          cache: "no-store",
        });
        if (fixtureResponse.ok) {
          const fixturePayload = await fixtureResponse.json();
          const fixtureRoot = fixturePayload?.data ?? fixturePayload;
          const fixtureRows = Array.isArray(fixtureRoot?.match)
            ? fixtureRoot.match
            : Array.isArray(fixtureRoot?.fixtures)
              ? fixtureRoot.fixtures
              : Array.isArray(fixtureRoot?.matches)
                ? fixtureRoot.matches
                : [];
          fixtureFallback = fixtureRows.filter(isRelevantIndiaLiveMatch);
        }
      } catch (_) {
        // Keep the valid live-score snapshot usable if the fixture fallback fails.
      }
      const combinedMatches = [...matches, ...fixtureFallback];
      const live = combinedMatches.filter(isRelevantIndiaLiveMatch);
      const title = $("liveRefreshTitle"),
        message = $("liveRefreshMessage"),
        stateBadge = $("liveRefreshState");
      renderLiveMatches(combinedMatches);
      if (live.length) {
        liveMode = true;
        if (title) title.textContent = "Live match updates";
        if (message)
          message.textContent =
            live.length +
            " live match(es) detected. BCCI fixture/score data is rechecked every 60 seconds.";
        if (stateBadge) {
          stateBadge.textContent = "LIVE · AUTO";
          stateBadge.classList.add("is-live");
        }
        if (liveRefreshTimer) clearInterval(liveRefreshTimer);
        liveRefreshTimer = setInterval(async () => {
          try {
            const check = await fetch("./live-matches.json?t=" + Date.now(), {
              cache: "no-store",
            });
            if (!check.ok) throw new Error("Live snapshot unavailable");
            const nextPayload = await check.json();
            const nextMatches = (
              Array.isArray(nextPayload?.matches) ? nextPayload.matches : []
            ).map((m) => ({
              ...((m && typeof m.raw === "object" && m.raw) || {}),
              id: m.id || m.gid || m.match_id,
              team1_name: m.team1 || m.team1_name || m.team1Name,
              team2_name: m.team2 || m.team2_name || m.team2Name,
              team1_score: m.score1 || m.team1_score,
              team2_score: m.score2 || m.team2_score,
              // Preserve BCCI's broad and specific status fields separately.
              match_status: m.raw?.match_status || m.match_status || m.status,
              live_status_name: m.raw?.live_status_name || m.live_status_name || m.status,
              name: m.match || m.name,
              comp_name: m.series || m.comp_name,
              ground_name: m.venue || m.ground_name,
            }));
            let nextFixtureFallback = [];
            try {
              const fixtureCheck = await fetch("./bcci-fixtures.json?t=" + Date.now(), {
                cache: "no-store",
              });
              if (fixtureCheck.ok) {
                const fixturePayload = await fixtureCheck.json();
                const fixtureRoot = fixturePayload?.data ?? fixturePayload;
                const fixtureRows = Array.isArray(fixtureRoot?.match)
                  ? fixtureRoot.match
                  : Array.isArray(fixtureRoot?.fixtures)
                    ? fixtureRoot.fixtures
                    : Array.isArray(fixtureRoot?.matches)
                      ? fixtureRoot.matches
                      : [];
                nextFixtureFallback = fixtureRows.filter(isRelevantIndiaLiveMatch);
              }
            } catch (_) {
              // Preserve the live feed even if the fallback fixture fetch fails.
            }
            const combinedNextMatches = [...nextMatches, ...nextFixtureFallback];
            renderLiveMatches(combinedNextMatches);
            if (combinedNextMatches.some(isRelevantIndiaLiveMatch)) {
              await load();
            } else {
              clearInterval(liveRefreshTimer);
              liveRefreshTimer = null;
              liveMode = false;
              if (message) message.textContent = "No live match now. Automatic refresh has paused.";
              if (stateBadge) {
                stateBadge.textContent = "Standby";
                stateBadge.classList.remove("is-live");
              }
            }
          } catch (_) {
            /* Preserve last good UI on temporary feed failures. */
          }
        }, 60000);
      } else {
        if (liveRefreshTimer) clearInterval(liveRefreshTimer);
        liveRefreshTimer = null;
        liveMode = false;
        if (title) title.textContent = "Live-aware updates";
        if (message) message.textContent = "No match is live. Automatic refresh is paused.";
        if (stateBadge) {
          stateBadge.textContent = "Standby";
          stateBadge.classList.remove("is-live");
        }
      }
    } catch (_) {
      if ($("liveRefreshMessage"))
        $("liveRefreshMessage").textContent =
          "BCCI live status is unavailable; waiting for the next valid fixtures snapshot.";
    }
  }
  load();
  checkLiveMode();
  setInterval(checkLiveMode, 60000);
})();
