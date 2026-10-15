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
      const squadFixture = upcoming.find((fixture) => fixture.tilakInSquad === true || fixture.newsUrl);
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
              '<span class="upcoming-squad-badge">' + (fixture.tilakInSquad === true ? '✓ TILAK IN SQUAD' : 'BCCI FIXTURE') + '</span></div>' +
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
              esc(fixture.newsUrl || "/news/") +
              '">Match Details ↗</a></div></article>',
          )
          .join("")
      : '<p class="activity-empty">No upcoming fixtures are currently listed for a squad that includes Tilak Varma.</p>';
    const updated = document.getElementById("upcoming-matches-updated");
    if (updated)
      updated.textContent =
        "Upcoming fixtures · News JSON pipeline with admin-managed corrections.";
  }
  renderFixtures(fixtures);
  // Load the latest verified News JSON report, then overlay admin corrections without changing scorecards.
  const bcciFixturesUrl = "https://stats.bcci.tv/match/fixtures/?comp_gid=65d2b784-4a75-41ca-8415-a345042030d6&comp_gid=34154bc1-ebbf-4109-ba78-67cf9cf7aafa&comp_gid=6a64053e-55fc-47ed-9cae-4c58e9b0e551&comp_gid=9a12946b-9277-4b5f-ba94-34d02355bf03&comp_gid=2c9a58d0-365c-4301-839e-b1d2a0803b2b&comp_gid=04d7f468-3b06-4dcc-88de-594afd83c561&comp_gid=52f44249-0afd-41aa-bb88-c6e7778a4f0d&comp_gid=97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2&comp_gid=5cd3ede8-16d7-4914-9d4c-2eb59671fe50&comp_gid=39a2078a-2e87-4f90-86eb-53696579466c&comp_gid=7ca2538b-b8e8-4221-b76f-4705cb75af1f&comp_gid=ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc&comp_gid=13de0d47-83d7-4351-8e6a-57d28a18be48&comp_gid=1cf7ed18-0c14-452c-840b-447aeb5dd020&comp_gid=96f00b0b-c06b-4764-bbc3-7ed388abb24b&comp_gid=dd82f86a-6aa4-477c-b0de-2706a677d0d2&min_start_date=2026-01-01&team_gid=71790c66-0e3c-4d0b-96a5-e04526040f94&team_gid=cf9ec6b2-8d90-41a9-a834-f2f120b37811&team_gid=83151b98-bbed-42ba-b397-944059ef5830&team_gid=0f99bbe0-3198-4f82-8520-e18a9e24545f&team_gid=f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8&team_gid=4eb0e97b-6e43-47f3-8e46-bedf6de77cea&team_gid=611a0e16-280f-4fe2-98e8-366ba9719962&team_gid=01d41b53-68f6-48f8-a8d0-c9ec2f338749&team_gid=eb81d735-6436-4dac-9a7a-15a7a347d5e6&team_gid=08dc4ba8-22a1-4e5a-9862-20f8a8643f99&page=1&size=12";
  const flattenBcciFixtures = (payload) => {
    const rows = [];
    const seen = new Set();
    const walk = (value) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (!value || typeof value !== "object") return;
      const dateRaw = value.start_date || value.startDate || value.match_date || value.matchDate || value.match_start_date || value.matchStartDate || value.date || value.start_time || value.startTime || value.start_datetime || value.startDateTime;
      const home = value.team_a_name || value.teamAName || value.home_team_name || value.homeTeamName || value.team1_name || value.team1Name || value.local_team_name || value.localTeamName || value.team_a || value.home_team || value.homeTeam || value.team1;
      const away = value.team_b_name || value.teamBName || value.away_team_name || value.awayTeamName || value.team2_name || value.team2Name || value.visitor_team_name || value.visitorTeamName || value.team_b || value.away_team || value.awayTeam || value.team2;
      const matchName = value.match_name || value.matchName || value.match_number || value.matchNumber || value.match || value.match_type || value.matchType || value.round_name || value.roundName || value.name;
      const venueRaw = value.venue_name || value.venueName || value.venue || value.ground_name || value.groundName || value.location;
      const dateText = typeof dateRaw === "string" || typeof dateRaw === "number" ? String(dateRaw) : "";
      const teamName = (team) => typeof team === "string" ? team : team && (team.name || team.team_name || team.teamName || team.short_name || team.shortName || team.display_name || team.displayName) || "";
      const homeName = teamName(home);
      const awayName = teamName(away);
      const dateMatch = dateText.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
      if (dateMatch && homeName && awayName && homeName !== awayName) {
        const date = dateMatch[1] + "-" + dateMatch[2].padStart(2, "0") + "-" + dateMatch[3].padStart(2, "0");
        const key = [date, homeName, awayName, String(matchName || "")].join("|").toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          const d = new Date(date + "T00:00:00");
          const timeMatch = dateText.match(/T(\d{2}:\d{2})/);
          rows.push({
            date,
            label: Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
            match: String(matchName || value.format || value.match_format || value.matchFormat || "Match"),
            opponent: awayName,
            team: homeName,
            venue: typeof venueRaw === "string" ? venueRaw : venueRaw && (venueRaw.name || venueRaw.venue_name || venueRaw.venueName) || "Venue TBC",
            time: timeMatch ? timeMatch[1] : String(value.start_time_ist || value.startTimeIST || value.time || ""),
            source: bcciFixturesUrl,
            newsUrl: value.match_url || value.matchUrl || value.url || bcciFixturesUrl,
            tilakInSquad: false
          });
        }
      }
      Object.values(value).forEach(walk);
    };
    walk(payload);
    return rows;
  };
  Promise.all([
    fetch(bcciFixturesUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => flattenBcciFixtures(payload))
      .catch(() => []),
    fetch("/matches/upcoming-fixtures-refresh.json?v=admin-fixtures2", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch("/matches/manual-upcoming-fixtures.json?v=admin-fixtures1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]).then(([bcciFixtures, report, manualData]) => {
    const newsFixtures = report && Array.isArray(report.fixtures) && report.fixtures.length
      ? report.fixtures.map((fixture) => ({ ...fixture, team: "India", tilakInSquad: true }))
      : fixtures.map((fixture) => ({ ...fixture, team: "India", tilakInSquad: true }));
    const sourceFixtures = [...newsFixtures, ...(Array.isArray(bcciFixtures) ? bcciFixtures : [])];
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
  });
})();
