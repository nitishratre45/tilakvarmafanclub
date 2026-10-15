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
      const [newsResponse, statsResponse, manualResponse] = await Promise.all([
        fetch("/matches/upcoming-fixtures-refresh.json?v=20261015-match-centre2", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/matches/bcci-stats-fixtures.json?v=20261015-match-centre2", {
          cache: "no-store",
        }).catch(() => null),
        fetch("/matches/manual-upcoming-fixtures.json?v=20261015-match-centre2", {
          cache: "no-store",
        }).catch(() => null),
      ]);
      const newsPayload =
        newsResponse && newsResponse.ok ? await newsResponse.json().catch(() => null) : null;
      const statsPayload =
        statsResponse && statsResponse.ok ? await statsResponse.json().catch(() => null) : null;
      const manualPayload =
        manualResponse && manualResponse.ok ? await manualResponse.json().catch(() => null) : null;
      const newsFixtures = Array.isArray(newsPayload?.fixtures)
        ? newsPayload.fixtures.map((f) => ({ ...f, team: f.team || "India", tilakInSquad: true }))
        : [];
      const statsFixtures = Array.isArray(statsPayload?.fixtures)
        ? statsPayload.fixtures.map((f) => ({ ...f, tilakInSquad: false }))
        : [];
      const fixtureKey = (f) => {
        const sides = [f.team, f.opponent]
          .map((v) =>
            String(v || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
          .sort();
        return [String(f.date || "").trim(), ...sides].join("|");
      };
      const byKey = new Map();
      [...statsFixtures, ...newsFixtures].forEach((f) => {
        const key = fixtureKey(f);
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, f);
          return;
        }
        // Prefer the squad-confirmed/news record, but fill its missing fields
        // (especially time) from another source when that source has a value.
        const preferred = f.tilakInSquad === true ? f : existing;
        const fallback = preferred === f ? existing : f;
        byKey.set(key, {
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
      const sourceKeys = new Set(fixtures.map(fixtureKey));
      manual.forEach((f) => {
        if (!f.overrideKey && !sourceKeys.has(fixtureKey(f))) fixtures.push(f);
      });
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
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
      }
      const note = $("upcoming-matches-updated");
      if (note) {
        const sources = [];
        if (newsFixtures.length) sources.push("squad-confirmed News JSON");
        if (statsFixtures.length) sources.push("Python-built BCCI Stats JSON");
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
