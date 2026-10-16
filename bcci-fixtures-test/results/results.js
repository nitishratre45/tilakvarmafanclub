(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const list = $("list"),
    search = $("search"),
    format = $("format"),
    sort = $("sort");
  const count = $("count"),
    updated = $("updated");
  if (!list || !search || !format || !sort || !count || !updated) return;
  let matches = [];
  const esc = (v) =>
    String(v ?? "").replace(
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
  const date = (m) =>
    m.start_date || m.end_date || m.match_date || m.date_string || m.start_datetime_utc || "";
  const fmt = (m) => {
    const text = [
      m.title,
      m.match_short_name,
      m.name,
      m.comp_name,
      m.comp_type,
      ...(Array.isArray(m.class) ? m.class.map((x) => x?.name) : []),
    ]
      .join(" ")
      .toLowerCase();
    if (/women/.test(text)) return "Women's";
    if (/test|first.class/.test(text)) return "Test";
    if (/odi|one.day|one day/.test(text)) return "ODI";
    if (/t20|twenty20/.test(text)) return "T20I";
    return "Other";
  };
  const complete = (m) => {
    const state = String(
      m.match_status_str || m.match_status || m.status || m.live_status_name || "",
    ).toLowerCase();
    return Boolean(
      m.result_string ||
        m.result ||
        m.winner_team_id ||
        /complete|completed|finished|result|abandoned|no result|won by|win by|drawn|tied/.test(
          state,
        ),
    );
  };
  const extract = (payload) => {
    if (Array.isArray(payload)) return payload;
    for (const key of ["matches", "match", "results", "data", "items", "result"]) {
      const v = payload?.[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === "object") {
        for (const nested of ["matches", "match", "results", "items"])
          if (Array.isArray(v[nested])) return v[nested];
      }
    }
    return [];
  };
  const unique = (rows) => {
    const seen = new Set();
    return rows.filter((m) => {
      const id = String(
        m.gid ||
          m.match_gid ||
          m.match_id ||
          m.id ||
          [m.team1_name, m.team2_name, date(m), m.comp_name].join("|"),
      );
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  async function getJson(url) {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("HTTP " + r.status + " loading " + url);
    return r.json();
  }
  function render() {
    const q = search.value.trim().toLowerCase(),
      f = format.value;
    const data = matches.filter((m) => {
      const hay = [
        m.name,
        m.title,
        m.match_short_name,
        m.comp_name,
        m.ground_name,
        m.ground_city,
        m.team1_name,
        m.team2_name,
        m.result_string,
        m.result,
      ]
        .join(" ")
        .toLowerCase();
      return (!q || hay.includes(q)) && (f === "all" || fmt(m) === f);
    });
    data.sort((a, b) => {
      const d = String(date(a)).localeCompare(String(date(b)));
      return sort.value === "old" ? d : -d;
    });
    count.textContent = data.length + " completed match" + (data.length === 1 ? "" : "es");
    if (!data.length) {
      list.innerHTML =
        '<div class="empty"><span class="empty-icon">🏏</span><h2>No matching results</h2><p>Try another team name, format or date. If the archive is empty, run the BCCI Results workflow and reload this page.</p><a class="btn" href="https://github.com/nitishratre45/tilakvarmafanclub/actions/workflows/refresh-bcci-results.yml" target="_blank" rel="noopener">Refresh results data ↗</a></div>';
      return;
    }
    list.innerHTML = data
      .map((m) => {
        const gid = m.gid || m.match_gid || m.match_id || m.id || "";
        const teams =
          (m.team1_name || m.team1_short_name || "Team 1") +
          " vs " +
          (m.team2_name || m.team2_short_name || "Team 2");
        const summary = m.summary?.team || [];
        const scores = summary
          .map((t) => t?.score)
          .filter(Boolean)
          .join(" · ");
        const dateText = m.date_string || date(m) || "Date unavailable";
        return (
          '<article class="match"><div class="match-main"><div class="meta"><span class="format-pill">' +
          esc(fmt(m)) +
          "</span><span>" +
          esc(m.comp_name || m.comp_type || "Cricket") +
          "</span><span>" +
          esc(dateText) +
          '</span></div><h2 class="teams">' +
          esc(teams) +
          '</h2><div class="result">' +
          esc(m.result_string || m.result || "Match completed") +
          "</div>" +
          (scores ? '<div class="score">' + esc(scores) + "</div>" : "") +
          '<div class="venue">' +
          esc(
            [m.ground_name, m.ground_city]
              .filter(Boolean)
              .filter((v, i, a) => a.indexOf(v) === i)
              .join(" · "),
          ) +
          '</div></div><div class="actions">' +
          (gid
            ? '<a class="btn" href="../bcci-scorecard-page.html?gid=' +
              encodeURIComponent(gid) +
              '">Full scorecard <span aria-hidden="true">↗</span></a>'
            : "") +
          "</div></article>"
        );
      })
      .join("");
  }
  async function load() {
    count.textContent = "Loading completed matches…";
    list.innerHTML = '<div class="empty loading">Loading BCCI results archive…</div>';
    try {
      const payload = await getJson("./results.json");
      matches = unique(extract(payload));
      updated.textContent = payload.updatedAt
        ? "Updated " + new Date(payload.updatedAt).toLocaleString()
        : "";
      if (!matches.length) throw new Error("Archive has no saved matches");
    } catch (archiveError) {
      try {
        const fixturePayload = await getJson("../bcci-fixtures.json");
        const fixtureRows = extract(fixturePayload.data || fixturePayload);
        matches = unique(fixtureRows.filter(complete));
        updated.textContent = matches.length
          ? "Showing completed matches from the latest fixtures snapshot · " +
            (fixturePayload.fetchedAt ? new Date(fixturePayload.fetchedAt).toLocaleString() : "")
          : "Results archive not generated yet";
      } catch (fallbackError) {
        matches = [];
        updated.textContent = "Results data unavailable";
      }
    }
    render();
  }
  [search, format, sort].forEach((el) => el.addEventListener("input", render));
  load();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) load();
  });
})();
