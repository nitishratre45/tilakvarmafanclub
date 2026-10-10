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
          "<strong>" +
          (Number.isFinite(runs) ? runs.toLocaleString("en-IN") : "—") +
          "</strong>" +
          '<span class="stat-note">' +
          escapeHTML(s.matches ?? "—") +
          " matches · HS " +
          escapeHTML(s.highestScore ?? "—") +
          "</span>" +
          '<span class="format-detail">AVG ' +
          escapeHTML(s.average ?? "—") +
          " · SR " +
          escapeHTML(s.strikeRate ?? "—") +
          " · 100s " +
          escapeHTML(s.hundreds ?? "—") +
          " · 50s " +
          escapeHTML(s.fifties ?? "—") +
          "</span></article>"
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
