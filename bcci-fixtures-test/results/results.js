(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const list = $("list"), search = $("search"), format = $("format"), sort = $("sort");
  const count = $("count"), updated = $("updated");
  if (!list || !search || !format || !sort || !count || !updated) return;

  const ARCHIVE_URL = "/matches/scorecards/index.json";
  let matches = [];
  const esc = (value) => String(value ?? "—").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const date = (m) => String(m.date || m.start_date || m.match_date || "");
  const formatLabel = (value) => ({
    T20I:"T20I", ODI:"ODI", Test:"Test", T20:"T20 / IPL",
    "List A":"List A", "First-class":"First-class"
  })[value] || value || "Cricket";
  const resultText = (m) => String(m.result || m.result_string || "").trim();
  const formatOf = (m) => {
    const raw = String(m.format || m.match_type || "").toLowerCase();
    if (/t20i/.test(raw)) return "T20I";
    if (/\bodi\b/.test(raw)) return "ODI";
    if (/test|first.class/.test(raw)) return /first.class/.test(raw) ? "First-class" : "Test";
    if (/list.a/.test(raw)) return "List A";
    if (/t20|ipl/.test(raw)) return "T20";
    return "Other";
  };
  const uniqueMatches = (rows) => {
    const seen = new Set();
    return rows.filter((m) => {
      const id = String(m.matchId || m.match_id || m.gid || "").trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  const isCompletedTilakMatch = (m) => {
    // This index is produced by the Matches > Complete pipeline and contains
    // verified Tilak Varma appearances only; require a dated result and saved scorecard.
    return Boolean(
      m.matchId && m.scorecard && date(m) && resultText(m) &&
      m.team && m.opposition && /tilak varma/i.test(
        [m.player, m.playerName, m.featuredPlayer, m.archiveNote || ""].join(" ")
      ) || (
        m.matchId && m.scorecard && date(m) && resultText(m) &&
        m.team && m.opposition && m.source === "https://cricsheet.org/"
      )
    );
  };
  async function getJson(url) {
    const response = await fetch(url + "?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status + " loading " + url);
    return response.json();
  }
  function render() {
    const q = search.value.trim().toLowerCase();
    const selectedFormat = format.value;
    const rows = matches.filter((m) => {
      const haystack = [
        m.team, m.opposition, m.event, m.venue, m.result, m.date, m.format, m.matchId
      ].join(" ").toLowerCase();
      return (!q || haystack.includes(q)) &&
        (selectedFormat === "all" || formatOf(m) === selectedFormat);
    });
    rows.sort((a, b) => {
      const delta = date(a).localeCompare(date(b));
      return sort.value === "old" ? delta : -delta;
    });
    count.textContent = rows.length.toLocaleString("en-IN") +
      " completed Tilak Varma match" + (rows.length === 1 ? "" : "es");
    if (!rows.length) {
      list.innerHTML = '<div class="empty"><span class="empty-icon">🏏</span><h2>No matching completed matches</h2><p>Try another team, format or date.</p></div>';
      return;
    }
    list.innerHTML = rows.map((m) => {
      const score = m.playerRuns !== undefined && m.playerRuns !== null
        ? "Tilak Varma: " + m.playerRuns + " runs"
        : "Full scorecard available";
      const innings = Number(m.inningsCount || 0);
      const scorecardUrl = "/matches/scorecards/?match=" + encodeURIComponent(m.matchId);
      return '<article class="match">' +
        '<div class="match-main">' +
          '<div class="meta"><span class="format-pill">' + esc(formatLabel(formatOf(m))) +
          '</span><span>' + esc(m.event || "Completed match") + '</span><span>' +
          esc(date(m)) + '</span></div>' +
          '<h2 class="teams">' + esc(m.team || "Team") + ' <span>vs</span> ' +
          esc(m.opposition || "Opponent") + '</h2>' +
          '<p class="result">' + esc(resultText(m)) + '</p>' +
          '<p class="scores">' + esc(score) + (innings ? " · " + innings + " innings" : "") + '</p>' +
          '<p class="venue">' + esc(m.venue || "Venue unavailable") + '</p>' +
          '<p class="source-note">Scorecard source: Cricsheet archive · Match ID: ' + esc(m.matchId) + '</p>' +
        '</div><a class="btn scorecard-btn" href="' + esc(scorecardUrl) + '">Full scorecard ↗</a></article>';
    }).join("");
  }
  async function load() {
    count.textContent = "Loading Tilak Varma completed-match archive…";
    list.innerHTML = '<div class="empty">Loading saved match index and scorecards…</div>';
    try {
      const archive = await getJson(ARCHIVE_URL);
      const sourceRows = Array.isArray(archive.matches) ? archive.matches : [];
      matches = uniqueMatches(sourceRows.filter(isCompletedTilakMatch));
      if (!matches.length) throw new Error("The completed archive returned no verified Tilak Varma matches.");
      const updatedAt = archive.updatedAt ? new Date(archive.updatedAt) : null;
      updated.textContent = "Source: Cricsheet · Matches folder completed archive" +
        (updatedAt && !Number.isNaN(updatedAt.getTime())
          ? " · Updated " + updatedAt.toLocaleString("en-IN", {
              timeZone:"Asia/Kolkata", dateStyle:"medium", timeStyle:"short"
            })
          : "");
      render();
    } catch (error) {
      count.textContent = "Completed archive unavailable";
      updated.textContent = "Source: /matches/scorecards/index.json";
      list.innerHTML = '<div class="empty"><span class="empty-icon">⚠️</span><h2>Could not load completed matches</h2><p>' +
        esc(error.message) + '</p><a class="btn" href="' + esc(ARCHIVE_URL) +
        '" target="_blank" rel="noopener">Open source archive ↗</a></div>';
    }
  }
  search.addEventListener("input", render);
  format.addEventListener("change", render);
  sort.addEventListener("change", render);
  load();
})();