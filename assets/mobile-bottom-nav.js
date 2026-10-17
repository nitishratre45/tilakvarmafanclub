/* Site-wide mobile bottom navigation. Active item follows the current URL. */
(() => {
  if (window.__tvBottomNavMounted) return;
  window.__tvBottomNavMounted = true;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const current =
    path === "/"
      ? "home"
      : path.startsWith("/matches") || path.startsWith("/bcci-fixtures-test")
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
    ["matches", "Matches", "/bcci-fixtures-test/"],
    ["photos", "Photos", "/photos/"],
    ["videos", "Videos", "/videos/"],
  ];
  const nav =
    document.querySelector("body > nav.tv-mobile-bottom-nav") || document.createElement("nav");
  nav.className = "tv-mobile-bottom-nav";
  nav.setAttribute("aria-label", "Mobile quick navigation");
  const hasStaticLinks =
    nav.querySelector('a[href="/"]') && nav.querySelector('a[href="/bcci-fixtures-test/"]');
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

/* Lightweight site-wide performance helpers: safe image loading + no layout hacks. */
(function siteSmoothRuntime() {
  if (window.__tvSiteSmoothRuntime) return;
  window.__tvSiteSmoothRuntime = true;

  const optimizeImages = () => {
    const images = Array.from(document.images || []);
    images.forEach((img, index) => {
      if (
        !img ||
        img.dataset.noLazy === "true" ||
        img.loading === "eager" ||
        img.hasAttribute("data-src") ||
        img.hasAttribute("data-lazy-src")
      )
        return;

      // Preserve the first two images and explicitly high-priority assets for LCP.
      if (
        index < 2 ||
        img.fetchPriority === "high" ||
        img.closest("header, .hero, .topbar, .bcci-video-player")
      ) {
        img.decoding = img.decoding || "async";
        return;
      }

      const rect = img.getBoundingClientRect();
      if (rect.top > window.innerHeight * 1.15) img.loading = "lazy";
      if (!img.decoding) img.decoding = "async";
    });
  };

  const runWhenIdle = (callback) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout: 1200 });
    else window.setTimeout(callback, 180);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => runWhenIdle(optimizeImages), {
      once: true,
    });
  } else {
    runWhenIdle(optimizeImages);
  }

  // Optimize images added later by galleries and feed renderers without observing every mutation.
  const startObserver = () => {
    if (!("MutationObserver" in window) || !document.body) return;
    let queued = false;
    const observer = new MutationObserver((mutations) => {
      const hasImages = mutations.some((mutation) =>
        Array.from(mutation.addedNodes || []).some(
          (node) => node.nodeType === 1 && (node.matches?.("img") || node.querySelector?.("img")),
        ),
      );
      if (!hasImages || queued) return;
      queued = true;
      runWhenIdle(() => {
        queued = false;
        optimizeImages();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else startObserver();
})();

/* Spinner-only feedback for internal page/folder navigation across the site. */
(() => {
  if (window.__tvNavigationLoaderBound) return;
  window.__tvNavigationLoaderBound = true;
  let overlay;
  const ensureOverlay = () => {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement("div");
    overlay.id = "tv-navigation-loader";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-label", "Loading");
    overlay.innerHTML = '<span class="tv-navigation-loader__spinner" aria-hidden="true"></span>';
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(5, 18, 38, .78)",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity .12s ease",
    });
    const style = document.createElement("style");
    style.textContent = `
      #tv-navigation-loader .tv-navigation-loader__spinner {
        display: block;
        width: 38px;
        height: 38px;
        box-sizing: border-box;
        border: 4px solid rgba(255,255,255,.22);
        border-top-color: #45d5e8;
        border-right-color: #f6a623;
        border-radius: 50%;
        animation: tv-navigation-spin .72s linear infinite;
      }
      @keyframes tv-navigation-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        #tv-navigation-loader .tv-navigation-loader__spinner { animation-duration: 1.8s; }
      }
    `;
    if (!document.getElementById("tv-navigation-loader-style")) {
      style.id = "tv-navigation-loader-style";
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    return overlay;
  };
  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !link ||
        link.hasAttribute("download") ||
        link.target === "_blank" ||
        link.getAttribute("aria-disabled") === "true"
      )
        return;
      let destination;
      try {
        destination = new URL(link.href, window.location.href);
      } catch (_) {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      const layer = ensureOverlay();
      layer.style.display = "flex";
      requestAnimationFrame(() => {
        layer.style.opacity = "1";
      });
    },
    true,
  );
})();
