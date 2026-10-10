/* Match Center: fixtures from the BCCI Stats JSON shared by the site owner. */
(function () {
  "use strict";
  const host = document.getElementById("match-center-grid");
  if (!host) return;
  const fixtures = [
    {
      date: "2026-10-11",
      time: "09:00",
      title: "3rd One-Day Match",
      team1: "India A",
      team2: "Australia A",
      format: "List A",
      venue: "Cricket Association Puducherry Siechem Stadium, Puducherry",
      series: "Australia A in India",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-11",
      time: "19:00",
      title: "3rd T20I",
      team1: "India",
      team2: "West Indies",
      format: "T20I",
      venue: "Holkar Stadium, Indore",
      series: "India v West Indies T20I Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/ab23950b-c1ef-4feb-84ca-5d89f460492d/scorecard",
      detailsUrl:
        "https://www.bcci.tv/matches/ab23950b-c1ef-4feb-84ca-5d89f460492d/india-vs-west-indies/match-details",
    },
    {
      date: "2026-10-14",
      time: "19:00",
      title: "4th T20I",
      team1: "India",
      team2: "West Indies",
      format: "T20I",
      venue: "Rajiv Gandhi International Stadium, Hyderabad",
      series: "India v West Indies T20I Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-16",
      time: "19:00",
      title: "1st T20I",
      team1: "India Women",
      team2: "Zimbabwe Women",
      format: "T20I",
      venue: "Shaheed Veer Narayan Singh International Stadium, Raipur",
      series: "India Women v Zimbabwe Women T20 Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-17",
      time: "19:00",
      title: "5th T20I",
      team1: "India",
      team2: "West Indies",
      format: "T20I",
      venue: "M. Chinnaswamy Stadium, Bengaluru",
      series: "India v West Indies T20I Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-18",
      time: "19:00",
      title: "2nd T20I",
      team1: "India Women",
      team2: "Zimbabwe Women",
      format: "T20I",
      venue: "Shaheed Veer Narayan Singh International Stadium, Raipur",
      series: "India Women v Zimbabwe Women T20 Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-20",
      time: "19:00",
      title: "3rd T20I",
      team1: "India Women",
      team2: "Zimbabwe Women",
      format: "T20I",
      venue: "Shaheed Veer Narayan Singh International Stadium, Raipur",
      series: "India Women v Zimbabwe Women T20 Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-22",
      time: "20:00",
      title: "1st T20I",
      team1: "New Zealand",
      team2: "India",
      format: "T20I",
      venue: "Hagley Oval, Christchurch",
      series: "New Zealand v India T20 Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-23",
      time: "14:00",
      title: "1st ODI",
      team1: "India Women",
      team2: "Zimbabwe Women",
      format: "ODI",
      venue: "BCA Stadium, Vadodara",
      series: "India Women v Zimbabwe Women ODI Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-24",
      time: "10:30",
      title: "1st Four-Day Match",
      team1: "New Zealand A",
      team2: "India A",
      format: "FC",
      venue: "Bert Sutcliffe Oval, Lincoln University",
      series: "New Zealand A v India A Four-Day Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-24",
      time: "20:00",
      title: "2nd T20I",
      team1: "New Zealand",
      team2: "India",
      format: "T20I",
      venue: "Hagley Oval, Christchurch",
      series: "New Zealand v India T20 Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
    {
      date: "2026-10-25",
      time: "14:00",
      title: "2nd ODI",
      team1: "India Women",
      team2: "Zimbabwe Women",
      format: "ODI",
      venue: "BCA Stadium, Vadodara",
      series: "India Women v Zimbabwe Women ODI Series 2026",
      status: "Forthcoming",
      url: "https://stats.bcci.tv/match/fixtures/",
    },
  ];
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const search = document.getElementById("mc-search");
  const format = document.getElementById("mc-format");
  const team = document.getElementById("mc-team");
  const count = document.getElementById("mc-count");
  const formatMatch = (f) => (f.format === "List A" ? "List A" : f.format);
  function render() {
    const q = (search.value || "").trim().toLowerCase();
    const selectedFormat = format.value;
    const selectedTeam = team.value;
    const list = fixtures.filter((f) => {
      const text = [f.title, f.team1, f.team2, f.venue, f.series].join(" ").toLowerCase();
      const indiaMen =
        !/women/i.test(f.team1 + " " + f.team2) && /\bindia\b/i.test(f.team1 + " " + f.team2);
      const isIndiaA = /india a/i.test(f.team1 + " " + f.team2);
      const isWomen = /women/i.test(f.team1 + " " + f.team2);
      return (
        (!q || text.includes(q)) &&
        (selectedFormat === "all" || formatMatch(f) === selectedFormat) &&
        (selectedTeam === "all" ||
          (selectedTeam === "india-men" && indiaMen && !isIndiaA) ||
          (selectedTeam === "india-a" && isIndiaA) ||
          (selectedTeam === "women" && isWomen))
      );
    });
    count.textContent = list.length;
    host.innerHTML = list.length
      ? list
          .map((f) => {
            const date = new Date(f.date + "T" + f.time + ":00+05:30");
            const label = date.toLocaleDateString("en-IN", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "Asia/Kolkata",
            });
            return (
              '<article class="match-center-card">' +
              '<div class="mc-card-top"><span class="mc-date">' +
              esc(label) +
              '</span><span class="mc-status">' +
              esc(f.status) +
              "</span></div>" +
              '<div class="mc-series">' +
              esc(f.series) +
              "</div>" +
              '<div class="mc-teams"><strong>' +
              esc(f.team1) +
              "</strong><span>VS</span><strong>" +
              esc(f.team2) +
              "</strong></div>" +
              "<h3>" +
              esc(f.title) +
              "</h3>" +
              '<div class="mc-meta"><span>◷ ' +
              esc(f.time) +
              " IST</span><span>⌖ " +
              esc(f.venue) +
              "</span></div>" +
              '<a href="' +
              esc(f.url) +
              '" target="_blank" rel="noopener noreferrer">Open Match Center ↗</a>' +
              (f.detailsUrl
                ? '<a class="mc-details-link" href="' +
                  esc(f.detailsUrl) +
                  '" target="_blank" rel="noopener noreferrer">Official BCCI match details ↗</a>'
                : "") +
              "</article>"
            );
          })
          .join("")
      : '<p class="activity-empty">No fixtures match these filters.</p>';
  }
  [search, format, team].forEach((el) =>
    el.addEventListener(el.tagName === "INPUT" ? "input" : "change", render),
  );
  render();
})();
