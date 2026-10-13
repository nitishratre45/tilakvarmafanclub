/* ESPNcricinfo-based debut/last and recent match browser. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
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
  const dateValue = (value) => {
    const raw = String(value || "").trim();
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;
    const m = raw.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{4})$/);
    if (m) {
      const d = Date.parse(m[1] + " " + m[2] + " " + m[3]);
      if (Number.isFinite(d)) return d;
    }
    return 0;
  };
  const prettyDate = (value) => {
    const raw = String(value || "—"),
      ts = dateValue(raw);
    return ts
      ? new Date(ts).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : raw;
  };
  const displayStat = (value) =>
    value === null || value === undefined || value === "" || value === "—" ? "—" : String(value);
  const dismissal = (r) => {
    const value = String(r.dismissal || (r.notOut ? "not out" : "")).trim();
    if (!value) return "—";
    if (/^not\s*out$/i.test(value) || r.notOut) return "Not out";
    const labels = {
      bowled: "Bowled",
      caught: "Caught",
      "caught and bowled": "Caught & bowled",
      lbw: "LBW",
      "run out": "Run out",
      stumped: "Stumped",
      hitwicket: "Hit wicket",
      "hit wicket": "Hit wicket",
      "retired hurt": "Retired hurt",
      "retired out": "Retired out",
      obstructing: "Obstructing the field",
      "obstructing the field": "Obstructing the field",
      dismissed: "Dismissed",
    };
    return labels[value.toLowerCase()] || value.replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
  const score = (r) => {
    if (r.score && r.score !== "—") return r.score;
    if (["DNB", "TDNB"].includes(r.runs)) return r.runs;
    if (r.runs === null || r.runs === undefined || r.runs === "") return "—";
    return String(r.runs) + (r.notOut ? "*" : "");
  };

  // ---- Normalisation helpers (shared by match de-duplication and bowling lookup) ----
  // "India vs West Indies", "Ind v WI", "v West Indies", "West Indies" -> "west indies"
  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/^\s*(?:[a-z.]+(?:\s[a-z.]+)?\s+)?(?:vs\.?|v)\s+/, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizeGround = (value) =>
    String(value || "")
      .toLowerCase()
      .split(",")[0]
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizeUrl = (value) =>
    String(value || "")
      .toLowerCase()
      .split("#")[0]
      .split("?")[0]
      .replace(/\/+$/, "")
      .trim();
  const dayValue = (value) => {
    const ts = dateValue(value);
    return ts ? Math.floor(ts / 86400000) : 0;
  };
  // Two grounds are compatible when either is unknown, or one contains the other.
  const groundsCompatible = (a, b) => {
    const x = normalizeGround(a),
      y = normalizeGround(b);
    if (!x || !y) return true;
    return x === y || x.includes(y) || y.includes(x);
  };
  const isT20Overlap = (a, b) => (a === "T20I" && b === "T20") || (a === "T20" && b === "T20I");
  const rowQuality = (row) =>
    (row.matchUrl ? 8 : 0) +
    (row.source === "ESPNcricinfo Statsguru" ? 4 : 0) +
    (Number.isFinite(Number(row.balls)) && Number(row.balls) > 0 ? 3 : 0) +
    (row.score && row.score !== "—" ? 2 : 0) +
    (row.result ? 1 : 0);

  function render(data) {
    const all = Array.isArray(data.playerMatches) ? data.playerMatches.slice() : [];
    const formats = data.statsguru?.formats || {};
    for (const [fmt, entry] of Object.entries(formats)) {
      for (const r of Array.isArray(entry?.innings) ? entry.innings : [])
        all.push({ ...r, format: fmt });
    }
    // Match history is sourced from ESPNcricinfo Statsguru rows only.
    // Do not merge delivery-derived recentInnings data: it duplicates matches
    // and can omit scorecard details.

    // Rows that have no format label: borrow it from an explicitly labelled row of the
    // same match (same opposition, +/-1 day) so they are not shown a second time as "T20I".
    const labelled = all.filter((r) => r && r.format && r.date && r.opposition);
    for (const row of all) {
      if (!row || row.format || !row.date || !row.opposition) continue;
      const opp = normalizeText(row.opposition),
        day = dayValue(row.date);
      const twin = labelled.find(
        (l) => normalizeText(l.opposition) === opp && Math.abs(dayValue(l.date) - day) <= 1,
      );
      if (twin) row.format = twin.format;
    }

    // Keep raw per-format rows for format-specific last-match milestones.
    // The cross-format display list below intentionally collapses T20I/T20 duplicates.
    const milestoneMatches = all.filter((row) => row && row.date && row.opposition);

    const matches = [];
    for (const row of all) {
      if (!row) continue;
      const fmt = row.format || "T20I";
      const date = row.date || "";
      const opposition = row.opposition || "";
      const ground = row.ground || row.venue || "";
      if (!date || !opposition) continue;
      const normalizedOpposition = normalizeText(opposition);
      const day = dayValue(date);
      const url = normalizeUrl(row.matchUrl);
      const existingIndex = matches.findIndex((item) => {
        const previousFormat = item.format || "T20I";
        const overlap = isT20Overlap(previousFormat, fmt);
        const sameFormat = previousFormat === fmt;
        // Never merge different formats (e.g. FC vs List A), only the overlapping T20I/T20 feeds.
        if (!sameFormat && !overlap) return false;
        // Same format + both have a match link: the link decides.
        const itemUrl = normalizeUrl(item.matchUrl);
        if (sameFormat && url && itemUrl) return url === itemUrl;
        if (normalizeText(item.opposition) !== normalizedOpposition) return false;
        const dateDistance = Math.abs(day - dayValue(item.date));
        // Same-format rows must fall on the same day; the overlapping T20 feed may be
        // off by one day (timezone). Different grounds mean different matches.
        if (dateDistance > (overlap ? 1 : 0)) return false;
        return groundsCompatible(item.ground || item.venue, ground);
      });
      if (existingIndex < 0) {
        matches.push({ ...row, format: fmt, ground });
        continue;
      }
      const previous = matches[existingIndex];
      const preferred = rowQuality(row) > rowQuality(previous) ? row : previous;
      const merged = { ...previous, ...row, ...preferred };
      // Keep the canonical T20I label when the same international innings is
      // also present in the all-competitions T20 dataset.
      merged.format = previous.format === "T20I" || fmt === "T20I" ? "T20I" : fmt;
      merged.ground = preferred.ground || preferred.venue || ground || previous.ground;
      matches[existingIndex] = merged;
    }
    // Newest first; stable order for same-date rows.
    matches.sort((a, b) => dateValue(b.date) - dateValue(a.date));

    const milestones = $("player-match-milestones");
    if (milestones) {
      milestones.innerHTML =
        ["ODI", "T20I", "FC", "List A", "T20"]
          .map((fmt) => {
            const rows = milestoneMatches
              .filter((r) => r.format === fmt)
              .slice()
              .sort((a, b) => dateValue(a.date) - dateValue(b.date));
            const saved = data.playerMatchMilestones?.[fmt];
            const first = saved?.debut || rows[0];
            // Prefer the newest detailed row over a stale saved last-match value.
            const last = rows[rows.length - 1] || saved?.last;
            if (!first || !last) return "";
            return (
              '<article class="player-match-milestone"><b>' +
              esc(fmt) +
              " Matches</b><div><small>Debut</small><span>" +
              esc(first.opposition) +
              " · " +
              esc(prettyDate(first.date)) +
              "</span><em>" +
              esc(first.ground || "Ground unavailable") +
              "</em></div><div><small>Last</small><span>" +
              esc(last.opposition) +
              " · " +
              esc(prettyDate(last.date)) +
              "</span><em>" +
              esc(last.ground || "Ground unavailable") +
              "</em></div></article>"
            );
          })
          .join("") ||
        '<p class="activity-empty">Debut/last-match records will appear when verified Statsguru rows are available.</p>';
    }
    const sourceLabel = $("player-match-source");
    if (sourceLabel)
      sourceLabel.textContent =
        "Last updated: " +
        (data.playerMatchesUpdatedAt || data.statsguru?.updatedAt
          ? new Intl.DateTimeFormat("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }).format(new Date(data.playerMatchesUpdatedAt || data.statsguru.updatedAt)) + " IST"
          : "waiting for scheduled refresh");

    // Bowling lookup: same normalisation on both sides so figures actually match.
    const bowlKey = (fmt, date, opp, ground) =>
      [
        fmt,
        dayValue(date) || String(date || "").toLowerCase(),
        normalizeText(opp),
        normalizeGround(ground),
      ].join("|");
    const bowlMap = new Map();
    for (const [fmt, entry] of Object.entries(data.bowlingStats?.formats || {}))
      for (const b of Array.isArray(entry?.innings) ? entry.innings : []) {
        const fig = b.figures || (b.wickets ?? "—") + "/" + (b.runsConceded ?? "—");
        bowlMap.set(bowlKey(fmt, b.date, b.opposition, b.ground || b.venue), fig);
        bowlMap.set(bowlKey(fmt, b.date, b.opposition, ""), fig);
      }
    const findBowling = (r) => {
      const fmt = r.format || "T20I";
      const fmts = fmt === "T20I" ? ["T20I", "T20"] : fmt === "T20" ? ["T20", "T20I"] : [fmt];
      for (const f of fmts) {
        const hit =
          bowlMap.get(bowlKey(f, r.date, r.opposition, r.ground || r.venue)) ||
          bowlMap.get(bowlKey(f, r.date, r.opposition, ""));
        if (hit) return hit;
      }
      return undefined;
    };

    const selector = $("player-match-format");
    const yearSelector = $("player-match-year");
    const selected = selector?.value || "All";
    if (yearSelector) {
      const years = [
        ...new Set(
          matches
            .map((r) => {
              const ts = dateValue(r.date);
              return ts ? String(new Date(ts).getUTCFullYear()) : "";
            })
            .filter(Boolean),
        ),
      ].sort((a, b) => Number(b) - Number(a));
      const currentYear = yearSelector.value || "All";
      yearSelector.innerHTML =
        '<option value="All">All years</option>' +
        years
          .map((year) => '<option value="' + esc(year) + '">' + esc(year) + "</option>")
          .join("");
      yearSelector.value = years.includes(currentYear) ? currentYear : "All";
    }
    const selectedYear = yearSelector?.value || "All";
    const listed = matches.filter((r) => {
      const formatMatch = selected === "All" || r.format === selected;
      const ts = dateValue(r.date);
      const yearMatch =
        selectedYear === "All" || (ts && String(new Date(ts).getUTCFullYear()) === selectedYear);
      return formatMatch && yearMatch;
    });
    const formatValue = $("player-format-value");
    if (formatValue && selector)
      formatValue.textContent = selector.options[selector.selectedIndex]?.text || "All formats";
    const yearValue = $("player-year-value");
    if (yearValue && yearSelector)
      yearValue.textContent = yearSelector.options[yearSelector.selectedIndex]?.text || "All years";
    const table = $("player-matches-table");
    if (table)
      table.innerHTML = listed.length
        ? listed
            .map((r) => {
              const fmt = r.format || "T20I";
              return (
                "<tr><td>" +
                esc(r.opposition || "—") +
                "</td><td>" +
                esc(score(r)) +
                "</td><td>" +
                esc(displayStat(r.balls)) +
                "</td><td>" +
                esc(dismissal(r)) +
                "</td><td>" +
                esc(r.bowlingFigures || r.bowling || findBowling(r) || "—") +
                "</td><td>" +
                esc(prettyDate(r.date)) +
                "</td><td>" +
                esc(displayStat(r.fours)) +
                "</td><td>" +
                esc(displayStat(r.sixes)) +
                "</td><td>" +
                esc(r.ground || r.venue || "—") +
                "</td><td>" +
                esc(fmt) +
                "</td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="10" class="empty">No verified match rows are available for this format yet. Existing saved scorecards are preserved during refresh.</td></tr>';
  }
  let snapshot = null;
  const selector = $("player-match-format");
  const yearSelector = $("player-match-year");
  const backdrop = $("match-filter-backdrop");
  const options = $("match-filter-options");
  const dialogTitle = $("match-filter-dialog-title");
  let activeFilter = "format";
  let lastTrigger = null;
  let filterScrollY = 0;
  const triggers = {
    format: $("player-format-trigger"),
    year: $("player-year-trigger"),
  };
  const openFilter = (kind) => {
    if (!backdrop || !options) return;
    activeFilter = kind;
    lastTrigger = triggers[kind];
    const select = kind === "format" ? selector : yearSelector;
    if (!select) return;
    if (dialogTitle) dialogTitle.textContent = kind === "format" ? "Choose format" : "Choose year";
    options.innerHTML = Array.from(select.options)
      .map(
        (option) =>
          '<button type="button" class="match-filter-option' +
          (option.value === select.value ? " is-selected" : "") +
          '" data-filter-value="' +
          esc(option.value) +
          '" role="radio" aria-checked="' +
          (option.value === select.value ? "true" : "false") +
          '">' +
          '<span class="match-filter-option-copy"><strong>' +
          esc(option.textContent) +
          "</strong><small>" +
          (option.value === "All"
            ? kind === "format"
              ? "Show every format"
              : "Show every year"
            : kind === "format"
              ? "Filter by match format"
              : "Filter matches from " + esc(option.textContent)) +
          "</small></span>" +
          '<span class="match-filter-radio" aria-hidden="true"></span></button>',
      )
      .join("");
    // Freeze the document at its current scroll position. overflow:hidden alone
    // does not reliably prevent background scrolling on Android Chrome.
    filterScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = "-" + filterScrollY + "px";
    document.body.classList.add("match-filter-open");
    backdrop.hidden = false;
    triggers[kind]?.setAttribute("aria-expanded", "true");
    $("match-filter-close")?.focus();
  };
  const closeFilter = () => {
    if (!backdrop) return;
    backdrop.hidden = true;
    document.body.classList.remove("match-filter-open");
    document.body.style.top = "";
    window.scrollTo(0, filterScrollY);
    Object.values(triggers).forEach((trigger) => trigger?.setAttribute("aria-expanded", "false"));
    lastTrigger?.focus({ preventScroll: true });
  };
  Object.entries(triggers).forEach(([kind, trigger]) =>
    trigger?.addEventListener("click", () => openFilter(kind)),
  );
  options?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-filter-value]");
    if (!option) return;
    const select = activeFilter === "format" ? selector : yearSelector;
    if (!select) return;
    select.value = option.dataset.filterValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    closeFilter();
  });
  $("match-filter-close")?.addEventListener("click", closeFilter);
  $("match-filter-done")?.addEventListener("click", closeFilter);
  backdrop?.addEventListener("click", (event) => {
    if (event.target === backdrop) closeFilter();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && backdrop && !backdrop.hidden) closeFilter();
  });
  if (selector) selector.addEventListener("change", () => snapshot && render(snapshot));
  if (yearSelector) yearSelector.addEventListener("change", () => snapshot && render(snapshot));
  window.TilakSiteData.load()
    .then((d) => {
      snapshot = d;
      render(d);
    })
    .catch(() => {
      const table = $("player-matches-table");
      if (table)
        table.innerHTML =
          '<tr><td colspan="10" class="empty">Match history is temporarily unavailable.</td></tr>';
    });
})();
