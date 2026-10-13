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
    const n = String(name || "").trim().toLowerCase();
    const logos = {
      india: "https://flagcdn.com/w160/in.png",
      "west indies": "https://commons.wikimedia.org/wiki/Special:FilePath/Cricket_West_Indies_Logo_2017.svg",
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
      kenya: "https://flagcdn.com/w160/ke.png"
    };
    return logos[n] || "";
  };
  function setTeamBadge(id, name) {
    const host = $(id);
    if (!host) return;
    const initials = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const src = teamLogoUrl(name);
    if (!src) {
      host.textContent = initials;
      return;
    }
    host.innerHTML = '<img src="' + esc(src) + '" alt="" aria-hidden="true" loading="eager">';
    const img = host.querySelector("img");
    img.addEventListener("error", () => {
      host.textContent = initials;
      host.classList.add("details-team-mark-fallback");
    }, { once: true });
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
  async function init() {
    try {
      const r = await fetch("/matches/upcoming-fixtures-refresh.json?v=20261014-details1", {
        cache: "no-store",
      });
      if (!r.ok) throw Error("fixture snapshot unavailable");
      const snapshot = await r.json();
      let manual = { matches: [] };
      try {
        const mr = await fetch("/matches/details/data/match-details.json?v=20261014-details1", {
          cache: "no-store",
        });
        if (mr.ok) manual = await mr.json();
      } catch (_) {}
      const fixtures = Array.isArray(snapshot.fixtures) ? snapshot.fixtures : [];
      const date = q.get("date"),
        match = q.get("match"),
        opponent = q.get("opponent");
      const f = fixtures.find(
        (x) =>
          (!date || x.date === date) &&
          (!match || String(x.match || "").toLowerCase() === match.toLowerCase()) &&
          (!opponent || String(x.opponent || "").toLowerCase() === opponent.toLowerCase()),
      );
      if (!f) {
        set("details-title", "Match details unavailable");
        set(
          "details-series",
          "No matching fixture in the saved snapshot. Return to Matches and choose a listed fixture.",
        );
        set("workflow-fixture", "No matching fixture found.");
        return;
      }
      const detail = (manual.matches || []).find((x) => key(x) === key(f)) || {};
      const a = f.team || "India",
        b = f.opponent || "Opponent TBA";
      document.title = a + " vs " + b + " | Match Details";
      set("details-title", a + " vs " + b);
      set("details-series", detail.series || f.series || "Upcoming international fixture");
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
      showPlayers("squad-team-list", detail.squads?.[a] || f.squad || []);
      showPlayers("squad-opponent-list", detail.squads?.[b] || f.opponentSquad || []);
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
      set(
        "team-form-summary",
        detail.recentForm || "Verified recent results are not attached to this fixture.",
      );
      set(
        "workflow-fixture",
        "Loaded " +
          fixtures.length +
          " fixture(s) from the saved News JSON pipeline. Last checked: " +
          (snapshot.checkedAt
            ? new Date(snapshot.checkedAt).toLocaleString("en-IN")
            : "not recorded") +
          ".",
      );
      set(
        "details-updated",
        "Source: " +
          (snapshot.source || "saved fixture JSON") +
          " · Snapshot checked: " +
          (snapshot.checkedAt || "not recorded") +
          ". Missing squad/pitch fields are not fabricated.",
      );
      const reviewedSources = Array.isArray(detail.sources)
        ? detail.sources.map((source) => sourceLink(source.label || "Verified source", source.url))
        : [];
      $("details-source-links").innerHTML = [
        ...reviewedSources,
        sourceLink("Official match news", f.newsUrl || f.source),
        sourceLink("Original fixture source", f.source),
        sourceLink("Weather · Open-Meteo", "https://open-meteo.com/"),
        sourceLink("Tilak Varma stats", "/stats/"),
        sourceLink("All matches", "/matches/"),
      ]
        .filter(Boolean)
        .filter((link, index, links) => links.indexOf(link) === index)
        .join("");
      const start = Date.parse(
        String(f.date || "") + "T" + String(f.time || "19:00") + ":00+05:30",
      );
      if (Number.isFinite(start)) {
        const mins = Math.floor((start - Date.now()) / 60000);
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
      set("details-series", "Saved fixture could not be read. Return to Matches and try again.");
      set("workflow-fixture", "Fixture request failed; refresh and retry.");
    }
  }
  init();
})();
