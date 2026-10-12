(() => {
  "use strict";

  const main = document.querySelector("main");
  const nav = document.getElementById("main-nav");
  const menu = document.querySelector(".menu-toggle");
  // Keep the News destination ready as its own section.
  if (main && !document.getElementById("news")) {
    const newsSection = document.createElement("section");
    newsSection.id = "news";
    newsSection.setAttribute("aria-label", "News");
    main.appendChild(newsSection);
  }
  if (nav && !nav.querySelector('a[href="#news"]')) {
    const newsLink = document.createElement("a");
    newsLink.href = "#news";
    newsLink.textContent = "News";
    // Keep desktop/mobile navigation order consistent: Matches, News, Records...
    const matchesLink = nav.querySelector('a[href="#innings"]');
    if (matchesLink) matchesLink.insertAdjacentElement("afterend", newsLink);
    else nav.appendChild(newsLink);
  }

  // News UI is maintained separately from index.html.
  const newsLoader = document.createElement("script");
  newsLoader.src = "News/news-section.js?v=20261012-news-ui2";
  newsLoader.defer = true;
  document.body.appendChild(newsLoader);

  const sections = [...(main ? main.querySelectorAll(":scope > section[id]") : [])];
  const allowed = new Set(
    sections.map((section) => section.id).filter((id) => id !== "home-snapshot"),
  );
  const persistentSections = new Set();
  const legacyViews = { "stats-explorer": "statsguru", statsguru: "statsguru" };

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

  function show(id, push = false, view = null, useStatsPath = false) {
    if (legacyViews[id]) {
      view = legacyViews[id];
      id = "stats";
    }
    if (!allowed.has(id)) id = "profile";

    sections.forEach((section) => {
      if (persistentSections.has(section.id)) {
        section.hidden = false;
        section.setAttribute("aria-hidden", "false");
        section.style.removeProperty("display");
        return;
      }
      const active = section.id === id || (id === "profile" && section.id === "home-snapshot");
      section.hidden = !active;
      section.setAttribute("aria-hidden", String(!active));
      if (active) section.style.removeProperty("display");
      else section.style.setProperty("display", "none", "important");
    });

    if (id === "stats") setStatsView(view || "stats-overview");
    nav?.querySelectorAll("a").forEach((link) => {
      const active =
        id === "stats"
          ? link.getAttribute("href") === "/stats" || link.hash === "#stats"
          : link.hash === "#" + id;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (push) {
      // Only the Stats Centre uses /stats. Other sections must leave that
      // route, otherwise their hashes become /stats#news and reload as Stats.
      const statsPath = useStatsPath || id === "stats";
      const onStatsPath = location.pathname.replace(/\/$/, "") === "/stats";
      const target = statsPath ? "/stats" : onStatsPath ? "/#" + id : "#" + id;
      const alreadyThere = statsPath
        ? onStatsPath && !location.hash
        : location.hash === "#" + id && (!onStatsPath || location.pathname === "/");
      if (!alreadyThere) {
        history.pushState({ section: id, statsView: view || "stats-overview" }, "", target);
      }
    }
    nav?.classList.remove("open");
    menu?.setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
  }

  // The Stats menu is a real /stats route; Cloudflare Pages rewrites it to index.html.
  document.addEventListener(
    "click",
    (event) => {
      const link =
        event.target instanceof Element ? event.target.closest('a[href="/stats"]') : null;
      if (!link) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const view = link.dataset.openStatsView || null;
      window.dispatchEvent(new CustomEvent("tilak:section-change", { detail: { id: "stats" } }));
      show("stats", true, view, true);
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (!link) return;
      if (link.hasAttribute("data-stats-tab")) return;

      const view = link.dataset.openStatsView || null;
      const id = link.hash.slice(1);
      if (!view && !allowed.has(id)) return;

      window.dispatchEvent(
        new CustomEvent("tilak:section-change", { detail: { id: view ? "stats" : id } }),
      );
      event.preventDefault();
      event.stopImmediatePropagation();
      show(view ? "stats" : id, true, view);
    },
    true,
  );

  document.querySelectorAll("[data-stats-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setStatsView(button.dataset.statsTab);
      if (location.pathname.replace(/\/$/, "") !== "/stats")
        history.pushState({ section: "stats", statsView: button.dataset.statsTab }, "", "/stats");
    });
  });

  // Stats markup is mounted asynchronously; restore the chosen sub-view after it exists.
  window.addEventListener("tilak:stats-mounted", () => {
    const isStatsRoute = location.pathname.replace(/\/$/, "") === "/stats";
    if (!isStatsRoute && location.hash !== "#stats") return;
    let savedView = null;
    try {
      savedView = sessionStorage.getItem("tilak-stats-view");
    } catch (_) {}
    setStatsView(savedView || "stats-overview");
  });

  window.addEventListener("popstate", (event) => {
    // A section hash wins over /stats so old links such as /stats#news
    // still open News after reload instead of silently reopening Stats.
    const id =
      location.hash.slice(1) ||
      (location.pathname.replace(/\/$/, "") === "/stats" ? "stats" : "profile");
    let saved = null;
    try {
      saved = sessionStorage.getItem("tilak-stats-view");
    } catch (_) {}
    show(id, false, event.state?.statsView || legacyViews[id] || (id === "stats" ? saved : null));
  });
  window.addEventListener("hashchange", () => {
    const id =
      location.hash.slice(1) ||
      (location.pathname.replace(/\/$/, "") === "/stats" ? "stats" : "profile");
    show(id, false, legacyViews[id] || null);
  });

  let saved = null;
  try {
    saved = sessionStorage.getItem("tilak-stats-view");
  } catch (_) {}
  // Hash destinations take priority, including older /stats#section links.
  const initial =
    location.hash.slice(1) ||
    (location.pathname.replace(/\/$/, "") === "/stats" ? "stats" : "profile");
  show(initial, false, legacyViews[initial] || (initial === "stats" ? saved : null));
})();
