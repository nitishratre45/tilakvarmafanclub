/* BCCI fixture pages use the same site header and shared mobile navigation as the main Matches area. */
(() => {
  "use strict";
  if (window.__tvfcBcciShell) return;
  window.__tvfcBcciShell = true;
  document.body.classList.add("matches-page", "bcci-matches-page");
  const path = location.pathname;
  const routes = [
    ["Home", "/", "home"],
    ["Stats", "/stats/", "stats"],
    ["Death-overs", "/death-overs/", "death-overs"],
    ["Matches", "/bcci-fixtures-test/", "matches"],
    ["Records", "/records/", "records"],
    ["News", "/news/", "news"],
    ["Photos", "/photos/", "photos"],
    ["Videos", "/videos/", "videos"],
  ];
  const header = document.querySelector(
    "body > header.topbar, body > header.top, body > header.tvfc-header",
  );
  if (header) {
    header.className = "topbar tvfc-header";
    header.innerHTML =
      '<a class="brand tvfc-brand" href="/" aria-label="Tilak Varma Fan Club home">' +
      '<span class="brand-mark tvfc-brand-photo"><img src="https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png" alt="" aria-hidden="true" loading="eager"></span>' +
      "<span>TILAK VARMA <small>FAN CLUB</small></span></a>" +
      '<button class="menu-toggle tvfc-menu-toggle" type="button" aria-label="Toggle menu" aria-expanded="false" aria-controls="main-nav"><span></span><span></span><span></span></button>' +
      '<nav id="main-nav" class="tvfc-nav" aria-label="Main navigation"></nav>';
    const nav = header.querySelector("#main-nav");
    routes.forEach(([label, href, key]) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = label;
      if (key === "matches") a.setAttribute("aria-current", "page");
      nav.append(a);
    });
  }
  // The main site's mobile-glass-menu.js and mobile-bottom-nav.js own the actual menu and dock.
  // No duplicate BCCI-only menu/dock is created here.
})();
