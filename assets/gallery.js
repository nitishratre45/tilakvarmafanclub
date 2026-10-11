(() => {
  "use strict";
  const host = document.getElementById("cricinfo-photo-grid");
  const stamp = document.getElementById("cricinfo-gallery-updated");
  if (!host) return;
  const safeUrl = (value) => {
    try {
      const url = new URL(value, window.location.origin);
      return url.protocol === "https:" || url.origin === window.location.origin ? url.href : "";
    } catch {
      return "";
    }
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  let albums = [];
  let activeAlbum = null;
  let activeIndex = 0;
  let lightbox = null;
  function ensureLightbox() {
    if (lightbox) return;
    lightbox = document.createElement("div");
    lightbox.className = "tv-photo-lightbox";
    lightbox.id = "tv-photo-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Photo viewer");
    lightbox.innerHTML =
      '<button class="tv-lightbox-close" type="button" aria-label="Close photo viewer">×</button><button class="tv-lightbox-nav tv-lightbox-prev" type="button" aria-label="Previous photo">‹</button><figure class="tv-lightbox-figure"><img alt=""><figcaption></figcaption></figure><button class="tv-lightbox-nav tv-lightbox-next" type="button" aria-label="Next photo">›</button><div class="tv-lightbox-tools"><span class="tv-lightbox-count"></span><a class="tv-lightbox-download" download>↓ Download photo</a></div>';
    document.body.appendChild(lightbox);
    lightbox.querySelector(".tv-lightbox-close").addEventListener("click", closeLightbox);
    lightbox.querySelector(".tv-lightbox-prev").addEventListener("click", () => movePhoto(-1));
    lightbox.querySelector(".tv-lightbox-next").addEventListener("click", () => movePhoto(1));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") movePhoto(-1);
      if (event.key === "ArrowRight") movePhoto(1);
    });
  }
  function openPhoto(index) {
    if (!activeAlbum || !activeAlbum.photos.length) return;
    activeIndex = (index + activeAlbum.photos.length) % activeAlbum.photos.length;
    ensureLightbox();
    const photo = activeAlbum.photos[activeIndex];
    const img = lightbox.querySelector("img");
    const caption = lightbox.querySelector("figcaption");
    const download = lightbox.querySelector(".tv-lightbox-download");
    img.style.display = "";
    img.onerror = () => {
      img.style.display = "none";
      caption.textContent = photo.title + " — preview unavailable from the image host.";
      if (photo.storage === "external") {
        const source = document.createElement("a");
        source.href = photo.safe;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        source.textContent = " Open original photo ↗";
        caption.appendChild(source);
      }
    };
    img.onload = () => {
      img.style.display = "";
      caption.textContent = photo.title;
    };
    img.alt = photo.title;
    img.src = photo.safe;
    caption.textContent = photo.title;
    lightbox.querySelector(".tv-lightbox-count").textContent =
      activeIndex + 1 + " / " + activeAlbum.photos.length;
    if (photo.storage === "external") {
      download.href = photo.safe;
      download.textContent = "↗ Open original photo";
      download.removeAttribute("download");
      download.target = "_blank";
      download.rel = "noopener noreferrer";
    } else {
      download.href = photo.safe.includes("res.cloudinary.com/")
        ? photo.safe.replace("/upload/", "/upload/fl_attachment/")
        : photo.safe;
      download.textContent = "↓ Download photo";
      download.setAttribute(
        "download",
        (photo.title || "tilak-varma-photo").replace(/[^a-z0-9-_]+/gi, "-") + ".jpg",
      );
      download.removeAttribute("target");
      download.removeAttribute("rel");
    }
    lightbox.classList.add("is-open");
    document.body.classList.add("tv-lightbox-lock");
    lightbox.querySelector(".tv-lightbox-close").focus();
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    document.body.classList.remove("tv-lightbox-lock");
  }
  function movePhoto(delta) {
    openPhoto(activeIndex + delta);
  }
  host.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || !img.closest(".tv-album-cover, .tv-album-photo")) return;
      img.style.display = "none";
      const fallback = document.createElement("span");
      fallback.className = "tv-photo-source-fallback";
      fallback.textContent = "Preview unavailable";
      img.parentElement?.appendChild(fallback);
    },
    true,
  );
  function renderAlbumPhotos(album) {
    activeAlbum = album;
    document.getElementById("photos")?.classList.add("tv-album-view-active");
    const photoMarkup = album.photos
      .map(
        (photo, index) =>
          '<button class="tv-album-photo" type="button" data-photo-index="' +
          index +
          '" aria-label="Open ' +
          esc(photo.title) +
          '"><img src="' +
          photo.safe +
          '" alt="' +
          esc(photo.title) +
          '" loading="lazy" decoding="async"><span class="tv-photo-open-icon">↗</span></button>',
      )
      .join("");
    host.innerHTML =
      '<div class="tv-album-detail"><header class="tv-album-hero"><button type="button" class="tv-album-back" aria-label="Back to all albums">← All albums</button><h2>' +
      esc(album.name) +
      "</h2><p>PHOTO GALLERY <span>·</span> " +
      album.photos.length +
      ' photos</p></header><div class="tv-album-photo-grid">' +
      photoMarkup +
      "</div></div>";
    host
      .querySelectorAll(".tv-album-back")
      .forEach((button) => button.addEventListener("click", renderAlbums));
    host
      .querySelectorAll("[data-photo-index]")
      .forEach((button) =>
        button.addEventListener("click", () => openPhoto(Number(button.dataset.photoIndex))),
      );
  }
  function renderAlbums() {
    activeAlbum = null;
    document.getElementById("photos")?.classList.remove("tv-album-view-active");
    const photos = albums.filter((album) => album.photos.length);
    if (!photos.length) {
      host.innerHTML =
        '<div class="bcci-photo-empty"><span class="bcci-photo-mark">72</span><div><strong>No photo albums yet</strong><p>Series-wise albums uploaded in Admin Studio will appear here.</p><a href="/admin/">Open Admin Studio ↗</a></div></div>';
      return;
    }
    host.innerHTML =
      '<div class="tv-album-grid">' +
      photos
        .map(
          (album, index) =>
            '<button type="button" class="tv-album-card" data-album-index="' +
            index +
            '"><span class="tv-album-cover"><img src="' +
            album.cover.safe +
            '" alt="" loading="lazy"><span class="tv-album-count">' +
            album.photos.length +
            " PHOTO" +
            (album.photos.length === 1 ? "" : "S") +
            '</span><span class="tv-album-open">EXPLORE PHOTOS ↗</span></span><span class="tv-album-info"><strong>' +
            esc(album.name) +
            "</strong><small>" +
            "Uploaded " +
            esc(
              album.uploadDate
                ? new Date(album.uploadDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Date unavailable",
            ) +
            "</small></span></button>",
        )
        .join("") +
      "</div>";
    host
      .querySelectorAll("[data-album-index]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          renderAlbumPhotos(photos[Number(button.dataset.albumIndex)]),
        ),
      );
  }
  fetch("data/admin-media.json?v=20261011-series-albums", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Gallery data unavailable");
      return response.json();
    })
    .then((data) => {
      const items = (Array.isArray(data.items) ? data.items : [])
        .map((item) => ({ ...item, safe: safeUrl(item.url) }))
        .filter((item) => item.safe && item.type !== "video");
      const names = Array.isArray(data.albums) ? data.albums : [];
      const grouped = new Map();
      names.forEach((name) => {
        if (typeof name === "string" && name.trim()) grouped.set(name, []);
      });
      items.forEach((item) => {
        const name =
          typeof item.album === "string" && item.album.trim()
            ? item.album.trim()
            : "General Photos";
        if (!grouped.has(name)) grouped.set(name, []);
        grouped.get(name).push(item);
      });
      albums = [...grouped.entries()]
        .map(([name, photos]) => ({ name, photos, cover: photos[0] || null }))
        .filter((album) => album.cover);
      albums.forEach((album) => {
        const uploadTimes = album.photos
          .map((photo) => photo.createdAt)
          .filter((value) => value && !Number.isNaN(Date.parse(value)))
          .sort((a, b) => Date.parse(b) - Date.parse(a));
        album.uploadDate = uploadTimes[0] || "";
      });
      renderAlbums();
      if (stamp)
        stamp.textContent =
          albums.length +
          " albums · " +
          items.length +
          " photos" +
          (data.updatedAt ? " · Updated " + new Date(data.updatedAt).toLocaleDateString() : "");
    })
    .catch(() => {
      host.innerHTML =
        '<div class="bcci-photo-empty"><span class="bcci-photo-mark">72</span><div><strong>Gallery could not load</strong><p>Please refresh the page in a moment.</p><a href="/admin/">Open Admin Studio ↗</a></div></div>';
      if (stamp) stamp.textContent = "Gallery temporarily unavailable";
    });
})();
