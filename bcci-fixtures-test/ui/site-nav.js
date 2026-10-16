/* BCCI pages use the same top navigation structure as the main Tilak Varma Fan Club site. */
(() => {
  "use strict";
  if (window.__tvfcBcciShell) return;
  window.__tvfcBcciShell = true;

  const path = location.pathname;
  const inResults = /\/results\//.test(path);
  const base = inResults ? "../" : "./";
  const routes = [
    ["Home", "/", "home"],
    ["Stats", "/stats/", "stats"],
    ["Death-overs", "/death-overs/", "death-overs"],
    ["Matches", "/matches/", "matches"],
    ["Records", "/records/", "records"],
    ["News", "/news/", "news"],
    ["Photos", "/photos/", "photos"],
    ["Videos", "/videos/", "videos"],
  ];
  const current = path.endsWith("/live-scores.html") || path.endsWith("/scorecard.html")
    || path.endsWith("/bcci-scorecard-page.html") ? "Live"
    : path.includes("/results/") ? "Results"
    : path.endsWith("/fixtures.html") || path.endsWith("/bcci-fixtures-test/")
      || path.endsWith("/bcci-fixtures-test/index.html") ? "Fixtures" : "";

  const header = document.querySelector("body > header.topbar, body > header.top, body > header.tvfc-header");
  if (header) {
    header.className = "topbar tvfc-header";
    header.innerHTML =
      '<a class="brand tvfc-brand" href="/" aria-label="Tilak Varma Fan Club home">' +
        '<span class="brand-mark tvfc-brand-photo"><img src="https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png" alt="" aria-hidden="true" loading="eager"></span>' +
        '<span>TILAK VARMA <small>FAN CLUB · THE 72 CLUB</small></span></a>' +
      '<button class="menu-toggle tvfc-menu-toggle" type="button" aria-label="Toggle menu" aria-expanded="false" aria-controls="main-nav">' +
        '<span></span><span></span><span></span></button>' +
      '<nav id="main-nav" class="tvfc-nav" aria-label="Main navigation"></nav>';
    const nav = header.querySelector("#main-nav");
    routes.forEach(([label, href]) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (label === current) a.setAttribute("aria-current", "page");
      nav.append(a);
    });
  }

  // Match the main website's 5-item glass dock, with BCCI-specific shortcuts.
  const dock = document.createElement("nav");
  dock.className = "tvfc-mobile-dock";
  dock.setAttribute("aria-label", "Quick navigation");
  const items = [
    ["Home", "/", "home", "⌂"],
    ["Fixtures", base + "index.html", "fixtures", "▤"],
    ["Live", base + "live-scores.html", "live", "●"],
    ["Results", base + "results/", "results", "✓"],
    ["Menu", "#tvfc-menu", "menu", "☰"],
  ];
  items.forEach(([label, href, key, symbol]) => {
    const el = key === "menu" ? document.createElement("button") : document.createElement("a");
    if (key === "menu") { el.type = "button"; el.setAttribute("aria-expanded", "false"); }
    else el.href = href;
    el.innerHTML = '<span class="tvfc-dock-icon" aria-hidden="true">' + symbol + '</span><span>' + label + '</span>';
    if ((key === "home" && path === "/") || (key === "fixtures" && current === "Fixtures")
      || (key === "live" && current === "Live") || (key === "results" && current === "Results")) {
      el.classList.add("is-active");
      el.setAttribute("aria-current", "page");
    }
    dock.append(el);
  });
  document.body.append(dock);

  const toggle = header?.querySelector(".menu-toggle");
  const nav = header?.querySelector("#main-nav");
  const dockMenu = dock.querySelector('button');
  function setOpen(open) {
    nav?.classList.toggle("open", open);
    document.body.classList.toggle("mobile-menu-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.setAttribute("aria-label", open ? "Close navigation menu" : "Toggle menu");
    dockMenu?.setAttribute("aria-expanded", String(open));
  }
  toggle?.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
  dockMenu?.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 800px)").matches) setOpen(!nav.classList.contains("open"));
    else location.href = "/matches/";
  });
  nav?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("click", e => {
    if (nav?.classList.contains("open") && !nav.contains(e.target) && !toggle?.contains(e.target) && !dock.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
})();