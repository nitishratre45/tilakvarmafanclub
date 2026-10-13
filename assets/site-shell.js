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
    { label: "Records", href: "/#records", path: "/", hash: "#records" },
    { label: "News", href: "/#news", path: "/", hash: "#news" },
    { label: "Photos", href: "/photos/index.html", path: "/photos", hash: "" },
    { label: "Videos", href: "/#tilak-videos", path: "/", hash: "#tilak-videos" },
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
      if (item.path === "/") {
        active =
          path === "/" && (item.defaultHash ? !hash || hash === item.hash : hash === item.hash);
        if (item.label === "News" && (path === "/News" || path === "/News-details")) active = true;
      }
      if (item.label === "Stats" || item.label === "Death-overs" || item.label === "Matches" || item.label === "Photos") active = path === item.path || (item.label === "Photos" && path === "/photos/index.html");
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
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
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
