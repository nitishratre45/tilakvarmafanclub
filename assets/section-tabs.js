(() => {
  "use strict";
  const main = document.querySelector("main");
  const nav = document.getElementById("main-nav");
  const menu = document.querySelector(".menu-toggle");
  const sections = [...(main?.querySelectorAll(":scope > section[id]") || [])];
  const allowed = new Set(
    sections.map((section) => section.id).filter((id) => id !== "home-snapshot"),
  );
  const legacy = { "stats-explorer": "statsguru", statsguru: "statsguru" };

  function setStatsView(view) {
    const views = [...document.querySelectorAll("#stats .stats-subview")];
    if (!views.some((node) => node.id === view)) view = "stats-overview";
    try {
      sessionStorage.setItem("tilak-stats-view", view);
    } catch (_) {}
    views.forEach((node) => {
      node.hidden = node.id !== view;
      node.setAttribute("aria-hidden", String(node.hidden));
    });
    document.querySelectorAll("[data-stats-tab]").forEach((button) => {
      const active = button.dataset.statsTab === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  function show(id, push = false, view) {
    if (legacy[id]) {
      view = legacy[id];
      id = "stats";
    }
    if (!allowed.has(id)) id = "profile";
    sections.forEach((section) => {
      const active = section.id === id || (id === "profile" && section.id === "home-snapshot");
      section.hidden = !active;
      section.setAttribute("aria-hidden", String(!active));
    });
    if (id === "stats") setStatsView(view || "stats-overview");
    nav?.querySelectorAll('a[href^="#"]').forEach((link) => {
      const active = link.hash === "#" + id;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (push && location.hash !== "#" + id) {
      history.pushState({ section: id, statsView: view || "stats-overview" }, "", "#" + id);
    }
    nav?.classList.remove("open");
    menu?.setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.hasAttribute("data-stats-tab")) return;
      if (link.hasAttribute("data-open-stats-view")) {
        event.preventDefault();
        show("stats", true, link.dataset.openStatsView);
        return;
      }
      const id = link.hash.slice(1);
      if (!allowed.has(id)) return;
      event.preventDefault();
      show(id, true);
    },
    true,
  );

  document.querySelectorAll("[data-stats-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setStatsView(button.dataset.statsTab);
      if (location.hash !== "#stats")
        history.pushState({ section: "stats", statsView: button.dataset.statsTab }, "", "#stats");
      window.scrollTo(0, 0);
    });
  });

  window.addEventListener("popstate", (event) => {
    const hash = location.hash.slice(1) || "profile";
    let saved = null;
    try {
      saved = sessionStorage.getItem("tilak-stats-view");
    } catch (_) {}
    show(hash, false, event.state?.statsView || legacy[hash] || (hash === "stats" ? saved : null));
  });
  window.addEventListener("hashchange", () => {
    const hash = location.hash.slice(1) || "profile";
    show(hash, false, legacy[hash]);
  });

  let saved = null;
  try {
    saved = sessionStorage.getItem("tilak-stats-view");
  } catch (_) {}
  const initial = location.hash.slice(1) || "profile";
  show(initial, false, legacy[initial] || (initial === "stats" ? saved : null));
})();
