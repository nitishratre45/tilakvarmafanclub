(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  let site = {},
    rows = [];
  const num = (r) => (typeof r.runs === "number" && Number.isFinite(r.runs) ? r.runs : null);
  async function init() {
    try {
      site = await window.TilakSiteData.load();
      rows = Array.isArray(site.recentInnings) ? site.recentInnings : [];
      milestones();
      analytics();
    } catch (e) {
      console.error(e);
      ["milestone-grid", "analytics-grid"].forEach((id) => {
        if ($(id)) $(id).textContent = "Data unavailable. Please try again later.";
      });
    }
  }
  function milestones() {
    const host = $("milestone-grid");
    if (!host) return;
    const t = site.careerFormats?.T20I || site.careerStats || {},
      runs = Number(t.runs ?? site.careerStats?.t20iRuns),
      fifties = Number(t.fifties ?? site.careerStats?.fifties),
      hundreds = Number(t.hundreds ?? site.careerStats?.hundreds),
      list = [];
    if (Number.isFinite(runs) && runs >= 0)
      [2000, 2500, 3000]
        .filter((n) => n > runs)
        .slice(0, 2)
        .forEach((n) =>
          list.push({ name: n.toLocaleString("en-IN") + " T20I runs", v: runs, t: n, u: "runs" }),
        );
    if (Number.isFinite(fifties) && fifties >= 0)
      list.push({ name: "Next T20I fifty", v: fifties, t: fifties + 1, u: "50+ scores" });
    if (Number.isFinite(hundreds) && hundreds >= 0)
      list.push({ name: "Next T20I hundred", v: hundreds, t: hundreds + 1, u: "centuries" });
    host.innerHTML = list
      .map(
        (m) =>
          '<article class="milestone-card"><span class="feature-eyebrow">CAREER TARGET</span><h3>' +
          esc(m.name) +
          '</h3><div class="milestone-values"><strong>' +
          m.v +
          "</strong><span>of " +
          m.t +
          " " +
          m.u +
          '</span></div><div class="milestone-track"><i style="width:' +
          Math.min(100, (m.v / m.t) * 100) +
          '%"></i></div><p>' +
          (m.t - m.v) +
          " " +
          m.u +
          " to target</p><small>Stored stats only · not a prediction</small></article>",
      )
      .join("");
  }
  function analytics() {
    const scored = rows.filter((r) => num(r) !== null),
      total = scored.reduce((s, r) => s + num(r), 0),
      sixes = scored.reduce((s, r) => s + Number(r.sixes || 0), 0),
      host = $("analytics-grid");
    if (!host) return;
    host.innerHTML = [
      ["SCORED INNINGS", scored.length],
      ["RUNS IN LISTED INNINGS", total],
      ["AVERAGE / INNINGS", scored.length ? (total / scored.length).toFixed(1) : "—"],
      ["SIXES RECORDED", sixes],
    ]
      .map(
        (x) =>
          '<article class="analytics-metric"><span>' +
          x[0] +
          "</span><strong>" +
          x[1] +
          "</strong></article>",
      )
      .join("");
    $("analytics-count").textContent =
      scored.length + " numeric innings · " + rows.length + " total rows";
    const max = Math.max(1, ...scored.map(num));
    $("analytics-chart").innerHTML = scored.length
      ? '<div class="bar-chart analytics-bars">' +
        scored
          .slice(0, 12)
          .reverse()
          .map(
            (r) =>
              '<div class="bar-row"><span>' +
              esc(r.date) +
              " · " +
              esc(r.opposition) +
              '</span><div class="bar-track"><i style="width:' +
              Math.max(2, (num(r) / max) * 100) +
              '%"></i></div><b>' +
              num(r) +
              "</b></div>",
          )
          .join("") +
        "</div>"
      : '<p class="feature-note">No verified numeric innings are available.</p>';
  }

  init();
})();
