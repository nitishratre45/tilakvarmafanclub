/* Small shared page-load feedback and non-destructive image loading improvements. */
(() => {
  "use strict";
  if (document.getElementById("site-load-progress")) return;
  const bar = document.createElement("div");
  bar.id = "site-load-progress";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Page loading");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", "15");
  document.documentElement.appendChild(bar);
  bar.classList.add("is-loading");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    bar.classList.remove("is-loading");
    bar.classList.add("is-finishing");
    bar.setAttribute("aria-valuenow", "100");
    window.setTimeout(() => {
      bar.style.opacity = "0";
    }, 180);
    window.setTimeout(() => bar.remove(), 500);
  };
  if (document.readyState === "complete") finish();
  else window.addEventListener("load", finish, { once: true });
  window.addEventListener("pageshow", finish, { once: true });
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (img instanceof HTMLImageElement) {
        img.classList.remove("is-image-loading");
        img.classList.add("is-image-error");
      }
    },
    true,
  );
  const prepareImage = (img) => {
    if (!(img instanceof HTMLImageElement) || img.dataset.siteMediaReady) return;
    img.dataset.siteMediaReady = "1";
    img.decoding = "async";
    if (!img.hasAttribute("loading") && !img.closest("picture")?.querySelector("source[srcset]")) {
      const all = Array.from(document.images);
      if (all.indexOf(img) > 1 && !img.closest("header,.hero,.banner,[data-priority-image]"))
        img.loading = "lazy";
    }
    if (!img.complete) img.classList.add("is-image-loading");
    const ready = () => {
      img.classList.remove("is-image-loading");
      img.classList.add("is-image-ready");
    };
    if (img.complete && img.naturalWidth > 0) ready();
    else {
      img.addEventListener("load", ready, { once: true });
      img.addEventListener("error", () => img.classList.remove("is-image-loading"), { once: true });
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
