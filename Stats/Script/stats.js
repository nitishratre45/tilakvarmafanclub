(() => {
  "use strict";

  const moduleMount = document.getElementById("stats-module-mount");
  const root = "/Stats/";

  async function fetchMarkup(path) {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) throw new Error(path + " returned HTTP " + response.status);
    return response.text();
  }

  async function mountStats() {
    if (!moduleMount) return;
    try {
      const shell = await fetchMarkup(root + "index.html");
      const template = document.createElement("template");
      template.innerHTML = shell.trim();
      const statsSection = template.content.querySelector("#stats");
      if (!statsSection) throw new Error("Stats/index.html has no #stats section");
      const placeholderSection = moduleMount.closest("#stats");
      if (!placeholderSection) throw new Error("Root Stats placeholder is missing");
      placeholderSection.replaceWith(statsSection);

      const targets = [...statsSection.querySelectorAll("[data-stats-partial]")];
      for (const target of targets) {
        const path = target.getAttribute("data-stats-partial");
        const markup = await fetchMarkup(path);
        const fragment = document.createElement("template");
        fragment.innerHTML = markup.trim();
        target.replaceWith(fragment.content);
      }

      await loadSiteScripts();
      window.dispatchEvent(new CustomEvent("tilak:stats-mounted"));
    } catch (error) {
      console.error("[Stats module]", error);
      const activeStats = document.getElementById("stats") || document.getElementById("stats-module-mount");
      if (activeStats) {
        activeStats.outerHTML =
          '<section id="stats" class="section stats-section"><div class="section-heading"><div><div class="eyebrow">STATS CENTRE</div><h2>Stats temporarily unavailable</h2></div></div><p role="status">The Stats files could not be loaded. Refresh the page or check the deployment paths.</p><button type="button" class="button" onclick="location.reload()">Retry</button></section>';
      }
      await loadSiteScripts();
    }
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => {
        console.warn("[Site bootstrap] Script failed to load:", src);
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }

  async function loadSiteScripts() {
    if (window.__tilakSiteScriptsLoaded) return;
    window.__tilakSiteScriptsLoaded = true;

    const scripts = [
      "assets/site-data-store.js?v=20261011-shared-snapshot1",
      "assets/app.js?v=20261012-india-time1",
      "assets/records-matches.js?v=20261012-india-time1",
      "assets/player-matches.js?v=20261012-cricinfo-only1",
      "assets/upcoming-matches.js?v=20261010-bcci-squad2",
      "/Stats/Batting/Script/batting.js?v=20261013-modular1",
      "assets/features.js?v=20261012-india-time1",
      "assets/fan-zone-plus.js?v=20261010-fanzone3",
      "assets/upgrade.js",
      "assets/gallery.js?v=20261013-sort-label-fix1",
      "/Stats/Explore/Script/explore.js?v=20261013-modular1",
      "assets/home-snapshot.js?v=20261012-match-dedupe1",
      "News/news-section.js?v=20261012-manual-news2",
      "assets/section-tabs.js?v=20261013-route-fix1",
      "/Stats/Bowling/Script/bowling.js?v=20261013-modular1",
      "assets/custom-selects.js?v=20261011-native-touch-fallback1",
      "assets/theme.js?v=20261014",
      "https://cdn.jsdelivr.net/npm/shaka-player@4.12.6/dist/shaka-player.compiled.js",
      "https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.polyfilled.js",
      "assets/bcci-videos.js?v=20261012-india-time1"
    ];

    // Preserve the existing logo-from-snapshot behavior.
    await loadScript(scripts[0]);
    (() => {
      const img = document.querySelector("[data-tilak-logo]");
      if (!img || !window.TilakSiteData) return;
      window.TilakSiteData.load().then((data) => {
        const photo = data?.profile?.photo;
        if (typeof photo === "string" && /^https:\/\//i.test(photo)) img.src = photo;
      }).catch(() => {});
    })();

    for (const src of scripts.slice(1)) {
      await loadScript(src);
      if (src.startsWith("/Stats/Bowling/Script/")) {
        const frame = document.getElementById("death-overs-embed");
        if (frame) {
          window.addEventListener("message", (event) => {
            if (event.source !== frame.contentWindow || event.data?.type !== "death-overs-height") return;
            const height = Number(event.data.height);
            if (Number.isFinite(height) && height > 300 && height < 30000) {
              frame.style.height = Math.ceil(height) + "px";
            }
          });
        }
      }
    }

    const registerWorker = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js", { scope: "/" })
          .catch((error) => console.warn("PWA service worker registration failed:", error));
      }
    };
    if (document.readyState === "complete") registerWorker();
    else window.addEventListener("load", registerWorker, { once: true });

    const loader = document.getElementById("tv-page-loader");
    if (loader) {
      let closed = false;
      const closeLoader = () => {
        if (closed) return;
        closed = true;
        loader.classList.add("is-leaving");
        window.setTimeout(() => loader.remove(), 450);
      };
      if (document.readyState === "complete") window.setTimeout(closeLoader, 180);
      else window.addEventListener("load", () => window.setTimeout(closeLoader, 180), { once: true });
      window.setTimeout(closeLoader, 6500);
    }
  }

  mountStats();
})();
