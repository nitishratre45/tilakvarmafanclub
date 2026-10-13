(() => {
  "use strict";
  if (window.__TILAK_SHARED_SITE_SHELL_V2__) return;
  window.__TILAK_SHARED_SITE_SHELL_V2__ = true;

  const normalizePath = () => window.location.pathname.replace(/\/+$/, "") || "/";
  const items = [
    { label: "Home", href: "/#profile", path: "/", hash: "#profile", defaultHash: true },
    { label: "Stats", href: "/stats/", path: "/stats", hash: "" },
    { label: "Death-overs", href: "/death-overs/", path: "/death-overs", hash: "" },
    { label: "Matches", href: "/matches/", path: "/matches", hash: "" },
    { label: "Records", href: "/records/", path: "/records", hash: "" },
    { label: "News", href: "/news/", path: "/news", hash: "" },
    { label: "Photos", href: "/photos/", path: "/photos", hash: "" },
    { label: "Videos", href: "/videos/", path: "/videos", hash: "" },
  ];

  const header = document.createElement("header");
  header.className = "site-shell-header";
  header.innerHTML = `
    <a class="site-shell-brand" href="/#profile" aria-label="Tilak Varma Fan Club home">
      <img data-tilak-logo src="https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png" alt="">
      <span class="site-shell-brand-copy">TILAK VARMA<small>FAN CLUB</small></span>
    </a>
    <button class="site-shell-menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="site-shell-nav"><span></span><span></span><span></span></button>
    <nav class="site-shell-nav" id="site-shell-nav" aria-label="Main navigation"></nav>`;
  const nav = header.querySelector(".site-shell-nav");

  const updateActive = () => {
    const path = normalizePath();
    const hash = window.location.hash;
    nav.querySelectorAll("a").forEach((link, index) => {
      const item = items[index];
      let active = item.path === path;
      if (item.label === "Home") {
        active = path === "/" && (!hash || hash === item.hash);
      }
      if (item.label === "News" && (path === "/News" || path === "/News-details")) active = true;
      if (item.label === "Photos" && path === "/photos/index.html") active = true;
      if (active) {
        link.setAttribute("aria-current", "page");
        link.classList.add("is-active");
      } else {
        link.removeAttribute("aria-current");
        link.classList.remove("is-active");
      }
    });
  };

  items.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    nav.appendChild(link);
  });

  const oldHeader = document.querySelector(
    "body > header.topbar, body > header.death-topbar, body > header.site-shell-header, body > header",
  );
  if (oldHeader) oldHeader.replaceWith(header);
  else document.body.prepend(header);

  const oldFooters = [...document.querySelectorAll("body > footer")];
  const footer = document.createElement("footer");
  footer.className = "site-shell-footer";
  footer.innerHTML =
    '<a href="/#profile" class="site-shell-footer-tag">TILAK VARMA FAN CLUB · 72</a><span>RESPECT THE GAME. BACK THE PLAYER.</span><a href="/#profile">Back to Home ↑</a>';
  if (oldFooters.length) {
    oldFooters[0].replaceWith(footer);
    oldFooters.slice(1).forEach((node) => node.remove());
  } else document.body.appendChild(footer);

  const toggle = header.querySelector(".site-shell-menu-toggle");
  const closeMenu = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) closeMenu();
  });
  document.addEventListener("click", (event) => {
    if (
      nav.classList.contains("is-open") &&
      !nav.contains(event.target) &&
      !toggle.contains(event.target)
    )
      closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 800) closeMenu();
  });
  window.addEventListener("hashchange", updateActive);
  window.addEventListener("pageshow", updateActive);
  updateActive();

  const logo = header.querySelector("[data-tilak-logo]");
  if (logo && window.TilakSiteData?.load) {
    window.TilakSiteData.load()
      .then((data) => {
        const photo = data?.profile?.photo;
        if (typeof photo === "string" && /^https:\/\//i.test(photo)) logo.src = photo;
      })
      .catch(() => {});
  }
})();
