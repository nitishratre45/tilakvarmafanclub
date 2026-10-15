(() => {
  const nav = document.querySelector("[data-tv-mobile-bottom-nav]");
  const menu = document.querySelector("[data-tv-mobile-menu]");
  const trigger = nav?.querySelector("[data-tv-menu-trigger]");
  if (!nav || !menu || !trigger) return;

  const closeMenu = () => {
    menu.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    menu.setAttribute("hidden", "");
  };
  const openMenu = () => {
    menu.classList.add("is-open");
    menu.removeAttribute("hidden");
    trigger.setAttribute("aria-expanded", "true");
  };

  trigger.addEventListener("click", () => {
    if (trigger.getAttribute("aria-expanded") === "true") closeMenu();
    else openMenu();
  });
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target) && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 801px)").matches) closeMenu();
  }, { passive: true });
})();
