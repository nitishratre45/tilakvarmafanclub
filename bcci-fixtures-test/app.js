(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { fixtures: [] };
  function pick(o, keys, fallback = "") {
    if (!o || typeof o !== "object") return fallback;
    for (const k of keys) {
      const v = o[k];
      if (v === undefined || v === null || String(v).trim() === "") continue;
      if (typeof v === "object") {
        const n = v.name || v.team_name || v.title || v.short_name;
        if (n) return String(n);
      } else return String(v);
    }
    return fallback;
  }
  function normalise(raw) {
    const out = [];
    const pages = Array.isArray(raw?.pages) ? raw.pages : [raw];
    pages.forEach((p) => {
      const d = Array.isArray(p?.match)
        ? p.match
        : Array.isArray(p?.data)
          ? p.data
          : Array.isArray(p?.fixtures)
            ? p.fixtures
            : Array.isArray(p?.results)
              ? p.results
              : Array.isArray(p?.data?.data)
                ? p.data.data
                : [];
      d.forEach((x, i) =>
        out.push({
          home: pick(
            x,
            [
              "team1_name",
              "home_team_name",
              "team_a_name",
              "team1",
              "home_team",
              "teamA",
              "team_a",
            ],
            "Team A",
          ),
          away: pick(
            x,
            [
              "team2_name",
              "away_team_name",
              "team_b_name",
              "team2",
              "away_team",
              "teamB",
              "team_b",
            ],
            "Team B",
          ),
          date: pick(x, [
            "start_date",
            "date_string",
            "match_date",
            "date",
            "matchDate",
            "startDate",
            "match_start_date",
            "match_datetime",
            "start_time",
            "date_time",
            "matchDateTime",
          ]),
          time: pick(x, ["start_time_local", "match_time", "start_time_text", "time", "matchTime"]),
          venue: pick(x, [
            "ground_name",
            "ground_city",
            "venue_name",
            "venue",
            "stadium",
            "location",
          ]),
          competition: pick(
            x,
            [
              "comp_name",
              "primary_event_name",
              "alt_comp_name",
              "competition_name",
              "series_name",
              "tournament_name",
              "competition",
              "series",
              "tournament",
              "match_type",
            ],
            "BCCI Fixture",
          ),
          status: pick(
            x,
            ["match_status", "live_status_name", "status", "matchState", "state", "match_result"],
            "Scheduled",
          ),
          id: pick(x, ["match_id", "gid", "match_gid", "id", "fixture_id"], String(i)),
          title: pick(x, ["title", "match_short_name", "name"]),
          result: pick(x, ["result_string"]),
        }),
      );
    });
    return out;
  }
  function esc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function fmt(v) {
    if (!v) return "Date TBA";
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? v
      : new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(d);
  }
  function render() {
    const q = $("searchInput").value.trim().toLowerCase(),
      s = $("statusFilter").value,
      sort = $("sortFilter").value;
    const list = state.fixtures.filter(
      (f) =>
        [f.home, f.away, f.venue, f.competition, f.status, f.date]
          .join(" ")
          .toLowerCase()
          .includes(q) &&
        (s === "all" || f.status.toLowerCase() === s.toLowerCase()),
    );
    list.sort((a, b) =>
      sort === "date-desc"
        ? (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0)
        : (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0),
    );
    $("resultCount").textContent = list.length + " of " + state.fixtures.length + " fixtures";
    $("fixtureList").innerHTML = list
      .map(
        (f) =>
          '<article class="fixture-card"><div><div class="fixture-topline"><span class="competition">' +
          esc(f.competition) +
          '</span><span class="status-pill ' +
          (/live|progress|innings/i.test(f.status) ? "upcoming" : "") +
          '">' +
          esc(f.status) +
          '</span></div><div class="teams"><div class="team">' +
          esc(f.home) +
          '</div><div class="versus">VS</div><div class="team">' +
          esc(f.away) +
          '</div></div><div class="match-meta">' +
          [f.venue && "📍 " + f.venue, f.time && "◷ " + f.time]
            .filter(Boolean)
            .map((v) => "<span>" + esc(v) + "</span>")
            .join("") +
          '</div></div><div class="fixture-date"><strong>' +
          esc(fmt(f.date)) +
          "</strong><span>Fixture date</span></div></article>",
      )
      .join("");
    $("emptyState").hidden = list.length !== 0;
    $("fixtureList").hidden = list.length === 0;
  }
  async function load() {
    const b = $("refreshBtn");
    b.disabled = true;
    $("fixtureList").hidden = false;
    $("fixtureList").innerHTML = '<div class="loading-state">Loading saved BCCI fixtures…</div>';
    try {
      const r = await fetch("./bcci-custom-fixtures.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok)
        throw Error(
          r.status === 404
            ? "Snapshot JSON not found yet. Run the GitHub Actions workflow first."
            : "HTTP " + r.status,
        );
      const type = r.headers.get("content-type") || "";
      if (type.includes("text/html"))
        throw Error(
          "Server returned an HTML page instead of JSON. Check that bcci-custom-fixtures.json exists in the deployed Pages build.",
        );
      let raw;
      try {
        raw = await r.json();
      } catch (parseError) {
        throw Error(
          "Fixture JSON is missing or invalid. Run the Refresh Custom BCCI Fixtures workflow and redeploy Pages.",
        );
      }
      state.fixtures = normalise(raw);
      $("totalCount").textContent = Number.isFinite(raw.recordCount)
        ? raw.recordCount.toLocaleString("en-IN")
        : (raw.page?.total_rows ?? state.fixtures.length).toLocaleString("en-IN");
      $("pageCount").textContent =
        raw.pagesFetched ?? raw.page?.last_page ?? raw.pages?.length ?? "—";
      $("lastUpdated").textContent = raw.checkedAt ? fmt(raw.checkedAt) : "Unknown";
      $("sourceStatus").textContent = raw.httpStatus
        ? "HTTP " + raw.httpStatus + " · " + (raw.status || "Snapshot loaded")
        : raw.status || "Snapshot loaded";
      const statuses = [...new Set(state.fixtures.map((f) => f.status).filter(Boolean))].sort(),
        filter = $("statusFilter"),
        old = filter.value;
      filter.innerHTML =
        '<option value="all">All statuses</option>' +
        statuses.map((x) => '<option value="' + esc(x) + '">' + esc(x) + "</option>").join("");
      if (statuses.includes(old)) filter.value = old;
      render();
      if (!state.fixtures.length) {
        $("fixtureList").hidden = false;
        $("fixtureList").innerHTML =
          '<div class="loading-state">JSON loaded, but fixture fields were not recognised. Open the raw JSON to inspect the BCCI schema.</div>';
      }
    } catch (e) {
      $("totalCount").textContent = "—";
      $("pageCount").textContent = "—";
      $("lastUpdated").textContent = "Unavailable";
      $("sourceStatus").textContent = "Could not load snapshot";
      $("fixtureList").hidden = false;
      $("fixtureList").innerHTML =
        '<div class="loading-state">' +
        esc(e.message) +
        '<br><br><a class="secondary-btn" href="./bcci-custom-fixtures.json" target="_blank" rel="noopener">Try opening JSON</a></div>';
      $("resultCount").textContent = "No data";
    } finally {
      b.disabled = false;
    }
  }
  $("refreshBtn").addEventListener("click", load);
  $("searchInput").addEventListener("input", render);
  $("statusFilter").addEventListener("change", render);
  $("sortFilter").addEventListener("change", render);
  load();
})();
