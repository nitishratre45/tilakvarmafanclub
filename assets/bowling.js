(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const fmt = (v) =>
    v === null || v === undefined || v === ""
      ? "—"
      : typeof v === "number"
        ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 })
        : v;
  const metric = (label, value, cls = "") =>
    '<article class="' +
    cls +
    '"><span>' +
    esc(label) +
    "</span><strong>" +
    esc(fmt(value)) +
    "</strong></article>";
  let allData = null,
    selected = "T20I";
  const formats = () => allData?.bowlingStats?.formats || {};
  function overValue(s) {
    return (
      s?.overs ??
      (typeof s?.balls === "number" ? Math.floor(s.balls / 6) + "." + (s.balls % 6) : "—")
    );
  }
  function summaryFor(format) {
    const s = formats()[format]?.summary;
    if (!s) return null;
    return [
      ["MATCHES", s.matches],
      ["INNINGS", s.innings],
      ["OVERS", overValue(s)],
      ["MAIDENS", s.maidens],
      ["RUNS CONCEDED", s.runsConceded],
      ["WICKETS", s.wickets],
      ["BOWLING AVG", s.average],
      ["ECONOMY", s.economy],
      ["STRIKE RATE", s.strikeRate],
      ["BEST FIGURES", s.bestBowling],
      ["4-WICKET HAULS", s.fourWicketHauls],
      ["5-WICKET HAULS", s.fiveWicketHauls],
    ];
  }
  function renderHome() {
    const host = $("home-bowling-stats");
    if (!host) return;
    const order = ["T20I", "ODI", "List A", "FC", "T20"];
    const available = order
      .map((format) => ({ format, summary: formats()[format]?.summary }))
      .filter((item) => item.summary);
    if (!available.length) {
      host.innerHTML =
        '<p class="activity-empty">Verified bowling snapshot is being prepared. No figures are estimated.</p>';
      return;
    }
    host.innerHTML = available
      .map(
        ({ format, summary }) =>
          '<article class="home-bowling-format-card"><span class="home-bowling-format-name">' +
          esc(
            format === "FC" ? "FIRST-CLASS" : format === "T20" ? "T20 · ALL COMPETITIONS" : format,
          ) +
          "</span>" +
          '<strong class="home-bowling-format-wickets">' +
          esc(fmt(summary.wickets)) +
          " <small>WKTS</small></strong>" +
          '<span class="home-bowling-format-detail">Best ' +
          esc(summary.bestBowling || "—") +
          " · Econ " +
          esc(fmt(summary.economy)) +
          "</span>" +
          '<span class="home-bowling-format-detail">Matches ' +
          esc(fmt(summary.matches)) +
          " · Overs " +
          esc(overValue(summary)) +
          "</span></article>",
      )
      .join("");
    if ($("home-bowling-updated"))
      $("home-bowling-updated").textContent =
        "ESPNcricinfo Statsguru · Last update: " +
        (allData.bowlingStats?.updatedAt || "timestamp unavailable");
  }
  function renderBreakdown() {
    const host = $("bowling-breakdown");
    const section = host?.closest(".bowling-breakdown-wrap");
    if (!host) return;
    const rows = formats()[selected]?.careerBreakdown || [];
    if (section) section.hidden = rows.length === 0;
    host.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              "<tr><td>" +
              esc(r.group || r.span || "—") +
              "</td><td>" +
              esc(fmt(r.matches)) +
              "</td><td>" +
              esc(fmt(r.innings)) +
              "</td><td>" +
              esc(overValue(r)) +
              "</td><td>" +
              esc(fmt(r.maidens)) +
              "</td><td>" +
              esc(fmt(r.runsConceded)) +
              '</td><td class="bowling-wickets-cell">' +
              esc(fmt(r.wickets)) +
              "</td><td>" +
              esc(fmt(r.average)) +
              "</td><td>" +
              esc(fmt(r.economy)) +
              "</td><td>" +
              esc(fmt(r.strikeRate)) +
              '</td><td class="bowling-best-cell">' +
              esc(fmt(r.bestBowling)) +
              "</td></tr>",
          )
          .join("")
      : '<tr><td colspan="11" class="empty">No verified career breakdown rows are available for this format.</td></tr>';
  }
  function renderInnings() {
    const host = $("bowling-innings"),
      section = host?.closest(".bowling-innings-wrap"),
      entry = formats()[selected] || {},
      rows = Array.isArray(entry.innings) ? entry.innings : [];
    if (!host) return;
    if (section) section.hidden = rows.length === 0;
    host.innerHTML = rows.length
      ? rows
          .map((r) => {
            const url = String(r.matchUrl || "");
            const safe =
              /^https:\/\/(?:stats\.espncricinfo\.com|www\.espncricinfo\.com|www\.cricinfo\.com|cricinfo\.com)\//i.test(
                url,
              );
            return (
              "<tr><td>" +
              esc(r.date) +
              "</td><td>" +
              esc(r.opposition) +
              "</td><td>" +
              esc(fmt(r.overs)) +
              "</td><td>" +
              esc(fmt(r.maidens)) +
              "</td><td>" +
              esc(fmt(r.runsConceded)) +
              '</td><td class="bowling-wickets-cell">' +
              esc(fmt(r.wickets)) +
              "</td><td>" +
              esc(fmt(r.economy)) +
              "</td><td>" +
              esc(r.ground) +
              "</td><td>" +
              (safe
                ? '<a class="bowling-card-link" target="_blank" rel="noopener noreferrer" href="' +
                  esc(url) +
                  '">Scorecard ↗</a>'
                : esc(r.figures || "—")) +
              "</td></tr>"
            );
          })
          .join("")
      : '<tr><td colspan="9" class="empty">No verified bowling innings rows available for this format.</td></tr>';
    if ($("bowling-innings-count"))
      $("bowling-innings-count").textContent = rows.length + " bowling innings";
  }
  function renderStats() {
    const host = $("bowling-summary");
    if (!host) return;
    const list = summaryFor(selected);
    host.innerHTML = list
      ? list.map((x) => metric(x[0], x[1], "bowling-metric")).join("")
      : '<p class="activity-empty">No verified bowling summary has been published yet. The daily ESPNcricinfo check will populate this section when the source is available.</p>';
    if ($("bowling-updated"))
      $("bowling-updated").textContent =
        "Last update: " + (allData.bowlingStats?.updatedAt || "Waiting for verified data");
    document.querySelectorAll("[data-bowling-format]").forEach((b) => {
      const active = b.dataset.bowlingFormat === selected;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    renderBreakdown();
    renderInnings();
  }
  async function init() {
    try {
      const response = await fetch("data/site-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Site data unavailable");
      allData = await response.json();
      renderHome();
      renderStats();
    } catch (_) {
      const h = $("home-bowling-stats");
      if (h) h.innerHTML = '<p class="activity-empty">Bowling data is temporarily unavailable.</p>';
      const s = $("bowling-summary");
      if (s) s.innerHTML = '<p class="activity-empty">Bowling data is temporarily unavailable.</p>';
    }
  }
  document.querySelectorAll("[data-bowling-format]").forEach((b) =>
    b.addEventListener("click", () => {
      selected = b.dataset.bowlingFormat;
      renderStats();
    }),
  );
  init();
})();
