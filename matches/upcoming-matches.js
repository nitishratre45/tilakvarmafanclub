/* Official fixtures for series where Tilak Varma is in India's announced squad.
   Finished matches disappear after the scheduled match window (start + 4 hours). */
(function () {
  "use strict";
  const host = document.getElementById("upcoming-matches-list");
  if (!host) return;
  const esc = (value) =>
    String(value ?? "").replace(
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
  // Automatic PNG logos: honor image URLs from JSON first, then resolve known teams.
  const teamAssets = {
    india: { flag: "in" },
    "west indies": { flag: "wi" },
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
    const value = supplied || "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return "https://img1.hscicdn.com" + value;
    const asset = teamAssets[normaliseTeam(name)] || {};
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
      '<span class="upcoming-team-logo">' +
      '<img src="' +
      esc(src) +
      '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'logo-unavailable\');" />' +
      '<span class="upcoming-team-logo-initials" aria-hidden="true">' +
      esc(teamInitials(label)) +
      "</span></span>"
    );
  };
  const fixtures = [
    {
      date: "2026-10-14",
      label: "Wed, 14 Oct 2026",
      match: "4th T20I",
      opponent: "West Indies",
      venue: "Hyderabad",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/indias-squad-for-home-series-against-west-indies-and-roi-squad-for-irani-cup-announced",
      newsUrl:
        "/News-details/index.html?id=indias-squad-for-home-series-against-west-indies-and-roi-squad-for-irani-cup-announced",
    },
    {
      date: "2026-10-17",
      label: "Sat, 17 Oct 2026",
      match: "5th T20I",
      opponent: "West Indies",
      venue: "Bengaluru",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/indias-squad-for-home-series-against-west-indies-and-roi-squad-for-irani-cup-announced",
      newsUrl:
        "/News-details/index.html?id=indias-squad-for-home-series-against-west-indies-and-roi-squad-for-irani-cup-announced",
    },
    {
      date: "2026-10-22",
      label: "Thu, 22 Oct 2026",
      match: "1st T20I",
      opponent: "New Zealand",
      venue: "Christchurch",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
      newsUrl:
        "/News-details/index.html?id=india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-10-24",
      label: "Sat, 24 Oct 2026",
      match: "2nd T20I",
      opponent: "New Zealand",
      venue: "Christchurch",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
      newsUrl:
        "/News-details/index.html?id=india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-10-27",
      label: "Tue, 27 Oct 2026",
      match: "3rd T20I",
      opponent: "New Zealand",
      venue: "Wellington",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
      newsUrl:
        "/News-details/index.html?id=india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-10-30",
      label: "Fri, 30 Oct 2026",
      match: "4th T20I",
      opponent: "New Zealand",
      venue: "Auckland",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
      newsUrl:
        "/News-details/index.html?id=india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-11-01",
      label: "Sun, 1 Nov 2026",
      match: "5th T20I",
      opponent: "New Zealand",
      venue: "Hamilton",
      time: "",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
      newsUrl:
        "/News-details/index.html?id=india-and-india-a-squads-for-new-zealand-tour-announced",
    },
  ];
  function renderFixtures(inputFixtures) {
    const now = Date.now();
    const upcoming = inputFixtures.filter((fixture) => {
      const hasTime = Boolean(String(fixture.time || "").trim());
      // If the official source does not publish a start time, keep the fixture
      // visible for its scheduled date instead of hiding it as an invalid date.
      const start = Date.parse(
        fixture.date + (hasTime ? "T" + fixture.time + ":00+05:30" : "T00:00:00+05:30"),
      );
      const visibilityWindow = (hasTime ? 4 : 24) * 60 * 60 * 1000;
      return Number.isFinite(start) && now < start + visibilityWindow;
    });
    const announcementLink = document.getElementById("upcoming-team-announcement-link");
    if (announcementLink) {
      const squadFixture = upcoming.find(
        (fixture) => fixture.tilakInSquad === true || fixture.newsUrl,
      );
      if (squadFixture) announcementLink.href = squadFixture.newsUrl || "/news/";
    }
    host.innerHTML = upcoming.length
      ? upcoming
          .map(
            (fixture) =>
              '<article class="upcoming-match-card">' +
              '<div class="upcoming-match-topline"><span class="upcoming-match-date">' +
              esc(fixture.label || fixture.date) +
              "</span>" +
              '<span class="upcoming-squad-badge">' +
              (fixture.tilakInSquad === true ? "✓ TILAK IN SQUAD" : "BCCI FIXTURE") +
              "</span></div>" +
              '<div class="upcoming-match-teams"><div class="upcoming-team-side">' +
              renderTeamLogo(
                fixture.team || "India",
                fixture.teamLogo ||
                  fixture.teamImageUrl ||
                  fixture.team?.imageUrl ||
                  fixture.team?.image?.url,
              ) +
              "<span>" +
              esc(fixture.team || "India") +
              '</span></div><span class="versus">VS</span><div class="upcoming-team-side">' +
              renderTeamLogo(
                fixture.opponent,
                fixture.opponentLogo ||
                  fixture.opponentImageUrl ||
                  fixture.opponent?.imageUrl ||
                  fixture.opponent?.image?.url,
              ) +
              "<span>" +
              esc(fixture.opponent) +
              "</span></div></div>" +
              '<div class="upcoming-match-meta"><span>' +
              esc(fixture.match) +
              "</span><span>⌖ " +
              esc(fixture.venue) +
              "</span>" +
              (fixture.time ? "<span>" + esc(fixture.time) + " IST</span>" : "") +
              "</div>" +
              '<div class="upcoming-match-link"><a href="' +
              esc(
                "/matches/details/?date=" +
                  encodeURIComponent(fixture.date || "") +
                  "&match=" +
                  encodeURIComponent(fixture.match || "") +
                  "&opponent=" +
                  encodeURIComponent(fixture.opponent || "") +
                  ((fixture.matchId || fixture.match_id || fixture.gid || fixture.rawBcci?.match_id || fixture.rawBcci?.gid)
                    ? "&matchId=" +
                      encodeURIComponent(
                        fixture.matchId ||
                          fixture.match_id ||
                          fixture.gid ||
                          fixture.rawBcci?.match_id ||
                          fixture.rawBcci?.gid,
                      )
                    : ""),
              ) +
              '">Full Match Details ↗</a>' +
              (fixture.newsUrl
                ? ' <a class="upcoming-match-source" href="' + esc(fixture.newsUrl) + '" target="_blank" rel="noopener noreferrer">Source ↗</a>'
                : "") +
              "</div></article>",
          )
          .join("")
      : '<p class="activity-empty">No upcoming fixtures are currently listed for a squad that includes Tilak Varma.</p>';
    const updated = document.getElementById("upcoming-matches-updated");
    if (updated)
      updated.textContent =
        "Upcoming fixtures · News JSON pipeline with admin-managed corrections.";
  }
  renderFixtures(fixtures);
  // Load Python-normalized BCCI Stats JSON from this site; browser never calls the external API.
  Promise.all([
    fetch("/matches/bcci-stats-fixtures.json?v=bcci-stats-json1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => (payload && Array.isArray(payload.fixtures) ? payload.fixtures : []))
      .catch(() => []),
    fetch("/matches/upcoming-fixtures-refresh.json?v=admin-fixtures2", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch("/matches/manual-upcoming-fixtures.json?v=admin-fixtures1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]).then(([bcciFixtures, report, manualData]) => {
    const newsFixtures =
      report && Array.isArray(report.fixtures) && report.fixtures.length
        ? report.fixtures.map((fixture) => ({ ...fixture, team: "India", tilakInSquad: true }))
        : fixtures.map((fixture) => ({ ...fixture, team: "India", tilakInSquad: true }));
    const combinedFixtures = [
      ...newsFixtures,
      ...(Array.isArray(bcciFixtures)
        ? bcciFixtures.map((fixture) => ({ ...fixture, tilakInSquad: false }))
        : []),
    ];
    const uniqueSourceFixtures = new Map();
    combinedFixtures.forEach((fixture) => {
      const key =
        String(fixture.date || "") +
        "|" +
        String(fixture.match || "")
          .trim()
          .toLowerCase() +
        "|" +
        String(fixture.opponent || "")
          .trim()
          .toLowerCase();
      const current = uniqueSourceFixtures.get(key);
      // Prefer squad-confirmed BCCI News records for duplicates.
      if (!current || fixture.tilakInSquad === true) uniqueSourceFixtures.set(key, fixture);
    });
    const sourceFixtures = [...uniqueSourceFixtures.values()];
    const manual = Array.isArray(manualData?.fixtures) ? manualData.fixtures : [];
    const key = (f) =>
      String(f.date || "") +
      "|" +
      String(f.match || "")
        .trim()
        .toLowerCase() +
      "|" +
      String(f.opponent || "")
        .trim()
        .toLowerCase();
    const sourceKey = (f) =>
      String(f.date || "") +
      "|" +
      String(f.match || "")
        .trim()
        .toLowerCase();
    const overrides = new Map(manual.filter((f) => f.overrideKey).map((f) => [f.overrideKey, f]));
    const exact = new Map(manual.filter((f) => !f.overrideKey).map((f) => [key(f), f]));
    const merged = sourceFixtures.map((f) => ({
      ...f,
      ...(overrides.get(sourceKey(f)) || exact.get(key(f)) || {}),
    }));
    const sourceKeys = new Set(sourceFixtures.map(key));
    manual.forEach((f) => {
      if (!f.overrideKey && !sourceKeys.has(key(f))) merged.push(f);
    });
    merged.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    renderFixtures(merged);
    const updated = document.getElementById("upcoming-matches-updated");
    if (updated)
      updated.textContent =
        "Upcoming fixtures · Python-built BCCI Stats JSON + squad announcements + admin corrections.";
  });
})();
