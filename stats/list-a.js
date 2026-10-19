/* List A pilot data loader. Keeps the List A dataset separate from Statsguru/T20I data. */
(function () {
  "use strict";
  const url = "/data/list-a.json?v=20261019-list-a-stats-load-fix1";
  window.TilakListAData = window.TilakListAData || { ready: null, data: null };
  window.TilakListAData.ready = fetch(url, { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) throw new Error("List A JSON request failed: " + response.status);
      return response.json();
    })
    .then(function (payload) {
      if (
        !payload ||
        payload.format !== "List A" ||
        !payload.summary ||
        !Array.isArray(payload.innings) ||
        !Array.isArray(payload.careerBreakdown)
      ) {
        throw new Error("List A JSON has an invalid schema");
      }
      window.TilakListAData.data = payload;
      window.dispatchEvent(
        new CustomEvent("tilak:list-a-loaded", { detail: { innings: payload.innings.length } }),
      );
      return payload;
    });
})();
