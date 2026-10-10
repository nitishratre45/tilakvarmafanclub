/* Resilient renderer for the Format-wise Career cards. */
(async function () {
  const host = document.getElementById("career-formats");
  if (!host) return;
  const escapeHTML = (value) =>
    String(value ?? "—").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const render = (formats) => {
    if (!formats || typeof formats !== "object" || !Object.keys(formats).length) return false;
    host.innerHTML = Object.entries(formats)
      .map(([name, s]) => {
        const label =
          name === "Overall T20 (all competitions)" ? "OVERALL T20" : name.toUpperCase();
        const runs = Number(s.runs);
        return (
          '<article class="stat-card format-card">' +
          '<span class="stat-label">' +
          escapeHTML(label) +
          "</span>" +
          '<div class="format-main-row"><div class="format-runs"><strong>' +
          (Number.isFinite(runs) ? runs.toLocaleString("en-IN") : "—") +
          '</strong><span class="format-runs-caption">RUNS</span></div>' +
          '<div class="format-batting-facts">' +
          '<div class="format-fact"><span>INN</span><strong>' +
          escapeHTML(s.innings ?? "—") +
          "</strong></div>" +
          '<div class="format-fact"><span>NO</span><strong>' +
          escapeHTML(s.notOuts ?? "—") +
          "</strong></div>" +
          '<div class="format-fact"><span>4s</span><strong>' +
          escapeHTML(s.fours ?? "—") +
          "</strong></div>" +
          '<div class="format-fact"><span>6s</span><strong>' +
          escapeHTML(s.sixes ?? "—") +
          "</strong></div>" +
          '<div class="format-fact"><span>50s</span><strong>' +
          escapeHTML(s.fifties ?? "—") +
          "</strong></div>" +
          '<div class="format-fact"><span>100s</span><strong>' +
          escapeHTML(s.hundreds ?? "—") +
          "</strong></div>" +
          "</div></div>" +
          '<div class="format-meta-row"><span>' +
          escapeHTML(s.matches ?? "—") +
          " MATCHES</span><span>BALLS " +
          escapeHTML(s.balls ?? "—") +
          "</span><span>HS " +
          escapeHTML(s.highestScore ?? "—") +
          "</span><span>AVG " +
          escapeHTML(s.average ?? "—") +
          "</span><span>SR " +
          escapeHTML(s.strikeRate ?? "—") +
          "</span></div></article>"
        );
      })
      .join("");
    return true;
  };
  try {
    const response = await fetch("data/site-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Saved career data unavailable");
    const data = await response.json();
    render(data.careerFormats);
  } catch (error) {
    /* Leave any cards already rendered by app.js intact if the fallback request fails. */
    if (!host.children.length) {
      host.innerHTML =
        '<p class="activity-empty">Career format data is temporarily unavailable. Please refresh shortly.</p>';
    }
  }
})();
