/* BCCI-confirmed upcoming fixtures where Tilak Varma is in the announced squad. */
(function () {
  "use strict";
  const host = document.getElementById("upcoming-matches-list");
  if (!host) return;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const source = "https://www.bcci.tv/news/article/india-and-india-a-squads-for-new-zealand-tour-announced";
  const fixtures = [
    { date: "2026-10-22", label: "Thu, 22 Oct 2026", match: "1st T20I", opponent: "New Zealand", venue: "Christchurch" },
    { date: "2026-10-24", label: "Sat, 24 Oct 2026", match: "2nd T20I", opponent: "New Zealand", venue: "Christchurch" },
    { date: "2026-10-27", label: "Tue, 27 Oct 2026", match: "3rd T20I", opponent: "New Zealand", venue: "Wellington" },
    { date: "2026-10-30", label: "Fri, 30 Oct 2026", match: "4th T20I", opponent: "New Zealand", venue: "Auckland" },
    { date: "2026-11-01", label: "Sun, 1 Nov 2026", match: "5th T20I", opponent: "New Zealand", venue: "Hamilton" }
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = fixtures.filter((fixture) => {
    const date = new Date(fixture.date + "T00:00:00");
    return date >= today;
  });
  host.innerHTML = upcoming.length ? upcoming.map((fixture) =>
    '<article class="upcoming-match-card">' +
      '<div class="upcoming-match-topline"><span class="upcoming-match-date">' + esc(fixture.label) + '</span>' +
      '<span class="upcoming-squad-badge">✓ TILAK IN SQUAD</span></div>' +
      '<div class="upcoming-match-teams"><span>India</span><span class="versus">VS</span><span>' + esc(fixture.opponent) + '</span></div>' +
      '<div class="upcoming-match-meta"><span>' + esc(fixture.match) + '</span><span>⌖ ' + esc(fixture.venue) + '</span></div>' +
    '</article>'
  ).join("") : '<p class="activity-empty">No upcoming fixtures are currently listed for a squad that includes Tilak Varma. This list only shows fixtures from a confirmed squad announcement.</p>';
  const updated = document.getElementById("upcoming-matches-updated");
  if (updated) updated.innerHTML = 'Squad and fixtures verified from <a href="' + source + '" target="_blank" rel="noopener noreferrer">BCCI’s official announcement ↗</a>. Past fixtures hide automatically.';
})();
