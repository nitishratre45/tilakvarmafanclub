(() => {
  "use strict";
  const grid = document.getElementById("bcci-video-grid");
  if (!grid) return;
  const yearSelect = document.getElementById("bcci-video-year");
  const formatSelect = document.getElementById("bcci-video-format");
  const thumbSelect = document.getElementById("bcci-thumb-quality");
  const status = document.getElementById("bcci-video-status");
  const modal = document.getElementById("bcci-video-player-modal");
  const videoElement = document.getElementById("bcci-shaka-player");
  const titleElement = document.getElementById("bcci-playing-title");
  const errorElement = document.getElementById("bcci-player-error");
  const playbackQuality = document.getElementById("bcci-playback-quality");
  const settingsButton = document.getElementById("bcci-player-settings-button");
  const settingsMenu = document.getElementById("bcci-player-settings-menu");
  const qualityCurrent = document.getElementById("bcci-quality-current");
  const closeSettingsMenu = () => {
    if (!settingsButton || !settingsMenu) return;
    settingsMenu.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
  };
  if (settingsButton && settingsMenu) {
    settingsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = settingsMenu.hidden;
      settingsMenu.hidden = !willOpen;
      settingsButton.setAttribute("aria-expanded", String(willOpen));
    });
    settingsMenu.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", closeSettingsMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSettingsMenu();
    });
  }
  const playingDate = document.getElementById("bcci-playing-date");
  const upNextList = document.getElementById("bcci-up-next-list");
  const shareButton = document.getElementById("bcci-share-video");
  let allVideos = [];
  let player = null;
  let activeVideo = null;

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  const validHttps = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const thumbFor = (item) => {
    const set = item.thumbnailUrlSet || {};
    return validHttps(
      set[thumbSelect.value] || item.thumbnailUrl || set.large || set.medium || set.small || "",
    );
  };
  const visibleVideos = () =>
    allVideos.filter((item) => {
      const year = String(item.year || (item.publishedDate || "").slice(0, 4));
      const format = String(item.format || "Other");
      return (
        (yearSelect.value === "all" || year === yearSelect.value) &&
        (formatSelect.value === "all" ||
          (formatSelect.value === "International"
            ? !["T20I", "ODI", "Test"].includes(format)
            : format === formatSelect.value))
      );
    });
  const render = () => {
    const videos = visibleVideos();
    if (!videos.length) {
      grid.innerHTML = "";
      status.textContent = allVideos.length
        ? "No Tilak Varma videos match these filters."
        : "No videos are loaded yet. Run “Refresh BCCI Tilak Videos” in GitHub Actions to fetch the first feed.";
      return;
    }
    status.textContent =
      videos.length +
      " official BCCI video" +
      (videos.length === 1 ? "" : "s") +
      (window.__bcciVideosUpdated
        ? " · updated " +
          new Date(window.__bcciVideosUpdated).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "");
    grid.innerHTML = videos
      .map((item) => {
        const thumb = thumbFor(item);
        const hasPlayback = !!validHttps(item.playbackUrl);
        return (
          '<article class="bcci-video-card"><button type="button" class="bcci-video-art" data-bcci-video="' +
          esc(item.id) +
          '" ' +
          (hasPlayback ? "" : 'disabled aria-disabled="true" ') +
          'aria-label="Play ' +
          esc(item.title) +
          '">' +
          (thumb
            ? '<img src="' +
              esc(thumb) +
              '" alt="' +
              esc(item.title) +
              '" loading="lazy" decoding="async">'
            : '<span class="bcci-video-no-thumb">BCCI VIDEO</span>') +
          '<span class="bcci-video-play">' +
          (hasPlayback ? "▶" : "Unavailable") +
          "</span>" +
          (item.duration
            ? '<span class="bcci-video-duration">' + esc(item.duration) + "</span>"
            : "") +
          '</button><div class="bcci-video-card-copy"><span class="bcci-video-tag">' +
          esc(item.format || "International") +
          "</span><h3>" +
          esc(item.title) +
          "</h3>" +
          '<div class="bcci-video-card-meta"><span>' +
          esc(
            item.publishedDate
              ? new Date(item.publishedDate).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : item.year || "BCCI",
          ) +
          "</span><span>SOURCE: BCCI</span></div></div></article>"
        );
      })
      .join("");
  };
  const fillYears = () => {
    const years = [
      ...new Set(
        allVideos
          .map((item) => String(item.year || (item.publishedDate || "").slice(0, 4)))
          .filter((year) => /^\d{4}$/.test(year)),
      ),
    ]
      .sort()
      .reverse();
    yearSelect.innerHTML =
      '<option value="all">All years</option>' +
      years.map((year) => '<option value="' + year + '">' + year + "</option>").join("");
  };
  const applyPlaybackQuality = () => {
    if (!player || !player.getVariantTracks) return;
    const maxHeight = Number(playbackQuality.value);
    if (!maxHeight) {
      player.configure({ abr: { enabled: true } });
      if (qualityCurrent) qualityCurrent.textContent = "Auto";
      return;
    }
    player.configure({ abr: { enabled: false } });
    const tracks = player
      .getVariantTracks()
      .filter((track) => track.height && track.height <= maxHeight);
    if (!tracks.length) {
      errorElement.textContent =
        "This stream does not offer that resolution; using the closest available quality.";
      const all = player.getVariantTracks().filter((track) => track.height);
      if (all.length)
        player.selectVariantTrack(
          all.sort((a, b) => Math.abs(a.height - maxHeight) - Math.abs(b.height - maxHeight))[0],
          true,
        );
      return;
    }
    const best = tracks.sort((a, b) => b.height - a.height)[0];
    player.selectVariantTrack(best, true);
    errorElement.textContent = best.height + "p";
    if (qualityCurrent) qualityCurrent.textContent = best.height + "p";
  };
  const renderUpNext = (current) => {
    if (!upNextList) return;
    const playable = allVideos.filter((video) => validHttps(video.playbackUrl));
    const currentIndex = playable.findIndex((video) => String(video.id) === String(current.id));
    const queue = [
      ...playable.slice(currentIndex >= 0 ? currentIndex + 1 : 0),
      ...playable.slice(0, currentIndex >= 0 ? currentIndex : 0),
    ]
      .filter((video) => String(video.id) !== String(current.id))
      .slice(0, 8);
    if (!queue.length) {
      upNextList.innerHTML =
        '<p class="bcci-up-next-empty">No more Tilak Varma videos in the current feed.</p>';
      return;
    }
    upNextList.innerHTML = queue
      .map((video) => {
        const thumb = thumbFor(video);
        const date = video.publishedDate
          ? new Date(video.publishedDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "BCCI";
        return (
          '<button type="button" class="bcci-up-next-item" data-bcci-next="' +
          esc(video.id) +
          '">' +
          '<span class="bcci-up-next-thumb">' +
          (thumb
            ? '<img src="' + esc(thumb) + '" alt="" loading="lazy" decoding="async">'
            : "<span>72</span>") +
          (video.duration
            ? '<span class="bcci-up-next-duration">' + esc(video.duration) + "</span>"
            : "") +
          '</span><span class="bcci-up-next-copy"><strong>' +
          esc(video.title) +
          "</strong><small>" +
          esc(date) +
          "</small></span></button>"
        );
      })
      .join("");
  };
  const openPlayer = async (item) => {
    if (!item || !validHttps(item.playbackUrl)) return;
    activeVideo = item;
    modal.hidden = false;
    document.body.classList.add("bcci-player-open");
    titleElement.textContent = item.title;
    playingDate.textContent = item.publishedDate
      ? new Date(item.publishedDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }) + " · BCCI.TV"
      : "Official BCCI video";
    renderUpNext(item);
    errorElement.textContent = "Loading official stream…";
    try {
      if (!window.shaka || !window.shaka.Player.isBrowserSupported()) {
        throw new Error(
          "This browser does not support the Shaka player. Try the latest Chrome or Edge.",
        );
      }
      if (!player) {
        player = new shaka.Player();
        await player.attach(videoElement);
        player.addEventListener("error", (event) => {
          const detail = event.detail || {};
          errorElement.textContent =
            "Playback error " +
            (detail.code || "") +
            ". The BCCI playback URL may have expired; refresh the feed and try again.";
        });
      }
      await player.unload();
      player.configure({
        streaming: { retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2 } },
        abr: { enabled: true },
      });
      await player.load(item.playbackUrl);
      applyPlaybackQuality();
      errorElement.textContent = "Official BCCI stream loaded";
      try {
        await videoElement.play();
      } catch (_) {
        /* Browser may require a user tap to start audio. */
      }
    } catch (error) {
      errorElement.textContent =
        error && error.message ? error.message : "Could not play this BCCI stream.";
    }
  };
  const closePlayer = async () => {
    modal.hidden = true;
    document.body.classList.remove("bcci-player-open");
    try {
      if (player) await player.unload();
    } catch (_) {}
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load();
    activeVideo = null;
  };
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bcci-video]");
    if (!button || button.disabled) return;
    openPlayer(allVideos.find((item) => String(item.id) === button.dataset.bcciVideo));
  });
  upNextList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bcci-next]");
    if (!button) return;
    const next = allVideos.find((item) => String(item.id) === button.dataset.bcciNext);
    if (next) openPlayer(next);
  });
  shareButton.addEventListener("click", async () => {
    if (!activeVideo) return;
    const shareData = {
      title: activeVideo.title,
      text: activeVideo.title + " · Official BCCI video on Tilak Varma Fan Club",
      url: window.location.href.split("#")[0] + "#tilak-videos",
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData.url);
        shareButton.textContent = "✓ Link copied";
        setTimeout(() => {
          shareButton.textContent = "↗ Share";
        }, 1800);
      }
    } catch (_) {}
  });
  [yearSelect, formatSelect, thumbSelect].forEach((select) =>
    select.addEventListener("change", render),
  );
  playbackQuality.addEventListener("change", applyPlaybackQuality);

  modal
    .querySelectorAll("[data-bcci-close]")
    .forEach((element) => element.addEventListener("click", closePlayer));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closePlayer();
  });

  // Admin's BCCI URL is an input to the Python collector, not a browser feed.
  // The public page only consumes the collector's normalized cache so raw API
  // response shapes and CORS restrictions cannot break the Videos section.
  fetch("assets/bcci-videos.json?v=20261010", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Feed HTTP " + response.status);
      return response.json();
    })
    .then((data) => {
      allVideos = Array.isArray(data.videos) ? data.videos : [];
      window.__bcciVideosUpdated = data.updatedAt || null;
      fillYears();
      render();
    })
    .catch(() => {
      status.textContent =
        "Could not load the BCCI video feed. Check the latest GitHub Actions run.";
    });
})();
