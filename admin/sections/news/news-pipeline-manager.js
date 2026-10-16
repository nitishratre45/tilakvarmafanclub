(() => {
  "use strict";
  const section = document.getElementById("news");
  if (!section || document.getElementById("news-pipeline-health")) return;
  const style = document.createElement("style");
  style.textContent = `
    #news-pipeline-health{margin-top:22px;border:1px solid #29425f;border-radius:16px;background:linear-gradient(145deg,#10243a,#0b1728);overflow:hidden}
    #news-pipeline-health .nph-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid #29425f;flex-wrap:wrap}
    #news-pipeline-health h3{margin:0;font-size:18px;color:#f4f8ff}
    #news-pipeline-health p{margin:5px 0 0;color:#9eb1ca}
    #news-pipeline-health .nph-pill{border-radius:99px;padding:5px 10px;font-size:11px;font-weight:800;letter-spacing:.08em;background:#203b53;color:#aeefff}
    #news-pipeline-health .nph-pill.error{background:#512b35;color:#ffb3b5}#news-pipeline-health .nph-pill.warning{background:#514126;color:#ffe0a0}#news-pipeline-health .nph-pill.healthy{background:#183e35;color:#8ff0c3}
    #news-pipeline-health .nph-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:16px 20px}
    #news-pipeline-health .nph-stat{padding:12px;border:1px solid #263e59;border-radius:12px;background:#0b192a;min-width:0}
    #news-pipeline-health .nph-stat strong{display:block;font-size:24px;color:#f4f8ff;overflow-wrap:anywhere}
    #news-pipeline-health .nph-stat span{font-size:12px;color:#9eb1ca}
    #news-pipeline-health .nph-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 16px}
    #news-pipeline-health .nph-actions a{color:#aeefff;text-decoration:underline}
    #news-pipeline-health .nph-body{padding:0 20px 20px}
    #news-pipeline-health .nph-findings{display:grid;gap:8px;margin:12px 0 0}
    #news-pipeline-health .nph-item{border:1px solid #2a405a;border-radius:10px;padding:10px 12px;color:#dce7f6;overflow-wrap:anywhere}
    #news-pipeline-health .nph-item.error{border-color:#75414a}#news-pipeline-health .nph-item.warning{border-color:#78613a}
    #news-pipeline-health .nph-muted{color:#9eb1ca;font-size:12px}
    @media(max-width:700px){#news-pipeline-health .nph-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#news-pipeline-health .nph-head{align-items:flex-start}}
  `;
  document.head.appendChild(style);
  const panel = document.createElement("section");
  panel.id = "news-pipeline-health";
  panel.innerHTML = `
    <div class="nph-head"><div><h3>News JSON · Pipeline Manager</h3><p>Full-text checks, JSON validity, auto-cleanup and workflow health.</p></div><span class="nph-pill" id="nph-status">CHECKING</span></div>
    <div class="nph-stats">
      <div class="nph-stat"><strong id="nph-json">—</strong><span>Valid JSON files</span></div>
      <div class="nph-stat"><strong id="nph-news">—</strong><span>Filtered Tilak stories</span></div>
      <div class="nph-stat"><strong id="nph-pages">—</strong><span>Article pages fetched</span></div>
      <div class="nph-stat"><strong id="nph-errors">—</strong><span>Errors / warnings</span></div>
      <div class="nph-stat"><strong id="nph-verified">—</strong><span>Live article URLs verified</span></div>
    </div>
    <div class="nph-actions"><button class="btn" id="nph-refresh" type="button">↻ Refresh report</button><a href="../News/news-pipeline-report.json" target="_blank" rel="noopener">Open full report ↗</a><a href="https://github.com/nitishratre45/tilakvarmafanclub/actions/workflows/refresh-tilak-news.yml" target="_blank" rel="noopener">Workflow logs ↗</a></div>
    <div class="nph-body"><div class="nph-muted" id="nph-time">Waiting for manager report…</div><div class="nph-findings" id="nph-findings"></div></div>`;
  const sourceResults = section.querySelector("#news-source-results");
  if (sourceResults) sourceResults.insertAdjacentElement("afterend", panel);
  else section.querySelector(".section-body")?.appendChild(panel);
  const $ = (id) => panel.querySelector("#" + id);
  const text = (id, value) => {
    $(id).textContent = value == null ? "—" : String(value);
  };
  async function refresh() {
    text("nph-time", "Loading manager report…");
    try {
      const response = await fetch("../News/news-pipeline-report.json?t=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Report not published yet. Run the news workflow first.");
      const report = await response.json();
      const status = $("nph-status");
      status.textContent = String(report.status || "unknown").toUpperCase();
      status.className = "nph-pill " + (report.status || "warning");
      text("nph-json", (report.validJsonFiles ?? 0) + "/" + (report.jsonFilesScanned ?? 0));
      text("nph-news", report.news?.records ?? 0);
      text("nph-pages", report.raw?.articlePagesFetched ?? 0);
      text("nph-errors", (report.news?.errors ?? 0) + " / " + (report.news?.warnings ?? 0));
      text("nph-verified", report.contentVerification?.liveUrlsMatched ?? 0);
      text(
        "nph-time",
        "Last manager check: " +
          (report.generatedAt || "unknown") +
          " · Raw article URLs: " +
          (report.raw?.articleUrls ?? 0) +
          " · Page fetch errors: " +
          (report.raw?.articleFetchErrors ?? 0) +
          " · Live URL checks: " +
          (report.contentVerification?.findings?.length ?? 0),
      );
      const findings = $("nph-findings");
      findings.replaceChildren();
      const list = [];
      (report.invalidJsonFiles || []).forEach((x) =>
        list.push({ severity: "error", label: "Invalid JSON", detail: x.path + " — " + x.error }),
      );
      (report.news?.findings || []).forEach((x) =>
        list.push({
          severity: x.severity || "warning",
          label: "News record " + (Number(x.record) + 1),
          detail: x.issue,
        }),
      );
      (report.contentVerification?.findings || []).forEach((x) =>
        list.push({
          severity: x.severity || "warning",
          label: "Live article check " + (Number(x.record) + 1),
          detail: x.issue,
        }),
      );
      if (!list.length) {
        const item = document.createElement("div");
        item.className = "nph-item";
        item.textContent =
          "✓ No JSON syntax errors or news-record validation findings in the latest report.";
        findings.appendChild(item);
      } else {
        list.slice(0, 80).forEach((x) => {
          const item = document.createElement("div");
          item.className = "nph-item " + x.severity;
          item.textContent =
            (x.severity === "error" ? "ERROR" : "WARNING") + " · " + x.label + ": " + x.detail;
          findings.appendChild(item);
        });
        if (list.length > 80) {
          const more = document.createElement("p");
          more.className = "nph-muted";
          more.textContent = list.length - 80 + " additional findings are in the full JSON report.";
          findings.appendChild(more);
        }
      }
    } catch (error) {
      $("nph-status").textContent = "REPORT MISSING";
      $("nph-status").className = "nph-pill warning";
      text("nph-time", error.message || "Could not load manager report.");
      text("nph-json", "—");
      text("nph-news", "—");
      text("nph-pages", "—");
      text("nph-errors", "—");
    }
  }
  $("nph-refresh").addEventListener("click", refresh);
  refresh();
  let timer;
  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[data-view="news"]');
    if (link) {
      refresh();
      clearInterval(timer);
      timer = setInterval(() => {
        if (!panel.closest("[hidden]")) refresh();
      }, 60000);
    }
  });
  window.addEventListener("focus", refresh);
})();
