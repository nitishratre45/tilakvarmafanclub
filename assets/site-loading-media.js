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
