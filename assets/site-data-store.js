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
  window.TilakSiteData = Object.freeze({ load });
})();
