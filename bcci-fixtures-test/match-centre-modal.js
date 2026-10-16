(() => {
  "use strict";
  const dialog = document.getElementById("match-centre-dialog"),
    host = document.getElementById("match-centre-matches");
  if (!dialog || !host) return;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const score = (m, id) => {
    const a = m?.summary?.innings;
    if (!Array.isArray(a)) return "";
    const x = a.find((i) => String(i.batting_team_id) === String(id));
    return x ? esc(x.runs) + "/" + esc(x.wickets) + " <small>(" + esc(x.overs) + ")</small>" : "";
  };
  const kind = (m) => {
    const s = String(m.match_status || m.live_status_name || "").toLowerCase();
    return /live|play|progress/.test(s)
      ? ["LIVE", ""]
      : /complete|result|finished/.test(s)
        ? ["COMPLETED", "is-completed"]
        : ["UPCOMING", "is-upcoming"];
  };
  function card(m) {
    const a = m.team1_name || m.team1_short_name || "Team 1",
      b = m.team2_name || m.team2_short_name || "Team 2",
      k = kind(m);
    const date = m.start_datetime_utc
      ? new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(String(m.start_datetime_utc).replace(" ", "T") + "Z"))
      : m.end_date || "";
    return (
      '<article class="match-centre-card"><div><div class="match-centre-meta"><span class="match-centre-status ' +
      k[1] +
      '">' +
      k[0] +
      "</span><span>" +
      esc(m.class?.[0]?.name || "Cricket") +
      " · " +
      esc(date) +
      '</span></div><div class="match-centre-teams"><div class="match-centre-team"><div class="match-centre-team-name">' +
      esc(a) +
      '</div><div class="match-centre-score">' +
      (score(m, m.team1_id) || "—") +
      '</div></div><span class="match-centre-vs">VS</span><div class="match-centre-team"><div class="match-centre-team-name">' +
      esc(b) +
      '</div><div class="match-centre-score">' +
      (score(m, m.team2_id) || "—") +
      "</div></div></div>" +
      (m.result_string ? '<p class="match-centre-result">' + esc(m.result_string) + "</p>" : "") +
      '</div><a class="match-centre-scoreboard" href="./bcci-scorecard-page"><span class="match-centre-scoreboard-icon">▥</span><span>Scoreboard</span><span class="match-centre-scoreboard-arrow">›</span></a></article>'
    );
  }
  async function load() {
    try {
      const r = await fetch("./bcci-live-scores.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw Error();
      const j = await r.json(),
        m = j?.data?.live_scores || j?.live_scores || [];
      if (!m.length) throw Error();
      host.innerHTML = [...m]
        .sort((a, b) => (kind(a)[0] === "LIVE" ? 0 : 1) - (kind(b)[0] === "LIVE" ? 0 : 1))
        .slice(0, 4)
        .map(card)
        .join("");
    } catch {
      host.innerHTML =
        '<p class="match-centre-empty">Live score data is unavailable. Please retry or open the fixtures list.</p>';
    }
  }
  let opener = null,
    timer = 0;
  document.querySelectorAll(".match-centre-trigger").forEach((b) =>
    b.addEventListener("click", () => {
      opener = b;
      dialog.classList.add("is-open");
      dialog.setAttribute("aria-hidden", "false");
      document.body.classList.add("match-centre-lock");
      load();
      clearInterval(timer);
      timer = setInterval(() => dialog.classList.contains("is-open") && load(), 60000);
      dialog.querySelector(".match-centre-close").focus();
    }),
  );
  function close() {
    dialog.classList.remove("is-open");
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("match-centre-lock");
    clearInterval(timer);
    opener?.focus();
  }
  dialog
    .querySelectorAll("[data-match-centre-close]")
    .forEach((b) => b.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dialog.classList.contains("is-open")) close();
  });
})();
