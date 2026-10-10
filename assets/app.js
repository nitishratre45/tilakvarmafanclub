(async function () {
  const $ = (s) => document.querySelector(s);
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
  };
  const esc = (value) =>
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
  const latestTimestamp = (...values) =>
    values
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => ({ value, time: Date.parse(value.replace(" UTC", "Z").replace(" ", "T")) }))
      .filter((item) => Number.isFinite(item.time))
      .sort((a, b) => b.time - a.time)[0]?.value || "time unavailable";
  set("year", new Date().getFullYear());
  const menuButton = $(".menu-toggle"),
    nav = $("#main-nav");
  menuButton?.setAttribute("aria-expanded", "false");
  menuButton?.addEventListener("click", () => {
    const open = nav?.classList.toggle("open") || false;
    menuButton.setAttribute("aria-expanded", String(open));
  });
  nav?.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton?.setAttribute("aria-expanded", "false");
    }),
  );
  try {
    const response = await fetch("data/site-data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Data feed unavailable");
    const data = await response.json();
    const stats = data.careerStats || {};
    const photo = document.getElementById("tilak-photo");
    if (photo && data.profile && data.profile.photo) photo.src = data.profile.photo;
    if (photo)
      photo.addEventListener(
        "error",
        () => {
          photo.style.display = "none";
        },
        { once: true },
      );
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const key = el.dataset.stat;
      if (stats[key] !== undefined) el.textContent = stats[key];
    });
    set(
      "career-updated",
      "Last update: " +
        latestTimestamp(data.careerStatsUpdated, data.statsguru?.updatedAt, data.lastUpdated),
    );
    const rows = data.recentInnings || [];
    const lastChecked = Date.parse(data.lastChecked || data.lastUpdated || "");
    const stale = !Number.isFinite(lastChecked) || Date.now() - lastChecked > 36 * 60 * 60 * 1000;
    const refreshFailed = data.lastRefreshStatus === "source-unavailable";
    set(
      "data-status",
      !rows.length
        ? "Awaiting feed"
        : refreshFailed
          ? "Saved data retained · retry scheduled"
          : stale
            ? "Stale · last check overdue"
            : "Available · auto-refresh enabled",
    );
    const rankings = data.iccRankings || {};
    set("icc-ranking-t20i", rankings.T20I ? "T20I #" + rankings.T20I : "T20I ranking unavailable");
    set("icc-ranking-odi", rankings.ODI ? "ODI #" + rankings.ODI : "ODI ranking unavailable");
    set(
      "icc-ranking-updated",
      rankings.updatedAt ? "Updated " + rankings.updatedAt : "Official ICC ranking snapshot",
    );
  } catch (error) {
    set("data-status", "Saved snapshot unavailable");
    const tbody = $("#recent-table");
    if (tbody)
      tbody.innerHTML =
        '<tr><td colspan="7" class="empty">Could not load the saved data. Please try again later.</td></tr>';
  }
})();
