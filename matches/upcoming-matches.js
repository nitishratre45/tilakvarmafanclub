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
  const fixtures = [
    {
      date: "2026-10-22",
      label: "Thu, 22 Oct 2026",
      match: "1st T20I",
      opponent: "New Zealand",
      venue: "Christchurch",
      time: "19:00",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-10-24",
      label: "Sat, 24 Oct 2026",
      match: "2nd T20I",
      opponent: "New Zealand",
      venue: "Christchurch",
      time: "19:00",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-10-27",
      label: "Tue, 27 Oct 2026",
      match: "3rd T20I",
      opponent: "New Zealand",
      venue: "Wellington",
      time: "19:00",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-10-30",
      label: "Fri, 30 Oct 2026",
      match: "4th T20I",
      opponent: "New Zealand",
      venue: "Auckland",
      time: "19:00",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
    },
    {
      date: "2026-11-01",
      label: "Sun, 1 Nov 2026",
      match: "5th T20I",
      opponent: "New Zealand",
      venue: "Hamilton",
      time: "19:00",
      source:
        "https://www.bcci.tv/webview/news/article/india-and-india-a-squads-for-new-zealand-tour-announced",
    },
  ];
  const now = Date.now();
  const upcoming = fixtures.filter((fixture) => {
    // Match time is India Standard Time. Hide the fixture once its scheduled
    // four-hour match window has elapsed; past fixtures never remain listed.
    const start = Date.parse(fixture.date + "T" + fixture.time + ":00+05:30");
    return Number.isFinite(start) && now < start + 4 * 60 * 60 * 1000;
  });
  host.innerHTML = upcoming.length
    ? upcoming
        .map(
          (fixture) =>
            '<article class="upcoming-match-card">' +
            '<div class="upcoming-match-topline"><span class="upcoming-match-date">' +
            esc(fixture.label) +
            "</span>" +
            '<span class="upcoming-squad-badge">✓ TILAK IN SQUAD</span></div>' +
            '<div class="upcoming-match-teams"><span>India</span><span class="versus">VS</span><span>' +
            esc(fixture.opponent) +
            "</span></div>" +
            '<div class="upcoming-match-meta"><span>' +
            esc(fixture.match) +
            "</span><span>⌖ " +
            esc(fixture.venue) +
            "</span></div>" +
            '<div class="upcoming-match-link"><a href="' +
            esc(fixture.source) +
            '" target="_blank" rel="noopener noreferrer">Official match details ↗</a></div>' +
            "</article>",
        )
        .join("")
    : '<p class="activity-empty">No upcoming fixtures are currently listed for a squad that includes Tilak Varma.</p>';
  const updated = document.getElementById("upcoming-matches-updated");
  if (updated)
    updated.textContent =
      "India vs West Indies and New Zealand fixtures · official BCCI match pages. Finished fixtures auto-hide after the scheduled match window.";
})();
