/* Shared accessible outside-tap / Escape handling for mobile navigation. */
(() => {
  if (window.__tvGlassMenuBound) return;
  window.__tvGlassMenuBound = true;

  const getParts = () => {
    const header = document.querySelector("body > header.topbar");
    if (!header) return null;
    const button = header.querySelector(".menu-toggle");
    const nav = header.querySelector("#main-nav, #death-nav, #site-navigation");
    return button && nav ? { header, button, nav } : null;
  };

  const closeMenu = (parts = getParts()) => {
    if (!parts) return;
    parts.nav.classList.remove("open");
    parts.button.setAttribute("aria-expanded", "false");
    parts.button.setAttribute("aria-label", "Open navigation menu");
    document.body.classList.remove("mobile-menu-open");
  };

  const openMenu = (parts) => {
    parts.nav.classList.add("open");
    parts.button.setAttribute("aria-expanded", "true");
    parts.button.setAttribute("aria-label", "Close navigation menu");
    document.body.classList.add("mobile-menu-open");
  };

  document.addEventListener("click", (event) => {
    const parts = getParts();
    if (!parts) return;
    if (parts.button.contains(event.target)) {
      event.preventDefault();
      if (parts.nav.classList.contains("open")) closeMenu(parts);
      else openMenu(parts);
      return;
    }
    if (parts.nav.contains(event.target)) {
      if (event.target.closest("a")) closeMenu(parts);
      return;
    }
    if (parts.nav.classList.contains("open")) closeMenu(parts);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 801px)").matches) closeMenu();
  }, { passive: true });
})();
