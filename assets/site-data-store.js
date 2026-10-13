/* Shared per-page loader for the large career snapshot.
   All main-page modules reuse one request and one parsed object. */
(() => {
  "use strict";
  let snapshotPromise = null;
  function load() {
    if (!snapshotPromise) {
      snapshotPromise = fetch(new URL("/data/site-data.json", window.location.origin), {
        cache: "no-store",
      })
        .then((response) => {
          if (!response.ok) throw new Error("Site data unavailable (" + response.status + ")");
          return response.json();
        })
        .catch((error) => {
          // Allow a later caller to retry if the first request fails.
          snapshotPromise = null;
          throw error;
        });
    }
    return snapshotPromise;
  }
  // Keep the shared site navigation's active state aligned with the current URL.
  const navLinks = document.querySelectorAll("#main-nav a, .site-navigation a");
  const normalizePath = (pathname) =>
    pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const currentPath = normalizePath(window.location.pathname);
  const currentLink = Array.from(navLinks).find((link) => {
    try {
      return normalizePath(new URL(link.href, window.location.href).pathname) === currentPath;
    } catch {
      return false;
    }
  });
  if (currentLink) {
    navLinks.forEach((link) => {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    });
    currentLink.classList.add("active");
    currentLink.setAttribute("aria-current", "page");
  }
  window.TilakSiteData = Object.freeze({ load });
})();
