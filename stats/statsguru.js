(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const formatIndiaTimestamp = (value) => {
    if (!value || /waiting for update|timestamp unavailable|saved snapshot/i.test(String(value)))
      return value || "timestamp unavailable";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(date) + " IST";
  };
  const fmt = (v) =>
    typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : (v ?? "—");
  const titles = {
    batting: "Batting career summary",
    matchlist: "T20I match list",
    innings: "Batting innings list",
    highscores: "High scores",
    battingseries: "Batting series averages",
    bowling: "Bowling career summary",
    bowlinginnings: "Bowling innings list",
    bowlingmatches: "Bowling match list",
    bestinningsbowling: "Best innings bowling",
    bestmatchbowling: "Best match bowling",
    bowlingseries: "Bowling series averages",
    fielding: "Fielding career summary",
    fieldinginnings: "Fielding innings list",
    mostcatches: "Most catches in an innings",
    fieldingseries: "Fielding series statistics",
  };
  const FILTER_LABELS = {
    all: "All-round / general",
    opposition: "Opposition",
    "home-away": "Home or away",
    country: "Host country / region",
    ground: "Ground",
    year: "Year",
    season: "Season",
    result: "Match result",
    position: "Batting position",
    innings: "Match innings",
    daynight: "Day / night",
    series: "Series / tournament",
  };
  const MONTHS = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  let youthOdiData = null;
  let selectedFormat = "T20I",
    selectedCategory = "batting",
    data = null,
    activeBreakdownFilter = "all",
    activeBreakdownValue = "all",
    appliedFrom = "",
    appliedTo = "",
    requestedScope = "all",
    requestedView = "batting";

  function metric(label, value) {
    return (
      '<div class="statsguru-metric"><span>' +
      esc(label.toUpperCase()) +
      "</span><strong>" +
      esc(fmt(value)) +
      "</strong></div>"
    );
  }
  function rowsTable(rows, headers, render, emptyText) {
    $("statsguru-thead").innerHTML =
      "<tr>" +
      headers
        .map(
          (h) =>
            "<th" +
            (String(h).toLowerCase() === "runs" ? ' class="sg-head-runs"' : "") +
            ">" +
            esc(h) +
            "</th>",
        )
        .join("") +
      "</tr>";
    $("statsguru-tbody").innerHTML = rows.length
      ? rows.map(render).join("")
      : '<tr><td colspan="' +
        headers.length +
        '" class="empty">' +
        esc(emptyText || "No verified Explore data rows match these filters.") +
        "</td></tr>";
  }
  function parseDate(value) {
    const s = String(value || "").trim();
    const direct = Date.parse(s);
    if (Number.isFinite(direct)) return direct;
    const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
    if (!m) return 0;
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return month === undefined ? 0 : Date.UTC(Number(m[3]), month, Number(m[1]));
  }
  function withInferredBalls(summary) {
    if (!summary || typeof summary !== "object") return summary;
    if (
      summary.balls == null &&
      typeof summary.runs === "number" &&
      typeof summary.strikeRate === "number" &&
      summary.runs >= 0 &&
      summary.strikeRate > 0
    ) {
      return {
        ...summary,
        balls: Math.round((summary.runs * 100) / summary.strikeRate),
        ballsInferred: true,
      };
    }
    return summary;
  }

  function sourceData() {
    const formats = data?.statsguru?.formats || {};
    const career = data?.careerFormats || {};
    const fallbackBuckets = {
      T20: career["Overall T20 (all competitions)"],
      FC: career["First-class"],
      "List A": career["List A"],
    };
    if (selectedFormat === "All") {
      // Sum only disjoint career buckets: Overall T20 already includes T20I/IPL,
      // and List A already includes ODI. Prefer the latest Statsguru summary,
      // but fall back to the saved career snapshot when a format summary is absent.
      const parts = ["T20", "FC", "List A"]
        .map((f) => {
          const saved = formats[f];
          const fallback = fallbackBuckets[f];
          const hasSummary = saved?.summary && typeof saved.summary === "object";
          if (hasSummary || fallback) {
            return {
              format: f,
              ...(saved || {}),
              summary: hasSummary ? saved.summary : fallback,
              innings: Array.isArray(saved?.innings) ? saved.innings : [],
              careerBreakdown: Array.isArray(saved?.careerBreakdown) ? saved.careerBreakdown : [],
            };
          }
          return null;
        })
        .filter(Boolean);
      const all = parts.flatMap((f) =>
        (Array.isArray(f.innings) ? f.innings : []).map((row) => ({
          ...row,
          format: row.format || f.format,
        })),
      );
      const summaries = parts.map((f) => withInferredBalls(f.summary)).filter(Boolean);
      const sum = (k) =>
        summaries.reduce((n, item) => n + (typeof item[k] === "number" ? item[k] : 0), 0);
      const best = summaries
        .map((item) => ({
          score: item.highestScore,
          n: Number.parseInt(String(item.highestScore || "").replace(/[^0-9]/g, ""), 10) || 0,
        }))
        .sort((a, b) => b.n - a.n)[0];
      const runs = sum("runs");
      const balls = summaries.every((item) => typeof item.balls === "number") ? sum("balls") : null;
      const inn = sum("innings");
      const no = sum("notOuts");
      const summary = summaries.length
        ? {
            matches: sum("matches"),
            innings: inn,
            notOuts: no,
            runs,
            highestScore: best?.score || "—",
            average: inn > no ? Math.round((runs / (inn - no)) * 100) / 100 : null,
            balls,
            ballsInferred: summaries.some((item) => item.ballsInferred === true),
            strikeRate: balls ? Math.round(((runs * 100) / balls) * 100) / 100 : null,
            hundreds: sum("hundreds"),
            fifties: sum("fifties"),
            fours: sum("fours"),
            sixes: sum("sixes"),
          }
        : null;
      return {
        summary,
        innings: all,
        breakdown: parts.flatMap((f) =>
          Array.isArray(f.careerBreakdown) ? f.careerBreakdown : [],
        ),
        formats,
      };
    }
    const entry = formats[selectedFormat] || {};
    const fallbackSummary =
      selectedFormat === "T20"
        ? career["Overall T20 (all competitions)"]
        : selectedFormat === "FC"
          ? career["First-class"]
          : selectedFormat === "List A"
            ? career["List A"]
            : selectedFormat === "T20I" || selectedFormat === "ODI" || selectedFormat === "IPL"
              ? career[selectedFormat]
              : null;
    const hasSavedSummary = entry.summary && typeof entry.summary === "object";
    return {
      summary: withInferredBalls(hasSavedSummary ? entry.summary : fallbackSummary || null),
      innings: Array.isArray(entry.innings) ? entry.innings : [],
      breakdown: Array.isArray(entry.careerBreakdown) ? entry.careerBreakdown : [],
      formats,
    };
  }
  function categoryForGroup(group) {
    const g = String(group || "")
      .trim()
      .toLowerCase();
    if (g === "overall") return "all";
    if (/^v\s+/.test(g)) return "opposition";
    if (["home", "away", "neutral"].includes(g)) return "home-away";
    if (/^in\s+/.test(g)) return "country";
    if (/^year\s+\d{4}$/.test(g)) return "year";
    if (/^season\s+/.test(g)) return "season";
    if (["won match", "lost match", "tied match", "no result"].includes(g)) return "result";
    if (/^\d+(st|nd|rd|th) position$/.test(g)) return "position";
    if (/match innings$/.test(g)) return "innings";
    if (["day match", "day/night match", "night match"].includes(g)) return "daynight";
    if (/series|tournament|cup|league|ipl|premier/.test(g)) return "series";
    return "other";
  }
  function groupOptions(source, type) {
    if (type === "all") return [{ value: "all", label: "All available values" }];
    if (type === "ground") {
      const grounds = [
        ...new Set(source.innings.map((r) => String(r.ground || "").trim()).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b));
      return [
        { value: "all", label: "All grounds" },
        ...grounds.map((g) => ({ value: g, label: g })),
      ];
    }
    let rows = source.breakdown.filter((r) => categoryForGroup(r.group) === type);
    if (type === "country")
      rows = rows.filter((r) => !/^in\s+(africa|americas|asia|europe|oceania)$/i.test(r.group));
    const opts = rows.map((r) => ({ value: r.group, label: r.group })).filter((x) => x.value);
    return [
      { value: "all", label: "All " + (FILTER_LABELS[type] || "values").toLowerCase() },
      ...opts.filter((x, i, a) => a.findIndex((y) => y.value === x.value) === i),
    ];
  }
  function syncFilterOptions() {
    const source = sourceData(),
      type = $("sg-filter-type"),
      value = $("sg-filter-value");
    if (!type || !value) return;
    const opts = groupOptions(source, type.value),
      previous = value.value;
    value.innerHTML = opts
      .map((o) => '<option value="' + esc(o.value) + '">' + esc(o.label) + "</option>")
      .join("");
    if (opts.some((o) => o.value === previous)) value.value = previous;
    activeBreakdownFilter = type.value;
    activeBreakdownValue = value.value;
  }
  function selectedGroup(source) {
    if (activeBreakdownFilter === "all" || activeBreakdownFilter === "ground") return null;
    return source.breakdown.find((r) => r.group === activeBreakdownValue) || null;
  }
  function breakdownRows(source) {
    let rows = source.breakdown.slice();
    if (activeBreakdownFilter !== "all" && activeBreakdownFilter !== "ground") {
      rows = rows.filter((r) => categoryForGroup(r.group) === activeBreakdownFilter);
      if (activeBreakdownValue !== "all")
        rows = rows.filter((r) => r.group === activeBreakdownValue);
    }
    return rows;
  }
  function inningsRows(source) {
    let rows = source.innings.slice();
    if (appliedFrom) {
      const min = Date.parse(appliedFrom + "T00:00:00Z");
      rows = rows.filter((r) => parseDate(r.date) >= min);
    }
    if (appliedTo) {
      const max = Date.parse(appliedTo + "T23:59:59Z");
      rows = rows.filter((r) => parseDate(r.date) <= max);
    }
    if (activeBreakdownFilter === "ground" && activeBreakdownValue !== "all")
      rows = rows.filter((r) => String(r.ground || "").trim() === activeBreakdownValue);
    if (activeBreakdownFilter === "opposition" && activeBreakdownValue !== "all")
      rows = rows.filter(
        (r) =>
          String(r.opposition || "")
            .toLowerCase()
            .replace(/^v\s*/, "") === activeBreakdownValue.toLowerCase().replace(/^v\s*/, ""),
      );
    if (activeBreakdownFilter === "year" && activeBreakdownValue !== "all")
      rows = rows.filter(
        (r) =>
          new Date(parseDate(r.date)).getUTCFullYear() ===
          Number(activeBreakdownValue.replace(/\D/g, "")),
      );
    return rows;
  }
  function renderSummary(source) {
    const type = activeBreakdownFilter,
      group = selectedGroup(source);
    let s = source.summary;
    if (type !== "all" && type !== "ground" && activeBreakdownValue !== "all" && group) {
      s = {
        matches: group.matches,
        innings: group.innings,
        notOuts: group.notOuts,
        runs: group.runs,
        highestScore: group.highestScore,
        average: group.average,
        balls: group.balls,
        strikeRate: group.strikeRate,
        hundreds: group.hundreds,
        fifties: group.fifties,
        fours: group.fours,
        sixes: group.sixes,
      };
    }
    if (type === "ground" || appliedFrom || appliedTo) {
      const matching = inningsRows(source),
        scored = matching.filter((r) => typeof r.runs === "number");
      const runs = scored.reduce((n, r) => n + r.runs, 0);
      const best = scored.reduce((b, r) => (!b || r.runs > b.runs ? r : b), null);
      $("statsguru-summary").innerHTML = [
        metric("MATCH ROWS", matching.length),
        metric("SCORED ROWS", scored.length),
        metric("RUNS IN LIST", runs),
        metric("BEST LISTED SCORE", best?.score || "—"),
      ].join("");
      return;
    }
    if (!s) {
      $("statsguru-summary").innerHTML = metric("STATUS", "Awaiting data");
      return;
    }
    $("statsguru-summary").innerHTML = [
      ["MATCHES", s.matches],
      ["INNINGS", s.innings],
      ["NOT OUTS", s.notOuts],
      ["RUNS", s.runs],
      ["HIGHEST", s.highestScore],
      ["AVERAGE", s.average],
      [s.ballsInferred ? "BALLS FACED (EST.)" : "BALLS FACED", s.balls],
      ["STRIKE RATE", s.strikeRate],
      ["HUNDREDS", s.hundreds],
      ["FIFTIES", s.fifties],
      ["FOURS", s.fours],
      ["SIXES", s.sixes],
    ]
      .map((x) => metric(x[0], x[1]))
      .join("");
    if (s.ballsInferred) {
      $("statsguru-note").textContent =
        "Warning: balls faced is estimated from runs and published strike rate because the source did not provide exact balls. Strike rate and any combined-format totals using this estimate are approximate, not verified ball-by-ball totals.";
    }
  }
  function renderAdditional(source) {
    const category = selectedCategory;
    const fmt = selectedFormat === "All" ? "T20" : selectedFormat;
    const bowlingRoot = data?.bowlingStats?.formats || {};
    const bowling = bowlingRoot[fmt] || {};
    const fieldRoot = data?.fieldingStats?.formats || data?.statsguru?.fieldingFormats || {};
    const field = fieldRoot[fmt] || {};
    const officialUrl =
      "https://www.espncricinfo.com/cricketers/tilak-varma-1170265/bowling-batting-stats";
    const link =
      '<p class="sg-data-unavailable">This category has no verified saved dataset yet. I have not filled it with guessed figures. <a href="' +
      officialUrl +
      '" target="_blank" rel="noopener">Open Tilak Varma’s ESPNcricinfo stats ↗</a></p>';
    const setPanel = (eyebrow, title, summary, headers, rows, empty) => {
      $("statsguru-eyebrow").textContent = eyebrow;
      $("statsguru-title").textContent = title;
      $("statsguru-summary").innerHTML = summary || "";
      if (headers && rows)
        rowsTable(
          rows,
          headers,
          (r) =>
            "<tr>" + headers.map((h) => "<td>" + esc(fmtValue(r[h])) + "</td>").join("") + "</tr>",
          empty,
        );
      else rowsTable([], ["STATUS"], () => "", empty || "No verified data available.");
    };
    const fmtValue = (v) => (v === null || v === undefined || v === "" ? "—" : v);
    const metrics = (pairs) => pairs.map((p) => metric(p[0], p[1])).join("");
    const bowlingRows = Array.isArray(bowling.innings) ? bowling.innings.slice() : [];
    const breakdown = Array.isArray(bowling.careerBreakdown) ? bowling.careerBreakdown.slice() : [];
    const sortBowling = (rows) =>
      rows.sort(
        (a, b) =>
          (Number(b.wickets) || 0) - (Number(a.wickets) || 0) ||
          (Number(a.runsConceded) || 999) - (Number(b.runsConceded) || 999),
      );
    const bowlingHeaders = [
      "DATE",
      "OPPOSITION",
      "FIGURES",
      "OVERS",
      "MAIDENS",
      "RUNS",
      "WICKETS",
      "ECONOMY",
      "GROUND",
      "SCORECARD",
    ];
    const bowlingRow = (r) =>
      "<tr><td>" +
      esc(r.date) +
      "</td><td>" +
      esc(r.opposition) +
      "</td><td>" +
      esc(r.figures || (r.wickets ?? "—") + "/" + (r.runsConceded ?? "—")) +
      "</td><td>" +
      esc(r.overs ?? "—") +
      "</td><td>" +
      esc(r.maidens ?? "—") +
      "</td><td>" +
      esc(r.runsConceded ?? "—") +
      "</td><td>" +
      esc(r.wickets ?? "—") +
      "</td><td>" +
      esc(r.economy ?? "—") +
      "</td><td>" +
      esc(r.ground ?? "—") +
      "</td><td>" +
      (r.matchUrl
        ? '<a class="sg-scorecard-link" href="' +
          esc(r.matchUrl) +
          '" target="_blank" rel="noopener">↗</a>'
        : "—") +
      "</td></tr>";
    if (
      category === "bowling" ||
      category === "bowlinginnings" ||
      category === "bowlingmatches" ||
      category === "bestinningsbowling" ||
      category === "bestmatchbowling" ||
      category === "bowlingseries"
    ) {
      $("statsguru-eyebrow").textContent = "BOWLING · " + selectedFormat.toUpperCase();
      $("statsguru-title").textContent = titles[category];
      $("statsguru-format-label").textContent =
        selectedFormat === "T20" ? "T20 · all competitions" : selectedFormat;
      const s = bowling.summary;
      if (!s) {
        $("statsguru-summary").innerHTML = metrics([
          ["STATUS", "Not available"],
          ["FORMAT", fmt],
        ]);
        rowsTable(
          [],
          ["STATUS"],
          () => "",
          "ESPNcricinfo’s saved snapshot does not currently expose this format’s bowling figures. Choose T20I, ODI or T20 when available.",
        );
        $("statsguru-note").textContent =
          "Bowling data is separate from the batting snapshot and is only displayed when verified.";
        return true;
      }
      $("statsguru-summary").innerHTML = metrics([
        ["MATCHES", s.matches],
        ["BOWLING INNINGS", s.innings],
        ["OVERS", s.overs],
        ["MAIDENS", s.maidens],
        ["RUNS CONCEDED", s.runsConceded],
        ["WICKETS", s.wickets],
        ["AVERAGE", s.average],
        ["ECONOMY", s.economy],
        ["STRIKE RATE", s.strikeRate],
        ["BEST FIGURES", s.bestBowling],
        ["4-WICKET HAULS", s.fourWicketHauls],
        ["5-WICKET HAULS", s.fiveWicketHauls],
      ]);
      if (category === "bowling") {
        const grouped = breakdown.filter((r) =>
          /series|tournament|cup|league|ipl|premier/i.test(String(r.group || "")),
        );
        const list = category === "bowling" && grouped.length ? grouped : breakdown;
        rowsTable(
          list,
          [
            "group",
            "span",
            "matches",
            "innings",
            "overs",
            "maidens",
            "runsConceded",
            "wickets",
            "average",
            "economy",
            "strikeRate",
            "bestBowling",
          ].map(
            (x) =>
              ({
                group: "GROUP / FILTER",
                span: "SPAN",
                matches: "MATCHES",
                innings: "INNINGS",
                overs: "OVERS",
                maidens: "MAIDENS",
                runsConceded: "RUNS",
                wickets: "WICKETS",
                average: "AVERAGE",
                economy: "ECONOMY",
                strikeRate: "STRIKE RATE",
                bestBowling: "BEST",
              })[x],
          ),
          (r) =>
            "<tr>" +
            [
              r.group,
              r.span,
              r.matches,
              r.innings,
              r.overs,
              r.maidens,
              r.runsConceded,
              r.wickets,
              r.average,
              r.economy,
              r.strikeRate,
              r.bestBowling,
            ]
              .map((v) => "<td>" + esc(v ?? "—") + "</td>")
              .join("") +
            "</tr>",
          "No grouped bowling breakdown is available for this format.",
        );
      } else if (category === "bowlingseries") {
        const list = breakdown.filter((r) =>
          /series|tournament|cup|league|ipl|premier/i.test(String(r.group || "")),
        );
        rowsTable(
          list,
          [
            "GROUP / SERIES",
            "SPAN",
            "MATCHES",
            "INNINGS",
            "OVERS",
            "RUNS",
            "WICKETS",
            "AVERAGE",
            "ECONOMY",
            "STRIKE RATE",
            "BEST",
          ],
          (r) =>
            "<tr>" +
            [
              r.group,
              r.span,
              r.matches,
              r.innings,
              r.overs,
              r.runsConceded,
              r.wickets,
              r.average,
              r.economy,
              r.strikeRate,
              r.bestBowling,
            ]
              .map((v) => "<td>" + esc(v ?? "—") + "</td>")
              .join("") +
            "</tr>",
          "No verified series-specific bowling rows are saved yet.",
        );
      } else {
        let list = bowlingRows.slice();
        if (category === "bestinningsbowling" || category === "bestmatchbowling")
          list = sortBowling(list);
        else list.sort((a, b) => parseDate(b.date) - parseDate(a.date));
        rowsTable(
          list,
          bowlingHeaders,
          bowlingRow,
          "No verified bowling innings match this format.",
        );
      }
      $("statsguru-note").textContent =
        "Source: ESPNcricinfo Statsguru. Updated " +
        formatIndiaTimestamp(data.bowlingStats?.updatedAt || "timestamp unavailable") +
        ". Missing figures are not estimated.";
      return true;
    }
    if (
      category === "fielding" ||
      category === "fieldinginnings" ||
      category === "mostcatches" ||
      category === "fieldingseries"
    ) {
      $("statsguru-eyebrow").textContent = "FIELDING · " + selectedFormat.toUpperCase();
      $("statsguru-title").textContent = titles[category];
      $("statsguru-format-label").textContent =
        selectedFormat === "T20" ? "T20 · all competitions" : selectedFormat;
      const summary = field.summary || {};
      const fieldRows = Array.isArray(field.innings) ? field.innings.slice() : [];
      const fieldBreakdown = Array.isArray(field.careerBreakdown)
        ? field.careerBreakdown.slice()
        : [];
      if (!Object.keys(summary).length && !fieldRows.length && !fieldBreakdown.length) {
        $("statsguru-summary").innerHTML = metrics([
          ["STATUS", "Awaiting verified feed"],
          ["FORMAT", fmt],
        ]);
        rowsTable(
          [],
          ["FIELDING DATA"],
          () => "",
          "Fielding career/innings/series data is not present in the saved Statsguru snapshot yet.",
        );
        $("statsguru-note").innerHTML = "Fielding data is not guessed. " + link;
        return true;
      }
      $("statsguru-summary").innerHTML = metrics([
        ["MATCHES", summary.matches],
        ["CATCHES", summary.catches],
        ["STUMPINGS", summary.stumpings],
        ["RUN OUTS", summary.runOuts],
        ["DISMISSALS", summary.dismissals],
      ]);
      if (category === "fielding")
        rowsTable(
          fieldBreakdown,
          ["GROUP / FILTER", "SPAN", "MATCHES", "CATCHES", "STUMPINGS", "RUN OUTS", "DISMISSALS"],
          (r) =>
            "<tr>" +
            [r.group, r.span, r.matches, r.catches, r.stumpings, r.runOuts, r.dismissals]
              .map((v) => "<td>" + esc(v ?? "—") + "</td>")
              .join("") +
            "</tr>",
          "No verified fielding career breakdown rows.",
        );
      else if (category === "fieldingseries") {
        const seriesRows = fieldBreakdown.filter((r) =>
          /series|tournament|cup|league|ipl|premier|world cup|asia cup/i.test(
            String(r.group || ""),
          ),
        );
        rowsTable(
          seriesRows,
          [
            "SERIES / TOURNAMENT",
            "SPAN",
            "MATCHES",
            "CATCHES",
            "STUMPINGS",
            "RUN OUTS",
            "DISMISSALS",
          ],
          (r) =>
            "<tr>" +
            [r.group, r.span, r.matches, r.catches, r.stumpings, r.runOuts, r.dismissals]
              .map((v) => "<td>" + esc(v ?? "—") + "</td>")
              .join("") +
            "</tr>",
          "No verified fielding series rows are present in this format.",
        );
      } else {
        let list = fieldRows;
        if (category === "mostcatches")
          list = list.slice().sort((a, b) => (Number(b.catches) || 0) - (Number(a.catches) || 0));
        else list = list.slice().sort((a, b) => parseDate(b.date) - parseDate(a.date));
        rowsTable(
          list,
          [
            "DATE",
            "OPPOSITION",
            "GROUND",
            "CATCHES",
            "STUMPINGS",
            "RUN OUTS",
            "INNINGS",
            "SCORECARD",
          ],
          (r) =>
            "<tr>" +
            [r.date, r.opposition, r.ground, r.catches, r.stumpings, r.runOuts, r.innings]
              .map((v) => "<td>" + esc(v ?? "—") + "</td>")
              .join("") +
            (r.matchUrl
              ? '<td><a href="' + esc(r.matchUrl) + '" target="_blank" rel="noopener">↗</a></td>'
              : "<td>—</td>") +
            "</tr>",
          "No verified fielding innings/series data is saved.",
        );
      }
      $("statsguru-note").textContent =
        "Fielding values are shown only when a verified fielding dataset is available.";
      return true;
    }
    if (category === "battingseries") {
      $("statsguru-eyebrow").textContent = "BATTING · SERIES AVERAGES";
      $("statsguru-title").textContent = titles[category];
      const list = source.breakdown.filter((r) =>
        /series|tournament|cup|league|ipl|premier/i.test(String(r.group || "")),
      );
      if (!list.length) {
        $("statsguru-summary").innerHTML = metrics([
          ["STATUS", "No series rows"],
          ["FORMAT", selectedFormat],
        ]);
        rowsTable(
          [],
          ["SERIES"],
          () => "",
          "No verified batting series averages are present in this saved format.",
        );
      } else {
        $("statsguru-summary").innerHTML = metrics([
          ["SERIES ROWS", list.length],
          ["MATCHES", list.reduce((n, r) => n + (Number(r.matches) || 0), 0)],
          ["RUNS", list.reduce((n, r) => n + (Number(r.runs) || 0), 0)],
        ]);
        rowsTable(
          list,
          [
            "GROUP / SERIES",
            "SPAN",
            "MATCHES",
            "INNINGS",
            "RUNS",
            "HIGH SCORE",
            "AVERAGE",
            "STRIKE RATE",
            "100s",
            "50s",
          ],
          (r) =>
            "<tr>" +
            [
              r.group,
              r.span,
              r.matches,
              r.innings,
              r.runs,
              r.highestScore,
              r.average,
              r.strikeRate,
              r.hundreds,
              r.fifties,
            ]
              .map((v) => "<td>" + esc(v ?? "—") + "</td>")
              .join("") +
            "</tr>",
          "No verified batting series averages.",
        );
      }
      $("statsguru-note").textContent =
        "Series rows are filtered from the saved ESPNcricinfo career breakdown; rows are not invented.";
      return true;
    }
    return false;
  }
  function renderYouthOdi() {
    if (!youthOdiData) {
      $("statsguru-summary").innerHTML = metric("STATUS", "Loading Youth ODI data…");
      rowsTable([], ["STATUS"], () => "", "Youth ODI data is loading.");
      $("statsguru-note").textContent = "Loading verified ICC Under-19 World Cup 2020 data…";
      return true;
    }
    const summary = youthOdiData.summary || {};
    const career = youthOdiData.careerSummary || {};
    const fmtYouth = (v) => (v === null || v === undefined || v === "" ? "—" : v);
    $("statsguru-summary").innerHTML =
      '<section class="sg-youth-career"><h3>Youth ODI Career Summary</h3><p class="sg-youth-subtitle">Statsguru career totals across 23 matches.</p><div class="sg-youth-metrics">' +
      [
        ["MATCHES", career.matches],
        ["RUNS", career.runs],
        ["HIGHEST SCORE", career.highestScore],
        ["BATTING AVERAGE", career.battingAverage],
        ["100s", career.hundreds],
        ["WICKETS", career.wickets],
        ["BEST BOWLING", career.bestBowling],
        ["BOWLING AVERAGE", career.bowlingAverage],
        ["CATCHES", career.catches],
        ["STUMPINGS", career.stumpings],
        ["5-WICKET HAULS", career.fiveWicketHauls],
        ["AVERAGE DIFFERENCE", career.averageDifference],
      ]
        .map(([label, value]) => metric(label, fmtYouth(value)))
        .join("") +
      '</div><h3>Career Breakdown</h3><div class="sg-youth-breakdown-wrap"><table class="sg-youth-breakdown"><thead><tr><th>GROUP</th><th>MAT</th><th>RUNS</th><th>HS</th><th>BAT AV</th><th>100</th><th>WKTS</th><th>BBI</th><th>BOWL AV</th><th>CT</th><th>ST</th></tr></thead><tbody>' +
      (youthOdiData.careerBreakdown || [])
        .filter((r) => r.group !== "overall")
        .map(
          (r) =>
            "<tr>" +
            [
              r.group,
              r.matches,
              r.runs,
              r.highestScore,
              r.battingAverage,
              r.hundreds,
              r.wickets,
              r.bestBowling,
              r.bowlingAverage,
              r.catches,
              r.stumpings,
            ]
              .map((v) => "<td>" + esc(fmtYouth(v)) + "</td>")
              .join("") +
            "</tr>",
        )
        .join("") +
      '</tbody></table></div>';

    let records;
    if (selectedCategory === "innings" || selectedCategory === "highscores") {
      records = (youthOdiData.innings || []).slice();
      if (selectedCategory === "highscores")
        records.sort((a, b) => (Number(b.runs) || 0) - (Number(a.runs) || 0));
    } else {
      records = (youthOdiData.matches || []).slice();
    }
    if (appliedFrom) {
      const min = Date.parse(appliedFrom + "T00:00:00Z");
      records = records.filter((r) => parseDate(r.date) >= min);
    }
    if (appliedTo) {
      const max = Date.parse(appliedTo + "T23:59:59Z");
      records = records.filter((r) => parseDate(r.date) <= max);
    }
    if (activeBreakdownFilter === "opposition" && activeBreakdownValue !== "all") {
      records = records.filter((r) =>
        String(r.opposition || "")
          .toLowerCase()
          .includes(activeBreakdownValue.toLowerCase()),
      );
    }
    if (activeBreakdownFilter === "ground" && activeBreakdownValue !== "all") {
      records = records.filter((r) => String(r.ground || "") === activeBreakdownValue);
    }
    const matchList = selectedCategory !== "innings" && selectedCategory !== "highscores";
    if (matchList) {
      rowsTable(
        records,
        [
          "DATE",
          "OPPOSITION",
          "BATTING STATUS",
          "RUNS",
          "BALLS",
          "4s",
          "6s",
          "STRIKE RATE",
          "RESULT",
          "SCORECARD",
        ],
        (r) => {
          const batted = r.battingStatus === "batted";
          return (
            "<tr>" +
            "<td>" +
            esc(r.date) +
            "</td>" +
            "<td>" +
            esc(r.opposition) +
            "</td>" +
            "<td>" +
            (batted ? "Batted" : "Did not bat") +
            "</td>" +
            "<td>" +
            esc(batted ? r.runs : "—") +
            "</td>" +
            "<td>" +
            esc(batted ? r.balls : "—") +
            "</td>" +
            "<td>" +
            esc(
              batted
                ? ((youthOdiData.innings || []).find((i) => i.date === r.date)?.fours ?? "—")
                : "—",
            ) +
            "</td>" +
            "<td>" +
            esc(
              batted
                ? ((youthOdiData.innings || []).find((i) => i.date === r.date)?.sixes ?? "—")
                : "—",
            ) +
            "</td>" +
            "<td>" +
            esc(
              batted
                ? ((youthOdiData.innings || []).find((i) => i.date === r.date)?.strikeRate ?? "—")
                : "—",
            ) +
            "</td>" +
            "<td>" +
            esc(r.result || "—") +
            "</td>" +
            "<td>" +
            (r.matchUrl
              ? '<a class="sg-scorecard-link" href="' +
                esc(r.matchUrl) +
                '" target="_blank" rel="noopener">↗</a>'
              : "—") +
            "</td>" +
            "</tr>"
          );
        },
        "No Youth ODI matches match the selected filters.",
      );
    } else {
      rowsTable(
        records,
        [
          "DATE",
          "SCORE",
          "BALLS",
          "4s",
          "6s",
          "STRIKE RATE",
          "DISMISSAL",
          "OPPOSITION",
          "GROUND",
          "SCORECARD",
        ],
        (r) =>
          "<tr><td>" +
          esc(r.date) +
          "</td><td>" +
          esc(r.score || r.runs) +
          "</td><td>" +
          esc(r.balls) +
          "</td><td>" +
          esc(r.fours) +
          "</td><td>" +
          esc(r.sixes) +
          "</td><td>" +
          esc(r.strikeRate) +
          "</td><td>" +
          esc(r.dismissal) +
          "</td><td>" +
          esc(r.opposition) +
          "</td><td>" +
          esc(r.ground) +
          '</td><td><a class="sg-scorecard-link" href="' +
          esc(r.matchUrl) +
          '" target="_blank" rel="noopener">↗</a></td></tr>',
        "No Youth ODI batting innings match the selected filters.",
      );
    }
    $("statsguru-note").textContent =
      "Youth ODI career totals and career breakdown are shown above. Match-by-match records currently include the six verified ICC Under-19 World Cup 2020 matches; additional Youth ODI records can be added as they are verified.";
    const status = $("sg-filter-status");
    if (status)
      status.textContent =
        "Youth ODI · " + records.length + (matchList ? " matches" : " batting innings");
    return true;
  }

  function render() {
    if (!data) return;
    const sg = data.statsguru || {},
      source = sourceData(),
      rows = source.innings.slice();
    const stamp = formatIndiaTimestamp(sg.updatedAt || "Waiting for update");
    $("statsguru-updated").textContent = "LAST UPDATE: " + stamp;
    $("statsguru-format-label").textContent =
      selectedFormat === "T20" ? "T20 · all competitions" : selectedFormat;
    $("statsguru-title").textContent = titles[selectedCategory] || "Player analysis";
    $("statsguru-eyebrow").textContent =
      selectedCategory === "batting"
        ? "CAREER OVERVIEW"
        : selectedCategory.toUpperCase() + " · " + selectedFormat.toUpperCase();
    document
      .querySelectorAll("[data-sg-format]")
      .forEach((b) => b.classList.toggle("active", b.dataset.sgFormat === selectedFormat));
    document
      .querySelectorAll("[data-sg-category]")
      .forEach((b) => b.classList.toggle("active", b.dataset.sgCategory === selectedCategory));
    const allFormatsSelected = selectedFormat === "All";
    const categoryGrid = document.querySelector(".statsguru-category-grid");
    const analysisPanel = document.querySelector(".statsguru-panel");
    const analysisMenu = document.querySelector(".player-analysis-filter");
    const detailTable = document.querySelector(".statsguru-panel .table-wrap");
    const detailNote = $("statsguru-note");
    const summaryUpdate = document.querySelector(".statsguru-panel .statsguru-panel-head");
    if (categoryGrid) categoryGrid.style.display = allFormatsSelected ? "none" : "";
    if (analysisPanel) analysisPanel.style.display = "";
    if (analysisMenu) analysisMenu.style.display = allFormatsSelected ? "none" : "";
    if (detailTable) detailTable.style.display = allFormatsSelected ? "none" : "";
    if (detailNote) {
      detailNote.style.display = allFormatsSelected ? "" : "";
      if (allFormatsSelected) {
        const stamp = formatIndiaTimestamp(data?.statsguru?.updatedAt || "timestamp unavailable");
        const allSource = sourceData();
        detailNote.textContent =
          "LAST UPDATE: " +
          stamp +
          (allSource.summary?.ballsInferred
            ? " Overall-format strike rate is approximate because at least one source format did not provide balls faced; missing balls were estimated from its published strike rate."
            : "");
      }
    }
    if (selectedFormat === "Youth ODI" && renderYouthOdi()) return;
    const type = activeBreakdownFilter,
      value = activeBreakdownValue,
      group = selectedGroup(source);
    const unsupportedViews = {
      cumulative: "Cumulative averages",
      results: "Match results",
      reverse: "Reverse cumulative",
      awards: "Match awards",
      seriesawards: "Series awards",
      ground: "Ground averages",
    };
    if (unsupportedViews[requestedView]) {
      $("statsguru-summary").innerHTML = metric("VIEW", unsupportedViews[requestedView]);
      rowsTable(
        [],
        ["STATUS"],
        () => "",
        "This ESPNcricinfo view is selected, but a verified saved table for it is not currently available. Other supported views continue to use the saved source data.",
      );
      $("statsguru-note").textContent =
        "No figures have been estimated. The selected format and filters remain available; this view will populate when the source returns verified rows.";
      const status = $("sg-filter-status");
      if (status)
        status.textContent =
          unsupportedViews[requestedView] + " · verified source rows not available";
      return;
    }
    if (renderAdditional(source)) {
      const status = $("sg-filter-status");
      if (status)
        status.textContent =
          "Explore category: " +
          (titles[selectedCategory] || selectedCategory) +
          " · " +
          formatIndiaTimestamp(data.statsguru?.updatedAt || "saved snapshot");
      return;
    }
    renderSummary(source);
    const status = $("sg-filter-status");
    if (status) {
      let text =
        type === "all"
          ? "Showing the complete saved career breakdown"
          : (FILTER_LABELS[type] || type) +
            ": " +
            (value === "all" ? "all available values" : value);
      if (appliedFrom || appliedTo)
        text += " · date range " + (appliedFrom || "earliest") + " to " + (appliedTo || "latest");
      status.textContent =
        text + " · " + formatIndiaTimestamp(sg.updatedAt || "snapshot timestamp unavailable");
    }
    if (
      selectedCategory === "batting" ||
      selectedCategory === "innings" ||
      selectedCategory === "matchlist" ||
      selectedCategory === "highscores"
    ) {
      if (
        selectedCategory === "innings" ||
        selectedCategory === "matchlist" ||
        selectedCategory === "highscores" ||
        type === "ground" ||
        appliedFrom ||
        appliedTo
      ) {
        const listed = inningsRows(source).sort((a, b) =>
          selectedCategory === "highscores"
            ? (Number(b.runs) || -1) - (Number(a.runs) || -1)
            : parseDate(b.date) - parseDate(a.date),
        );
        const rowRender = (r) =>
          "<tr>" +
          '<td class="sg-cell-date">' +
          esc(r.date) +
          "</td>" +
          '<td class="sg-cell-runs">' +
          esc(r.score || "—") +
          "</td>" +
          '<td class="sg-cell-minutes">' +
          esc(r.minutes ?? "—") +
          "</td>" +
          '<td class="sg-cell-balls">' +
          esc(r.balls ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.fours ?? "—") +
          "</td><td>" +
          esc(r.sixes ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.strikeRate ?? "—") +
          "</td><td>" +
          esc(r.position ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.dismissal ?? "—") +
          "</td><td>" +
          esc(r.innings ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.opposition || "—") +
          "</td><td>" +
          esc(r.ground || "—") +
          "</td>" +
          (r.matchUrl
            ? '<td><a class="sg-scorecard-link" href="' +
              esc(r.matchUrl) +
              '" target="_blank" rel="noopener">↗</a></td>'
            : "<td>—</td>") +
          "</tr>";
        rowsTable(
          listed,
          [
            "DATE",
            "RUNS",
            "MINS",
            "BALLS",
            "4s",
            "6s",
            "SR",
            "POS",
            "DISMISSAL",
            "INNS",
            "OPPOSITION",
            "GROUND",
            "CARD",
          ],
          rowRender,
          "No verified innings match this ground/date filter.",
        );
      } else {
        const rowsToShow = breakdownRows(source);
        rowsTable(
          rowsToShow,
          [
            "GROUP / FILTER",
            "SPAN",
            "MATCHES",
            "INNINGS",
            "NOT OUT",
            "RUNS",
            "HIGH SCORE",
            "AVERAGE",
            "BALLS",
            "STRIKE RATE",
            "100s",
            "50s",
            "DUCKS",
            "4s",
            "6s",
          ],
          (r) =>
            "<tr>" +
            [
              r.group,
              r.span,
              r.matches,
              r.innings,
              r.notOuts,
              r.runs,
              r.highestScore,
              r.average,
              r.balls,
              r.strikeRate,
              r.hundreds,
              r.fifties,
              r.ducks,
              r.fours,
              r.sixes,
            ]
              .map((v) => "<td>" + esc(fmt(v)) + "</td>")
              .join("") +
            "</tr>",
          "No verified career-breakdown rows exist for this filter in the selected format.",
        );
      }
    } else {
      let listed = inningsRows(source);
      if (selectedCategory === "highscores")
        listed.sort(
          (a, b) =>
            (typeof b.runs === "number" ? b.runs : -1) - (typeof a.runs === "number" ? a.runs : -1),
        );
      else listed.sort((a, b) => parseDate(b.date) - parseDate(a.date));
      if (
        ["home-away", "country", "result", "position", "innings", "daynight", "series"].includes(
          type,
        )
      ) {
        const filteredGroup = group;
        if (filteredGroup) {
          $("statsguru-summary").innerHTML = [
            metric("MATCHES", filteredGroup.matches),
            metric("INNINGS", filteredGroup.innings),
            metric("RUNS", filteredGroup.runs),
            metric("AVERAGE", filteredGroup.average),
          ].join("");
          rowsTable(
            [filteredGroup],
            [
              "GROUP / FILTER",
              "SPAN",
              "MATCHES",
              "INNINGS",
              "NOT OUT",
              "RUNS",
              "HIGH SCORE",
              "AVERAGE",
              "BALLS",
              "STRIKE RATE",
              "100s",
              "50s",
              "DUCKS",
              "4s",
              "6s",
            ],
            (r) =>
              "<tr>" +
              [
                r.group,
                r.span,
                r.matches,
                r.innings,
                r.notOuts,
                r.runs,
                r.highestScore,
                r.average,
                r.balls,
                r.strikeRate,
                r.hundreds,
                r.fifties,
                r.ducks,
                r.fours,
                r.sixes,
              ]
                .map((v) => "<td>" + esc(fmt(v)) + "</td>")
                .join("") +
              "</tr>",
          );
        } else {
          rowsTable(
            [],
            ["DATE", "SCORE", "OPPOSITION", "GROUND"],
            () => "",
            "This filter is available as an aggregate Explore breakdown. Switch to Career summary to explore the matching totals.",
          );
        }
      } else {
        const rowRender = (r) =>
          "<tr>" +
          '<td class="sg-cell-date">' +
          esc(r.date) +
          "</td>" +
          '<td class="sg-cell-runs">' +
          esc(r.score || "—") +
          "</td>" +
          '<td class="sg-cell-minutes">' +
          esc(r.minutes ?? "—") +
          "</td>" +
          '<td class="sg-cell-balls">' +
          esc(r.balls ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.fours ?? "—") +
          "</td><td>" +
          esc(r.sixes ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.strikeRate ?? "—") +
          "</td><td>" +
          esc(r.position ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.dismissal ?? "—") +
          "</td><td>" +
          esc(r.innings ?? "—") +
          "</td>" +
          "<td>" +
          esc(r.opposition || "—") +
          "</td><td>" +
          esc(r.ground || "—") +
          "</td>" +
          (r.matchUrl
            ? '<td><a class="sg-scorecard-link" href="' +
              esc(r.matchUrl) +
              '" target="_blank" rel="noopener">↗</a></td>'
            : "<td>—</td>") +
          "</tr>";
        rowsTable(
          listed,
          [
            "DATE",
            "RUNS",
            "MINS",
            "BALLS",
            "4s",
            "6s",
            "SR",
            "POS",
            "DISMISSAL",
            "INNS",
            "OPPOSITION",
            "GROUND",
            "CARD",
          ],
          rowRender,
          "No verified innings match the selected filters.",
        );
      }
    }
    const note = $("statsguru-note");
    const domesticSummaryOnly =
      (selectedFormat === "FC" && !sg.formats?.FC?.summary) ||
      (selectedFormat === "List A" && !sg.formats?.["List A"]?.summary);
    note.textContent =
      selectedFormat === "All"
        ? "LAST UPDATE: " + formatIndiaTimestamp(sg.updatedAt || "timestamp unavailable")
        : domesticSummaryOnly
          ? "Domestic career summary from the saved profile snapshot. ESPNcricinfo Statsguru has not returned verified match-by-match rows for this format yet; those rows are not fabricated. "
          : "LAST UPDATE: " + formatIndiaTimestamp(sg.updatedAt || "timestamp unavailable");
  }
  function resetFilters() {
    $("sg-filter-type").value = "all";
    appliedFrom = "";
    appliedTo = "";
    $("sg-date-from").value = "";
    $("sg-date-to").value = "";
    syncFilterOptions();
    $("sg-filter-value").value = "all";
    activeBreakdownFilter = "all";
    activeBreakdownValue = "all";
    render();
  }
  document.querySelectorAll("[data-sg-format]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedFormat = b.dataset.sgFormat;
      syncFilterOptions();
      render();
    }),
  );
  document.querySelectorAll("[data-sg-category]").forEach((b) =>
    b.addEventListener("click", () => {
      selectedCategory = b.dataset.sgCategory;
      requestedScope = selectedCategory.startsWith("bowling")
        ? "bowling"
        : selectedCategory.startsWith("fielding") || selectedCategory === "mostcatches"
          ? "fielding"
          : "batting";
      requestedView = ["innings", "bowlinginnings", "fieldinginnings"].includes(selectedCategory)
        ? "innings"
        : ["matchlist", "bowlingmatches"].includes(selectedCategory)
          ? "matchlist"
          : ["battingseries", "bowlingseries", "fieldingseries"].includes(selectedCategory)
            ? "series"
            : "batting";
      document.querySelectorAll('input[name="sg-analysis-scope"]').forEach((radio) => {
        radio.checked = radio.value === requestedScope;
      });
      document.querySelectorAll('input[name="sg-analysis-view"]').forEach((radio) => {
        radio.checked = radio.value === requestedView;
      });
      render();
    }),
  );
  $("sg-filter-type").addEventListener("change", () => {
    syncFilterOptions();
    render();
  });
  $("sg-filter-value").addEventListener("change", () => {
    activeBreakdownFilter = $("sg-filter-type").value;
    activeBreakdownValue = $("sg-filter-value").value;
    render();
  });
  $("sg-apply-filter").addEventListener("click", () => {
    const nextFilter = $("sg-filter-type").value;
    const nextValue = $("sg-filter-value").value;
    const nextFrom = $("sg-date-from").value;
    const nextTo = $("sg-date-to").value;
    if (nextFrom && nextTo && nextFrom > nextTo) {
      $("sg-filter-status").textContent = "Start date must be on or before the ending date.";
      return;
    }
    if ((nextFrom || nextTo) && !["all", "ground", "opposition", "year"].includes(nextFilter)) {
      $("sg-filter-status").textContent =
        "Date range works with All-round/general, Opposition, Ground or Year filters. Choose one of those categories or clear the dates.";
      return;
    }
    activeBreakdownFilter = nextFilter;
    activeBreakdownValue = nextValue;
    appliedFrom = nextFrom;
    appliedTo = nextTo;
    render();
  });
  $("sg-reset-filter").addEventListener("click", resetFilters);
  const viewCategory = () => {
    const maps = {
      all: {
        batting: "batting",
        innings: "innings",
        matchlist: "matchlist",
        series: "battingseries",
      },
      batting: {
        batting: "batting",
        innings: "innings",
        matchlist: "matchlist",
        series: "battingseries",
      },
      bowling: {
        batting: "bowling",
        innings: "bowlinginnings",
        matchlist: "bowlingmatches",
        series: "bowlingseries",
      },
      fielding: {
        batting: "fielding",
        innings: "fieldinginnings",
        matchlist: "fieldinginnings",
        series: "fieldingseries",
      },
    };
    return maps[requestedScope]?.[requestedView] || "batting";
  };
  document.querySelectorAll('input[name="sg-analysis-scope"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      requestedScope = radio.value;
      selectedCategory = viewCategory();
      render();
    });
  });
  document.querySelectorAll('input[name="sg-analysis-view"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      requestedView = radio.value;
      selectedCategory = viewCategory();
      render();
    });
  });
  Promise.all([
    window.TilakSiteData.load(),
    window.TilakListAData?.ready || Promise.resolve(null),
    fetch("/data/youth-odi.json?v=20261018-u19-world-cup", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Youth ODI JSON request failed: " + response.status);
        return response.json();
      })
      .then((payload) => {
        if (
          payload?.format !== "Youth ODI" ||
          !Array.isArray(payload.matches) ||
          !Array.isArray(payload.innings) ||
          !payload.summary
        ) {
          throw new Error("Youth ODI JSON has an invalid schema");
        }
        return payload;
      })
      .catch((error) => {
        console.error("Youth ODI stats could not be loaded:", error);
        return null;
      }),
  ])
    .then(([d, listA, youthOdi]) => {
      youthOdiData = youthOdi;
      data = d;
      if (listA) {
        data.statsguru = data.statsguru || {};
        data.statsguru.formats = data.statsguru.formats || {};
        data.statsguru.formats["List A"] = {
          summary: listA.summary || null,
          innings: Array.isArray(listA.innings) ? listA.innings : [],
          careerBreakdown: Array.isArray(listA.careerBreakdown) ? listA.careerBreakdown : [],
          bowlingInnings: Array.isArray(listA.bowlingInnings) ? listA.bowlingInnings : [],
          fieldingInnings: Array.isArray(listA.fieldingInnings) ? listA.fieldingInnings : [],
          source: listA.source,
          pilotScope: listA.scope,
        };
      }
      syncFilterOptions();
      render();
    })
    .catch(() => {
      $("statsguru-updated").textContent = "Explore data is temporarily unavailable";
      $("statsguru-tbody").innerHTML =
        '<tr><td colspan="4" class="empty">Explore data is temporarily unavailable. Please try again later.</td></tr>';
    });
})();
