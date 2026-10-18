/* Shared image loading optimization only. No page-level or navigation spinner. */
(() => {
  "use strict";
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
