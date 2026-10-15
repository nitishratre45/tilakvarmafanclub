/* Site-wide mobile bottom navigation. Active item follows the current URL. */
(() => {
  if (window.__tvBottomNavMounted) return;
  window.__tvBottomNavMounted = true;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const current =
    path === "/"
      ? "home"
      : path.startsWith("/matches")
        ? "matches"
        : path.startsWith("/photos")
          ? "photos"
          : path.startsWith("/videos")
            ? "videos"
            : path.startsWith("/stats")
              ? "stats"
              : path.startsWith("/death-overs")
                ? "death-overs"
                : path.startsWith("/records")
                  ? "records"
                  : path.startsWith("/news") || path.startsWith("/News-details")
                    ? "news"
                    : "";
  if (!document.body) return;
  document.body.classList.add("tv-bottom-nav-enabled");
  const icon = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    matches:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 2v4m8-4v4M3 9h18M8 13h3m2 0h3m-8 3h3"/>',
    photos:
      '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    videos: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    menu: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><path d="M4 5h16M4 19h16"/>',
  };
  const makeIcon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon[name] + "</svg>";
  const items = [
    ["home", "Home", "/"],
    ["matches", "Matches", "/matches/"],
    ["photos", "Photos", "/photos/"],
    ["videos", "Videos", "/videos/"],
  ];
  const nav =
    document.querySelector("body > nav.tv-mobile-bottom-nav") || document.createElement("nav");
  nav.className = "tv-mobile-bottom-nav";
  nav.setAttribute("aria-label", "Mobile quick navigation");
  const hasStaticLinks =
    nav.querySelector('a[href="/"]') && nav.querySelector('a[href="/matches/"]');
  if (!hasStaticLinks) {
    nav.replaceChildren();
    items.forEach(([key, label, url]) => {
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("aria-label", label);
      a.innerHTML = makeIcon(key) + "<span>" + label + "</span>";
      nav.appendChild(a);
    });
  }
  nav.querySelectorAll("a").forEach((a) => {
    const item = items.find((entry) => entry[2] === a.getAttribute("href"));
    if (!item) return;
    const [key, label] = item;
    a.setAttribute("aria-label", label);
    if (!a.querySelector("svg")) {
      const labelNode = Array.from(a.children).find((node) => node.textContent.trim() === label);
      a.innerHTML = makeIcon(key) + "<span>" + label + "</span>";
    }
    a.classList.toggle("is-active", current === key);
    if (current === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  let trigger = nav.querySelector(".tv-mobile-menu-trigger");
  if (!trigger) {
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "tv-mobile-menu-trigger";
    trigger.setAttribute("aria-label", "More sections");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "tv-mobile-extra-menu");
    trigger.innerHTML = makeIcon("menu") + "<span>Menu</span>";
    nav.appendChild(trigger);
  } else if (!trigger.querySelector("svg")) {
    trigger.innerHTML = makeIcon("menu") + "<span>Menu</span>";
  }
  if (["stats", "death-overs", "records", "news"].includes(current))
    trigger.classList.add("is-active");
  else trigger.classList.remove("is-active");
  const panel =
    document.querySelector("body > .tv-mobile-extra-menu#tv-mobile-extra-menu") ||
    document.createElement("div");
  panel.className = "tv-mobile-extra-menu";
  panel.id = "tv-mobile-extra-menu";
  panel.hidden = true;
  panel.replaceChildren();
  const more = [
    ["stats", "Stats", "Career and player statistics", "/stats/", "▥"],
    ["death-overs", "Death-overs", "Finishing-overs analysis", "/death-overs/", "◷"],
    ["records", "Records", "Milestones and achievements", "/records/", "✦"],
    ["news", "News", "Latest updates", "/news/", "▤"],
  ];
  panel.innerHTML =
    '<div class="tv-mobile-extra-menu__heading"><span>MORE SECTIONS</span><button type="button" class="tv-mobile-menu-close" aria-label="Close menu">×</button></div>';
  more.forEach(([key, label, description, url, symbol]) => {
    const a = document.createElement("a");
    a.href = url;
    if (current === key) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
    a.innerHTML =
      '<span class="tv-extra-icon" aria-hidden="true">' +
      symbol +
      "</span><span><strong>" +
      label +
      "</strong><small>" +
      description +
      '</small></span><span class="tv-extra-arrow" aria-hidden="true">↗</span>';
    panel.appendChild(a);
  });
  if (nav.parentElement !== document.body) document.body.appendChild(nav);
  if (panel.parentElement !== document.body) document.body.appendChild(panel);
  const close = panel.querySelector(".tv-mobile-menu-close");
  const setOpen = (open) => {
    panel.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("tv-shared-menu-open", open);
  };
  trigger.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => {
    setOpen(false);
    trigger.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      trigger.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target))
      setOpen(false);
  });
  panel.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
  window.addEventListener(
    "resize",
    () => {
      if (window.matchMedia("(min-width: 801px)").matches) setOpen(false);
    },
    { passive: true },
  );
})();
