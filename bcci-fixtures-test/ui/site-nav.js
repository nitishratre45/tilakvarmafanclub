/* BCCI fixture pages share the same static header markup and global navbar stylesheet. */
(() => {
  "use strict";
  if (window.__tvfcBcciShell) return;
  window.__tvfcBcciShell = true;

  document.body.classList.add("matches-page", "bcci-matches-page");

  // Do not rebuild header.innerHTML here: that changes the shared header classes,
  // can cause a visual jump, and races with the shared mobile menu initializer.
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const routes = [
    ["/", "home"],
    ["/stats", "stats"],
    ["/death-overs", "death-overs"],
    ["/bcci-fixtures-test", "matches"],
    ["/records", "records"],
    ["/news", "news"],
    ["/photos", "photos"],
    ["/videos", "videos"],
  ];
  const active = routes
    .filter(([route]) => route === "/" ? path === "/" : path === route || path.startsWith(route + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1];

  const header = document.querySelector("body > header.topbar");
  const nav = header?.querySelector("#main-nav");
  if (!nav) return;

  nav.querySelectorAll("a[href]").forEach((link) => {
    const href = new URL(link.href, window.location.origin).pathname.replace(/\/+$/, "") || "/";
    const route = routes
      .filter(([base]) => base === "/" ? href === "/" : href === base)
      .map(([, key]) => key)[0];
    const isActive = Boolean(route && route === active);
    link.classList.toggle("active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
})();