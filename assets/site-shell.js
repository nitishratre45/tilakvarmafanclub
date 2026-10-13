(() => {
  "use strict";
  if (window.__TILAK_SHARED_SITE_SHELL__) return;
  window.__TILAK_SHARED_SITE_SHELL__ = true;

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const links = [
    ["Home", "/#profile", path === "/"],
    ["Stats", "/stats/", path === "/stats"],
    ["Death-overs", "/death-overs/", path === "/death-overs"],
    ["Matches", "/#match-center", false],
    ["Records", "/#records", false],
    ["News", "/#news", path === "/News-details" || path === "/News"],
    ["Photos", "/#tv-gallery-hub", false],
    ["Videos", "/#tilak-videos", false],
    ["Fan Zone", "/#fan-zone", false],
  ];
  const header = document.createElement("header");
  header.className = "site-shell-header";
  header.innerHTML = `
    <a class="site-shell-brand" href="/#profile" aria-label="Tilak Varma Fan Club Home">
      <img data-tilak-logo src="https://images.icc-cricket.com/image/upload/t_player-headshot-portrait-lg-webp/prd/assets/players/generic/colored/70761.png" alt="">
      <span class="site-shell-brand-copy">TILAK VARMA<small>FAN CLUB</small></span>
    </a>
    <button class="site-shell-menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="site-shell-nav">☰</button>
    <nav class="site-shell-nav" id="site-shell-nav" aria-label="Main navigation"></nav>`;
  const nav = header.querySelector("nav");
  for (const [label, href, active] of links) {
    const a = document.createElement("a");
    a.textContent = label;
    a.href = href;
    if (active) {
      a.setAttribute("aria-current", "page");
      a.classList.add("active");
    }
    nav.appendChild(a);
  }

  const oldHeader = document.querySelector(
    "body > header.topbar, body > header.death-topbar, body > header",
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
  } else {
    document.body.appendChild(footer);
  }

  const button = header.querySelector(".site-shell-menu-toggle");
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      nav.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    }
  });

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
