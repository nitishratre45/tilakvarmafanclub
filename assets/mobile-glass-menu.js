/* Shared accessible mobile navigation with smooth, layout-stable close transitions. */
(() => {
  if (window.__tvGlassMenuBound) return;
  window.__tvGlassMenuBound = true;

  let closeTimer = 0;
  const CLOSE_MS = 260;

  const getParts = () => {
    const header = document.querySelector("body > header.topbar");
    if (!header) return null;
    const button = header.querySelector(".menu-toggle");
    const nav = header.querySelector("#main-nav, #death-nav, #site-navigation, #one-nav");
    return button && nav ? { header, button, nav } : null;
  };

  const finishClose = (parts) => {
    if (!parts || parts.nav.classList.contains("open")) return;
    document.body.classList.remove("mobile-menu-open");
    parts.nav.classList.remove("is-open");
    parts.button.setAttribute("aria-expanded", "false");
    parts.button.setAttribute("aria-label", "Open navigation menu");
  };

  const closeMenu = (parts = getParts()) => {
    if (!parts) return;
    window.clearTimeout(closeTimer);
    parts.nav.classList.remove("open", "is-open");
    parts.button.setAttribute("aria-expanded", "false");
    parts.button.setAttribute("aria-label", "Open navigation menu");

    // Keep the glass scrim in place while the panel animates away.
    closeTimer = window.setTimeout(() => finishClose(parts), CLOSE_MS);
  };

  const openMenu = (parts) => {
    window.clearTimeout(closeTimer);
    document.body.classList.add("mobile-menu-open");
    parts.nav.classList.add("open");
    parts.nav.classList.remove("is-open");
    parts.button.setAttribute("aria-expanded", "true");
    parts.button.setAttribute("aria-label", "Close navigation menu");
  };

  document.addEventListener(
    "click",
    (event) => {
      const parts = getParts();
      if (!parts) return;

      if (parts.button.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (parts.nav.classList.contains("open")) closeMenu(parts);
        else openMenu(parts);
        return;
      }

      if (parts.nav.contains(event.target)) {
        if (event.target.closest("a")) closeMenu(parts);
        return;
      }

      if (parts.nav.classList.contains("open")) closeMenu(parts);
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const parts = getParts();
      if (parts?.nav.classList.contains("open")) {
        closeMenu(parts);
        parts.button.focus();
      }
    }
  });

  window.addEventListener(
    "resize",
    () => {
      if (window.matchMedia("(min-width: 801px)").matches) {
        const parts = getParts();
        if (!parts) return;
        // Crossing into desktop layout must clear mobile state immediately.
        window.clearTimeout(closeTimer);
        parts.nav.classList.remove("open", "is-open");
        finishClose(parts);
      }
    },
    { passive: true },
  );
})();
