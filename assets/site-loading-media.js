/* Shared visible page loader and non-destructive image loading improvements. */
(() => {
  "use strict";
  if (document.getElementById("site-page-loader")) return;

  const loader = document.createElement("div");
  loader.id = "site-page-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  loader.innerHTML =
    '<div class="site-loader-panel"><span class="site-loader-spinner" role="img" aria-label="Loading"></span></div>';
  document.documentElement.appendChild(loader);

  const bar = document.createElement("div");
  bar.id = "site-load-progress";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Page loading");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", "15");
  document.documentElement.appendChild(bar);
  bar.classList.add("is-loading");

  const startedAt = Date.now();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const delay = Math.max(0, 650 - (Date.now() - startedAt));
    window.setTimeout(() => {
      loader.classList.add("is-hidden");
      bar.classList.remove("is-loading");
      bar.classList.add("is-finishing");
      bar.setAttribute("aria-valuenow", "100");
      window.setTimeout(() => {
        loader.remove();
        bar.remove();
      }, 300);
    }, delay);
  };
  if (document.readyState === "complete") finish();
  else window.addEventListener("load", finish, { once: true });
  window.addEventListener("pageshow", finish, { once: true });
  window.setTimeout(finish, 4000);

  const prepareImage = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.siteMediaReady) return;
    img.dataset.siteMediaReady = "1";
    img.decoding = "async";
    if (!img.hasAttribute("loading") && !img.closest("picture")?.querySelector("source[srcset]")) {
      const all = Array.from(document.images);
      if (all.indexOf(img) > 1 && !img.closest("header,.hero,.banner,[data-priority-image]")) {
        img.loading = "lazy";
      }
    }
    if (!img.complete) img.classList.add("is-image-loading");
    const ready = () => {
      img.classList.remove("is-image-loading");
      img.classList.add("is-image-ready");
    };
    if (img.complete && img.naturalWidth > 0) ready();
    else {
      img.addEventListener("load", ready, { once: true });
      img.addEventListener(
        "error",
        () => {
          img.classList.remove("is-image-loading");
          img.classList.add("is-image-error");
        },
        { once: true },
      );
    }
  };
  document.querySelectorAll("img").forEach(prepareImage);
  new MutationObserver((records) =>
    records.forEach((record) =>
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) prepareImage(node);
        else if (node instanceof Element) node.querySelectorAll("img").forEach(prepareImage);
      }),
    ),
  ).observe(document.documentElement, { childList: true, subtree: true });
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
      transition: "opacity .12s ease"
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
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download") || link.target === "_blank" || link.getAttribute("aria-disabled") === "true") return;
    let destination;
    try { destination = new URL(link.href, window.location.href); } catch (_) { return; }
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    const layer = ensureOverlay();
    layer.style.display = "flex";
    requestAnimationFrame(() => { layer.style.opacity = "1"; });
  }, true);
})();
