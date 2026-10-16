(() => {
  "use strict";
  const API = "https://stats.bcci.tv/match/live_scores/";
  const COMP_GIDS = [
    "65d2b784-4a75-41ca-8415-a345042030d6","11ba38c8-30d4-438c-8214-0d5ffdc0d9ca",
    "8e82842f-2c4d-4bd5-8712-5c342fa0ac52","23a35541-7b2d-4caf-a215-9cf07da68259",
    "be3673dc-4020-4db0-81f3-2833432f9de3","34154bc1-ebbf-4109-ba78-67cf9cf7aafa",
    "47f70a25-00df-4792-9650-3e2c3642a27b","6a64053e-55fc-47ed-9cae-4c58e9b0e551",
    "9a12946b-9277-4b5f-ba94-34d02355bf03","2fb13b04-0824-4466-9dca-a8558081ca9c",
    "2c9a58d0-365c-4301-839e-b1d2a0803b2b","b0267a1c-8b9b-4e75-b98f-65d37d080565",
    "dafec7a6-ae05-48a1-abf0-3e946f60a856","04d7f468-3b06-4dcc-88de-594afd83c561",
    "d2f2e609-1d15-4630-ba86-c004c4b6ded7","52f44249-0afd-41aa-bb88-c6e7778a4f0d",
    "97b4c72d-a7dd-42f7-9d4c-e2412d7dbae2","5cd3ede8-16d7-4914-9d4c-2eb59671fe50",
    "db99461c-27d2-46ef-8f47-a0eb1d3e1d26","39a2078a-2e87-4f90-86eb-53696579466c",
    "7ca2538b-b8e8-4221-b76f-4705cb75af1f","a88f96d1-b5ab-4327-82bf-6c89e4ae7b1b",
    "aa9d383e-5b90-41d1-80e2-2a75c8e4359d","d5ad0d62-3c4e-44e3-bd52-80721d1edeac",
    "12616d71-d30e-4c6c-b669-8850c160ad8d","ad6326a1-59dd-4e36-8eeb-36b0c0b09bbc",
    "15a5482f-d85a-4cf8-b1bf-aae83716cf2b","b4d4040d-4631-4f31-b224-e9aa54b40797",
    "ad9bff8b-d68e-4c5e-a92d-72b6705134b2","13de0d47-83d7-4351-8e6a-57d28a18be48",
    "1cf7ed18-0c14-452c-840b-447aeb5dd020","96f00b0b-c06b-4764-bbc3-7ed388abb24b",
    "dd82f86a-6aa4-477c-b0de-2706a677d0d2"
  ];
  const TEAM_GIDS = [
    "71790c66-0e3c-4d0b-96a5-e04526040f94","cf9ec6b2-8d90-41a9-a834-f2f120b37811",
    "83151b98-bbed-42ba-b397-944059ef5830","0f99bbe0-3198-4f82-8520-e18a9e24545f",
    "f04b25a0-9d2b-4ee9-b7da-1aba80b24ae8","4eb0e97b-6e43-47f3-8e46-bedf6de77cea",
    "611a0e16-280f-4fe2-98e8-366ba9719962","01d41b53-68f6-48f8-a8d0-c9ec2f338749",
    "eb81d735-6436-4dac-9a7a-15a7a347d5e6","08dc4ba8-22a1-4e5a-9862-20f8a8643f99"
  ];
  const root = document.getElementById("liveScoresPanel");
  if (!root) return;
  const status = root.querySelector("[data-live-status]");
  const list = root.querySelector("[data-live-list]");
  const refresh = root.querySelector("[data-live-refresh]");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function extract(payload) {
    const d = payload?.data ?? payload;
    if (Array.isArray(d?.match)) return d.match;
    if (Array.isArray(d?.data?.match)) return d.data.match;
    if (Array.isArray(d?.matches)) return d.matches;
    if (Array.isArray(d)) return d;
    return [];
  }
  function render(matches) {
    if (!matches.length) {
      list.innerHTML = '<p class="loading-state">BCCI response mila, lekin match list nahi mili.</p>';
      return;
    }
    list.innerHTML = matches.map(m => {
      const team1 = m.team1_name || m.home_team_name || "Team 1";
      const team2 = m.team2_name || m.away_team_name || "Team 2";
      const live = /live|in play|progress/i.test([m.match_status,m.live_status_name].join(" "));
      const score = m.result_string || (m.summary?.team || []).map(t => t.score).filter(Boolean).join(" · ");
      const venue = m.ground_name || m.ground_city || "";
      return '<article class="fixture-card"><div><div class="fixture-topline"><span class="competition">' +
        esc(m.comp_name || m.primary_event_name || m.name || "BCCI Live Score") +
        '</span><span class="status-pill ' + (live ? "upcoming" : "") + '">' +
        esc(m.live_status_name || m.match_status || "Scheduled") +
        '</span></div><div class="teams"><div class="team">' + esc(team1) +
        '</div><div class="versus">VS</div><div class="team">' + esc(team2) +
        '</div></div><div class="match-meta">' + (venue ? '<span>📍 ' + esc(venue) + '</span>' : "") +
        (m.start_time_local ? '<span>◷ ' + esc(m.start_time_local) + '</span>' : "") +
        '</div>' + (score ? '<div class="match-meta"><strong>' + esc(score) + '</strong></div>' : "") +
        '</div><div class="fixture-date"><strong>' + esc(m.date_string || m.start_date || "Date TBA") +
        '</strong><span>Match ID · ' + esc(m.match_id || m.gid || "—") + '</span></div></article>';
    }).join("");
  }
  async function load() {
    refresh.disabled = true;
    status.textContent = "BCCI live scores fetch ho rahe hain…";
    list.innerHTML = '<p class="loading-state">Connecting to BCCI live_scores API…</p>';
    const params = new URLSearchParams();
    COMP_GIDS.forEach(v => params.append("comp_gid", v));
    TEAM_GIDS.forEach(v => params.append("team_gid", v));
    try {
      const response = await fetch(API + "?" + params.toString(), {cache:"no-store"});
      if (!response.ok) throw new Error("BCCI HTTP " + response.status);
      const payload = await response.json();
      const matches = extract(payload);
      render(matches);
      status.textContent = "Updated " + new Date().toLocaleTimeString() + " · " + matches.length + " matches";
    } catch (err) {
      status.textContent = "Direct browser fetch failed: " + err.message + ". CORS/API restriction ho sakti hai.";
      list.innerHTML = '<p class="loading-state">BCCI API browser request ko block kar sakti hai. Agar yeh error rahe, live data ke liye secure proxy/serverless function chahiye.</p>';
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.addEventListener("click", load);
  load();
  window.setInterval(load, 60000);
})();