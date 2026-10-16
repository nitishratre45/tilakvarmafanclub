(() => {
  "use strict";
  const desktopNav = document.getElementById("admin-nav");
  const mobileNav = document.getElementById("admin-mobile-bottom-nav");
  if (!desktopNav || !mobileNav || mobileNav.dataset.initialized === "true") return;
  mobileNav.dataset.initialized = "true";

  const syncActive = () => {
    const activeView = desktopNav.querySelector("a.active")?.dataset.view || "dashboard";
    mobileNav.querySelectorAll("a[data-view]").forEach((link) => {
      const active = link.dataset.view === activeView;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };

  mobileNav.replaceChildren(
    ...Array.from(desktopNav.querySelectorAll("a[data-view]"), (source) => {
      const link = source.cloneNode(true);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const target = desktopNav.querySelector(
          'a[data-view="' + CSS.escape(link.dataset.view) + '"]',
        );
        if (target) target.click();
        syncActive();
      });
      return link;
    }),
  );

  desktopNav.addEventListener("click", () => window.requestAnimationFrame(syncActive));
  window.addEventListener("hashchange", syncActive);
  const observer = new MutationObserver(syncActive);
  observer.observe(desktopNav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  syncActive();
})();
