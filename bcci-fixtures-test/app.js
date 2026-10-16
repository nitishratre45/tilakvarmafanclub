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
      const live =
        /(^|\b)(live|in progress|in play|innings break|stumps|lunch|tea break|drinks|rain delay|match delayed)(\b|$)/.test(
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
    return upcoming.slice(0, 12).map((m, i) => ({
      home: pick(m, ["team1_name", "team1_short_name", "home_team_name"], "Team A"),
      away: pick(m, ["team2_name", "team2_short_name", "away_team_name"], "Team B"),
      date: pick(m, ["start_date", "date_string", "start_datetime_utc", "end_date"]),
      time: pick(m, ["start_time_local", "start_datetime_utc"]),
      venue: pick(m, ["ground_name", "ground_city", "ground_short_name"]),
      competition: pick(m, ["comp_name", "primary_event_name", "alt_comp_name"], "BCCI Fixture"),
      status: pick(m, ["match_status", "match_status_str", "match_status_name"], "Scheduled"),
      id: pick(m, ["match_id", "gid"], String(i)),
      title: pick(m, ["title", "match_short_name", "name"]),
      result: pick(m, ["result_string"]),
    }));
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

    $("resultCount").textContent = list.length + " of " + state.fixtures.length + " fixtures";
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
          '</span><span class="squad-confirmed"><i aria-hidden="true"></i> TILAK IN SQUAD</span></div>' +
          '<div class="upcoming-teams"><div class="upcoming-team">' +
          renderTeam(f.home) +
          '</div><span class="upcoming-versus">VS</span><div class="upcoming-team">' +
          renderTeam(f.away) +
          '</div></div>' +
          '<div class="upcoming-match-info"><strong>' +
          esc(f.title || f.competition || "Upcoming fixture") +
          '</strong>' +
          (f.venue ? '<span class="upcoming-venue">⌖ ' + esc(f.venue) + '</span>' : "") +
          (f.time ? '<span class="upcoming-time">' + esc(f.time) + ' IST</span>' : "") +
          '</div>' +
          extra +
          '<a class="upcoming-details" href="/matches/">Full Match Details <span aria-hidden="true">↗</span></a>' +
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
    $("fixtureList").innerHTML =
      '<div class="loading-state">Loading Tilak Varma squad-confirmed BCCI fixtures…</div>';
    try {
      // Read-only reuse of the Matches page's existing pipeline. Do not edit Matches files.
      const [bcciResponse, confirmedResponse, statsResponse, liveResponse] = await Promise.all([
        fetch("./bcci-fixtures.json?t=" + Date.now(), { cache: "no-store" }).catch(() => null),
        fetch("/matches/upcoming-fixtures-refresh.json?t=" + Date.now(), {
          cache: "no-store",
        }).catch(() => null),
        fetch("/matches/bcci-stats-fixtures.json?t=" + Date.now(), { cache: "no-store" }).catch(
          () => null,
        ),
        fetch("/matches/live/live-matches.json?t=" + Date.now(), { cache: "no-store" }).catch(
          () => null,
        ),
      ]);
      const bcciPayload = bcciResponse?.ok ? await bcciResponse.json().catch(() => null) : null;
      const confirmedPayload = confirmedResponse?.ok
        ? await confirmedResponse.json().catch(() => null)
        : null;
      const statsPayload = statsResponse?.ok ? await statsResponse.json().catch(() => null) : null;
      const livePayload = liveResponse?.ok ? await liveResponse.json().catch(() => null) : null;
      if (!bcciPayload) throw new Error("Could not load bcci-fixtures.json");
      if (bcciPayload.status && bcciPayload.status !== "ok")
        throw new Error(bcciPayload.error || "BCCI snapshot status: " + bcciPayload.status);

      const norm = (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
      const normalMatch = (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const liveMatches = Array.isArray(livePayload?.matches) ? livePayload.matches : [];
      const liveIds = new Set(
        liveMatches.map((m) => norm(m.id || m.matchId || m.match_id || m.gid)).filter(Boolean),
      );
      const livePairKeys = new Set(
        liveMatches
          .map((m) => {
            const a = norm(m.team1 || m.team1_name || m.team1Name || m.homeTeam);
            const b = norm(m.team2 || m.team2_name || m.team2Name || m.awayTeam);
            return [a, b].filter(Boolean).sort().join("|");
          })
          .filter(Boolean),
      );
      const statsFixtures =
        statsPayload?.status === "updated-from-bcci-stats" && Array.isArray(statsPayload.fixtures)
          ? statsPayload.fixtures
          : [];
      const newsFixtures =
        confirmedPayload?.status === "updated-from-news-and-bcci-json" &&
        Array.isArray(confirmedPayload.fixtures)
          ? confirmedPayload.fixtures.filter(
              (f) =>
                f &&
                f.tilakInSquad === true &&
                f.confirmationSource === "BCCI squad announcement naming Tilak Varma" &&
                String(f.newsUrl || "").startsWith("/News-details/index.html?id="),
            )
          : [];
      const exactBcciFixture = (newsFixture) => {
        const date = String(newsFixture.date || "");
        const match = normalMatch(newsFixture.match);
        const opponent = normalMatch(newsFixture.opponent);
        if (!date || !match || !opponent) return null;
        return (
          statsFixtures.find(
            (bcci) =>
              String(bcci.date || "") === date &&
              normalMatch(bcci.match) === match &&
              [normalMatch(bcci.team), normalMatch(bcci.opponent)].includes("india") &&
              [normalMatch(bcci.team), normalMatch(bcci.opponent)].includes(opponent) &&
              new Set([normalMatch(bcci.team), normalMatch(bcci.opponent)]).size === 2,
          ) || null
        );
      };

      // Only show fixtures confirmed by the existing Matches pipeline, then require an exact BCCI date/match/opponent join.
      const byKey = new Map();
      newsFixtures.forEach((newsFixture) => {
        const bcci = exactBcciFixture(newsFixture);
        if (!bcci) return;
        const ids = [
          bcci.matchId,
          bcci.match_id,
          bcci.gid,
          bcci.fixtureId,
          bcci.id,
          bcci.rawBcci?.match_id,
          bcci.rawBcci?.gid,
        ]
          .map(norm)
          .filter(Boolean);
        const pair = [norm("India"), norm(bcci.opponent || newsFixture.opponent)].sort().join("|");
        if (ids.some((id) => liveIds.has(id)) || livePairKeys.has(pair)) return;
        const date = String(bcci.date || "");
        const time = String(bcci.time || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        if (date < today) return;
        if (date === today && time) {
          const startTime = Date.parse(date + "T" + time + ":00+05:30");
          if (Number.isFinite(startTime) && startTime + 4 * 60 * 60 * 1000 <= Date.now()) return;
        }
        const key = [
          date,
          ...["India", bcci.opponent || newsFixture.opponent].map(normalMatch).sort(),
        ].join("|");
        if (!byKey.has(key)) {
          byKey.set(key, {
            home: bcci.team || "India",
            away: bcci.opponent || newsFixture.opponent,
            date,
            time: bcci.time || "",
            venue: bcci.venue || "",
            competition: bcci.source
              ? bcci.comp_name || bcci.competition || "BCCI Fixtures"
              : bcci.comp_name || "BCCI Fixtures",
            status: bcci.status || bcci.match_status || "forthcoming",
            id: bcci.matchId || bcci.match_id || bcci.gid || "",
            title: bcci.match || bcci.label || "",
            result: "",
            tilakConfirmed: true,
            newsUrl: newsFixture.newsUrl || "",
          });
        }
      });
      state.fixtures = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
      const rawData = bcciPayload.data ?? bcciPayload;
      const page = rawData.page ?? {};
      if ($("totalCount")) $("totalCount").textContent = state.fixtures.length;
      if ($("pageCount"))
        $("pageCount").textContent = page.last_page ?? statsPayload?.pagination?.last_page ?? 1;
      if ($("lastUpdated"))
        $("lastUpdated").textContent = bcciPayload.fetchedAt
          ? fmt(bcciPayload.fetchedAt)
          : statsPayload?.checkedAt
            ? fmt(statsPayload.checkedAt)
            : "Loaded";
      if ($("sourceStatus"))
        $("sourceStatus").textContent =
          "Squad confirmed · exact BCCI match · live/old fixtures excluded";
      const statuses = [...new Set(state.fixtures.map((f) => f.status).filter(Boolean))].sort();
      const filter = $("statusFilter");
      const old = filter.value;
      filter.innerHTML =
        '<option value="all">All statuses</option>' +
        statuses.map((s) => '<option value="' + esc(s) + '">' + esc(s) + "</option>").join("");
      if (statuses.includes(old)) filter.value = old;
      render();
      if (!state.fixtures.length) {
        $("fixtureList").hidden = false;
        $("fixtureList").innerHTML =
          '<div class="loading-state">No upcoming BCCI fixture currently matches the Matches folder’s Tilak Varma squad-confirmation rules. No unconfirmed matches are shown.</div>';
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

  // Poll the dedicated BCCI live snapshot. No periodic page refresh while idle.
  let liveMode = false;
  let liveRefreshTimer = null;
  async function checkLiveMode() {
    try {
      const response = await fetch("./bcci-live-scores.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Live snapshot unavailable");
      const payload = await response.json();
      const source = payload?.data ?? payload;
      const matches = Array.isArray(source?.live_scores)
        ? source.live_scores
        : Array.isArray(source?.matches)
          ? source.matches
          : [];
      const live = matches.filter((match) => {
        const status = [
          match.match_status,
          match.match_status_str,
          match.match_status_name,
          match.live_status_name,
          match.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .replace(/[_-]+/g, " ");
        return (
          /\b(live|in progress|in play|innings break|stumps|lunch|tea break|drinks|rain delay|match delayed)\b/.test(
            status,
          ) && !/complete|completed|finished|end of match|result/.test(status)
        );
      });
      const title = $("liveRefreshTitle");
      const message = $("liveRefreshMessage");
      const stateBadge = $("liveRefreshState");
      if (live.length) {
        if (!liveMode) {
          liveMode = true;
          if (message)
            message.textContent =
              live.length +
              " live match(es) detected. Fixture data will refresh while live play continues.";
          if (stateBadge) {
            stateBadge.textContent = "LIVE · AUTO";
            stateBadge.classList.add("is-live");
          }
          await load();
        } else if (message) {
          message.textContent =
            live.length +
            " live match(es) detected. Last checked " +
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
            ".";
        }
        if (liveRefreshTimer) clearInterval(liveRefreshTimer);
        liveRefreshTimer = setInterval(async () => {
          try {
            const again = await fetch("./bcci-live-scores.json?t=" + Date.now(), {
              cache: "no-store",
            });
            const data = await again.json();
            const root = data?.data ?? data;
            const items = Array.isArray(root?.live_scores) ? root.live_scores : [];
            const stillLive = items.some((match) => {
              const status = [
                match.match_status,
                match.match_status_str,
                match.match_status_name,
                match.live_status_name,
                match.status,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .replace(/[_-]+/g, " ");
              return (
                /\b(live|in progress|in play|innings break|stumps|lunch|tea break|drinks|rain delay|match delayed)\b/.test(
                  status,
                ) && !/complete|completed|finished|end of match|result/.test(status)
              );
            });
            if (stillLive) await load();
            else {
              liveMode = false;
              clearInterval(liveRefreshTimer);
              liveRefreshTimer = null;
              if (message) message.textContent = "No live match now. Automatic refresh has paused.";
              if (stateBadge) {
                stateBadge.textContent = "Standby";
                stateBadge.classList.remove("is-live");
              }
            }
          } catch (_) {
            /* Keep the last rendered state if the live snapshot temporarily fails. */
          }
        }, 60000);
      } else {
        if (liveMode && liveRefreshTimer) clearInterval(liveRefreshTimer);
        liveMode = false;
        liveRefreshTimer = null;
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
          "Live status is unavailable; automatic refresh remains paused.";
    }
  }
  load();
  checkLiveMode();
  setInterval(checkLiveMode, 60000);
})();
