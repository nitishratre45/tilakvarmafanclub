(() => {
  "use strict";
  const root = document.getElementById("liveScoresPanel");
  if (!root) return;
  const status = root.querySelector("[data-live-status]");
  const list = root.querySelector("[data-live-list]");
  const refresh = root.querySelector("[data-live-refresh]");
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  function extract(p) {
    const d = p?.data ?? p;
    if (Array.isArray(d?.match)) return d.match;
    if (Array.isArray(d?.data?.match)) return d.data.match;
    if (Array.isArray(d?.matches)) return d.matches;
    if (Array.isArray(d)) return d;
    return [];
  }
  function render(matches) {
    if (!matches.length) {
      list.innerHTML = '<p class="loading-state">Live JSON mein abhi matches nahi hain.</p>';
      return;
    }
    list.innerHTML = matches
      .map((m) => {
        const a = m.team1_name || m.home_team_name || "Team 1",
          b = m.team2_name || m.away_team_name || "Team 2";
        const score = m.result_string || "";
        return (
          '<article class="fixture-card"><div><div class="fixture-topline"><span class="competition">' +
          esc(m.comp_name || m.primary_event_name || "BCCI Live Score") +
          '</span><span class="status-pill">' +
          esc(m.live_status_name || m.match_status || "Status unavailable") +
          '</span></div><div class="teams"><div class="team">' +
          esc(a) +
          '</div><div class="versus">VS</div><div class="team">' +
          esc(b) +
          '</div></div><div class="match-meta">' +
          (m.ground_name || m.ground_city
            ? "<span>📍 " + esc(m.ground_name || m.ground_city) + "</span>"
            : "") +
          (m.start_time_local ? "<span>◷ " + esc(m.start_time_local) + "</span>" : "") +
          "</div>" +
          (score ? '<div class="match-meta"><strong>' + esc(score) + "</strong></div>" : "") +
          '</div><div class="fixture-date"><strong>' +
          esc(m.date_string || m.start_date || "Date TBA") +
          "</strong><span>Match ID · " +
          esc(m.match_id || m.gid || "—") +
          "</span></div></article>"
        );
      })
      .join("");
  }
  async function load() {
    refresh.disabled = true;
    status.textContent = "Loading separate live-scores JSON…";
    try {
      const res = await fetch("./bcci-live-scores.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const p = await res.json();
      if (p.status === "error") throw new Error(p.error || "Latest workflow fetch failed");
      const matches = extract(p);
      render(matches);
      status.textContent =
        "JSON snapshot: " +
        (p.fetchedAt ? new Date(p.fetchedAt).toLocaleString() : "time unavailable") +
        " · " +
        matches.length +
        " matches";
    } catch (e) {
      status.textContent = "Live JSON load failed: " + e.message;
      list.innerHTML =
        '<p class="loading-state">Run the BCCI Live Scores workflow to refresh bcci-live-scores.json.</p>';
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.addEventListener("click", load);
  load();
  window.setInterval(load, 60000);
})();
