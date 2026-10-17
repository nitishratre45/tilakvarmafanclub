/* Upcoming fixtures module; Complete Match lives in /matches/complete/. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  // Automatic team PNG logos: prefer image URLs supplied by JSON, then known team assets.
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
  const normaliseTeam = (name) =>
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const teamInitials = (name) => {
    const parts = String(name || "?")
      .replace(/[^a-z0-9 ]/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (
      parts.length > 1 ? parts.slice(0, 2).map((part) => part[0]) : [(parts[0] || "?").slice(0, 2)]
    )
      .join("")
      .toUpperCase();
  };
  const teamLogoUrl = (name, supplied) => {
    if (typeof supplied === "string" && supplied) {
      if (/^https?:\/\//i.test(supplied)) return supplied;
      if (supplied.startsWith("/")) return "https://img1.hscicdn.com" + supplied;
    }
    const asset = teamAssets[normaliseTeam(name)] || {};
    if (asset.logo) return asset.logo;
    if (asset.ipl) return "https://scores.iplt20.com/ipl/teamlogos/" + asset.ipl + ".png";
    if (asset.flag) return "https://flagcdn.com/w80/" + asset.flag + ".png";
    return "";
  };
  const renderTeamLogo = (name, supplied) => {
    const label = String(name || "Team");
    const src = teamLogoUrl(label, supplied);
    const fallback =
      '<span class="upcoming-team-logo-fallback" aria-hidden="true">' +
      esc(teamInitials(label)) +
      "</span>";
    if (!src) return fallback;
    return (
      '<span class="upcoming-team-logo"><img src="' +
      esc(src) +
      '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'logo-unavailable\');" /><span class="upcoming-team-logo-initials" aria-hidden="true">' +
      esc(teamInitials(label)) +
      "</span></span>"
    );
  };
  const dateLabel = (v) => {
    if (!v) return "Date unavailable";
    const d = new Date(v + "T12:00:00Z");
    return Number.isNaN(d.getTime())
      ? v
      : d.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  };
  async function loadUpcoming() {
    const host = $("upcoming-matches-list");
    try {
      // Keep the existing squad-confirmed snapshot and merge the Python-built BCCI Stats JSON.
      // The browser never calls the external BCCI API directly.
      const [newsResponse, statsResponse, manualResponse, liveResponse] = await Promise.all([
        fetch("/matches/upcoming-fixtures-refresh.json?v=20261015-auto-live1", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/matches/bcci-stats-fixtures.json?v=20261015-auto-live1", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/matches/manual-upcoming-fixtures.json?v=20261015-auto-live1", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/matches/live/live-matches.json?v=20261015-auto-live1", {
          cache: "no-store",
        }).catch(() => null),
      ]);
      const newsPayload =
        newsResponse && newsResponse.ok ? await newsResponse.json().catch(() => null) : null;
      const statsPayload =
        statsResponse && statsResponse.ok ? await statsResponse.json().catch(() => null) : null;
      const manualPayload =
        manualResponse && manualResponse.ok ? await manualResponse.json().catch(() => null) : null;
      const livePayload =
        liveResponse && liveResponse.ok ? await liveResponse.json().catch(() => null) : null;
      const liveMatches = Array.isArray(livePayload?.matches) ? livePayload.matches : [];
      const norm = (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ");
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
      // A fixture may appear in Upcoming only when the News/BCCI pipeline has
      // confirmed Tilak Varma in the announced squad. BCCI Stats supplies the
      // canonical schedule, and the join must match date + match label + teams.
      const normalMatch = (value) =>
        String(value || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const statsFixtures =
        statsPayload?.status === "updated-from-bcci-stats" && Array.isArray(statsPayload.fixtures)
          ? statsPayload.fixtures
          : [];
      const newsFixtures =
        newsPayload?.status === "updated-from-news-and-bcci-json" &&
        Array.isArray(newsPayload.fixtures)
          ? newsPayload.fixtures.filter(
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
          statsFixtures.find((bcci) => {
            if (String(bcci.date || "") !== date) return false;
            if (normalMatch(bcci.match) !== match) return false;
            const sides = [normalMatch(bcci.team), normalMatch(bcci.opponent)];
            return sides.includes("india") && sides.includes(opponent) && new Set(sides).size === 2;
          }) || null
        );
      };
      const confirmedFixtures = newsFixtures
        .map((newsFixture) => {
          const bcci = exactBcciFixture(newsFixture);
          if (!bcci) return null; // Never guess or show a similar-looking match.
          return {
            ...newsFixture,
            ...bcci,
            team: "India",
            opponent:
              [bcci.team, bcci.opponent].find((name) => normalMatch(name) !== "india") ||
              newsFixture.opponent,
            date: bcci.date,
            label: bcci.label || newsFixture.label,
            match: bcci.match || newsFixture.match,
            venue: bcci.venue || "",
            time: bcci.time || "",
            source: bcci.source || "",
            newsUrl: newsFixture.newsUrl || "",
            squadSource: newsFixture.squadSource || newsFixture.source || "",
            tilakInSquad: true,
            confirmationSource: "BCCI squad announcement naming Tilak Varma",
          };
        })
        .filter(Boolean);
      const fixtureKey = (f) => {
        const sides = [f.team, f.opponent]
          .map((v) => normalMatch(v))
          .filter(Boolean)
          .sort();
        return [String(f.date || "").trim(), ...sides].join("|");
      };
      const byKey = new Map();
      confirmedFixtures.forEach((f) => {
        const key = fixtureKey(f);
        if (!byKey.has(key)) byKey.set(key, f);
      });
      let fixtures = [...byKey.values()];
      const manual = Array.isArray(manualPayload?.fixtures) ? manualPayload.fixtures : [];
      const manualFixtureKey = (f) =>
        [f.date, f.match, f.opponent]
          .map((v) =>
            String(v || "")
              .trim()
              .toLowerCase(),
          )
          .join("|");
      const sourceKey = (f) =>
        [f.date, f.match]
          .map((v) =>
            String(v || "")
              .trim()
              .toLowerCase(),
          )
          .join("|");
      const overrides = new Map(manual.filter((f) => f.overrideKey).map((f) => [f.overrideKey, f]));
      const exact = new Map(
        manual.filter((f) => !f.overrideKey).map((f) => [manualFixtureKey(f), f]),
      );
      fixtures = fixtures.map((f) => ({
        ...f,
        ...(overrides.get(sourceKey(f)) || exact.get(manualFixtureKey(f)) || {}),
      }));
      // Manual records may annotate an exact verified fixture, but cannot add a
      // new Upcoming card without the News + exact BCCI fixture join above.
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      // Once the official live snapshot marks a fixture live, remove it from Upcoming.
      // Match by official ID first, then by both team names so feeds with different ID
      // formats still transition correctly. The live page remains the single source of live cards.
      fixtures = fixtures.filter((f) => {
        const ids = [
          f.matchId,
          f.match_id,
          f.gid,
          f.fixtureId,
          f.id,
          f.rawBcci?.match_id,
          f.rawBcci?.gid,
        ]
          .map(norm)
          .filter(Boolean);
        const pair = [norm(f.team || "India"), norm(f.opponent)].filter(Boolean).sort().join("|");
        return !ids.some((id) => liveIds.has(id)) && !(pair && livePairKeys.has(pair));
      });
      fixtures = fixtures
        .filter((f) => {
          const date = String(f.date || "");
          const time = String(f.time || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
          if (!time) return date >= today;
          const start = Date.parse(date + "T" + time + ":00+05:30");
          return Number.isFinite(start) && start + 4 * 60 * 60 * 1000 > Date.now();
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (!fixtures.length) {
        host.innerHTML =
          '<div class="match-empty"><strong>No upcoming fixtures found</strong><span>Saved fixture JSON update hote hi yahan dikhega.</span></div>';
      } else {
        host.innerHTML = fixtures
          .map((f) => {
            const officialId = String(
              f.matchId ||
                f.match_id ||
                f.gid ||
                f.fixtureId ||
                f.id ||
                f.rawBcci?.match_id ||
                f.rawBcci?.gid ||
                "",
            ).trim();
            const detailUrl =
              "/matches/details/?date=" +
              encodeURIComponent(f.date || "") +
              "&match=" +
              encodeURIComponent(f.match || "") +
              "&opponent=" +
              encodeURIComponent(f.opponent || "") +
              (officialId ? "&matchId=" + encodeURIComponent(officialId) : "");
            return (
              '<article class="upcoming-match-card"><div class="upcoming-match-topline"><span class="upcoming-match-date">' +
              esc(f.label || dateLabel(f.date)) +
              '</span><span class="match-live-tag">' +
              (f.tilakInSquad === true ? "TILAK IN SQUAD" : "BCCI FIXTURE") +
              '</span></div><div class="upcoming-match-teams"><div class="upcoming-team-side">' +
              renderTeamLogo(
                f.team || "India",
                f.teamLogo || f.teamImageUrl || f.team?.imageUrl || f.team?.image?.url,
              ) +
              "<span>" +
              esc(f.team || "India") +
              '</span></div><span class="versus">VS</span><div class="upcoming-team-side">' +
              renderTeamLogo(
                f.opponent || "Opponent TBA",
                f.opponentLogo ||
                  f.opponentImageUrl ||
                  f.opponent?.imageUrl ||
                  f.opponent?.image?.url,
              ) +
              "<span>" +
              esc(f.opponent || "Opponent TBA") +
              '</span></div></div><div class="upcoming-match-meta"><span>' +
              esc(f.match || "International match") +
              "</span><span>⌖ " +
              esc(f.venue || "Venue TBA") +
              "</span><span>" +
              (f.time ? esc(f.time) + " IST" : "Time not announced") +
              '</span></div><div class="upcoming-match-actions"><a class="match-details-link" href="' +
              esc(detailUrl) +
              '">Full Match Details <span aria-hidden="true">↗</span></a></div></article>'
            );
          })
          .join("");
        const next = fixtures[0];
        const tm = String(next.time || "00:00").match(/^(\\d{1,2}):(\\d{2})/);
        const target = Date.parse(String(next.date) + "T" + (tm ? tm[1].padStart(2, "0") + ":" + tm[2] : "00:00") + ":00+05:30");
        if (Number.isFinite(target)) {
          const banner = document.createElement("section");
          banner.className = "match-countdown-hero";
          banner.innerHTML = '<div class="match-countdown-teams"><div class="match-countdown-side"><span>' + esc(next.team || "India") + '</span>' + renderTeamLogo(next.team || "India", next.teamLogo || next.teamImageUrl) + '</div><div class="match-countdown-clock" role="timer"><div><strong data-h>00</strong><small>HRS</small></div><div><strong data-m>00</strong><small>MINS</small></div><div><strong data-s>00</strong><small>SECS</small></div></div><div class="match-countdown-side"><span>' + esc(next.opponent || "Opponent TBA") + '</span>' + renderTeamLogo(next.opponent || "Opponent", next.opponentLogo || next.opponentImageUrl) + '</div></div><p class="match-countdown-match">' + esc(next.match || "Upcoming match") + " · " + esc(next.label || dateLabel(next.date)) + (next.time ? ", " + esc(next.time) + " IST" : "") + '</p><p class="match-countdown-venue">' + esc(next.venue || "Venue to be announced") + '</p>';
          host.prepend(banner);
          const tick = () => {
            const left = Math.max(0, target - Date.now());
            banner.querySelector("[data-h]").textContent = String(Math.floor(left / 3600000)).padStart(2, "0");
            banner.querySelector("[data-m]").textContent = String(Math.floor((left % 3600000) / 60000)).padStart(2, "0");
            banner.querySelector("[data-s]").textContent = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
            if (left === 0) banner.classList.add("is-started");
          };
          tick(); window.setInterval(tick, 1000);
        }
      }
      const note = $("upcoming-matches-updated");
      if (note) {
        const sources = [];
        if (newsFixtures.length) sources.push("Tilak squad confirmation from News JSON");
        if (confirmedFixtures.length) sources.push("exact BCCI Stats fixture match");
        note.textContent =
          "Upcoming fixtures · " +
          (sources.join(" + ") || "saved fixture snapshots") +
          " · checked " +
          new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) +
          ".";
      }
      const announcement = $("upcoming-team-announcement-link");
      const squadFixture = fixtures.find((f) => f.tilakInSquad === true && f.newsUrl);
      if (announcement && squadFixture) announcement.href = squadFixture.newsUrl;
    } catch (error) {
      host.innerHTML =
        '<div class="match-empty"><strong>Upcoming fixtures could not load</strong><span>Saved fixture JSON snapshots dobara try karein.</span></div>';
      console.error("Match Centre upcoming fixtures:", error);
    }
  }
  loadUpcoming();
})();
