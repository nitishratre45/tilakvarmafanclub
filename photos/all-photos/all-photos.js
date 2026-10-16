(() => {
  "use strict";
  const grid = document.getElementById("all-photos-grid");
  const count = document.getElementById("all-photos-count");
  const search = document.getElementById("photo-search");
  const sort = document.getElementById("photo-sort");
  const more = document.getElementById("load-more-photos");
  const empty = document.getElementById("all-photos-empty");
  if (!grid) return;
  const escapeHTML = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const safeURL = (value) => {
    try {
      const url = new URL(value, window.location.origin);
      return url.protocol === "https:" || url.origin === window.location.origin ? url.href : "";
    } catch {
      return "";
    }
  };
  let photos = [];
  let filtered = [];
  let visibleCount = 40;
  let activeIndex = 0;
  let lightbox;
  function ensureLightbox() {
    if (lightbox) return;
    lightbox = document.createElement("div");
    lightbox.className = "photo-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Photo viewer");
    lightbox.innerHTML =
      '<button class="lightbox-close" type="button" aria-label="Close photo">×</button><button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous photo">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lightbox-nav lightbox-next" type="button" aria-label="Next photo">›</button><div class="tv-lightbox-tools"><span class="tv-lightbox-count"></span><a class="tv-lightbox-download" download>↓ Download photo</a></div>';
    document.body.appendChild(lightbox);
    lightbox.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
    lightbox
      .querySelector(".lightbox-prev")
      .addEventListener("click", () => openPhoto(activeIndex - 1));
    lightbox
      .querySelector(".lightbox-next")
      .addEventListener("click", () => openPhoto(activeIndex + 1));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", (event) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") openPhoto(activeIndex - 1);
      if (event.key === "ArrowRight") openPhoto(activeIndex + 1);
    });
  }
  function openPhoto(index) {
    if (!filtered.length) return;
    activeIndex = (index + filtered.length) % filtered.length;
    ensureLightbox();
    const photo = filtered[activeIndex];
    const img = lightbox.querySelector("img");
    const caption = lightbox.querySelector("figcaption");
    img.style.display = "";
    img.onerror = () => {
      img.style.display = "none";
      caption.textContent = (photo.title || "Tilak Varma photo") + " — preview unavailable.";
    };
    img.onload = () => {
      img.style.display = "";
    };
    img.src = photo.safe;
    img.alt = photo.title || "Tilak Varma photo";
    caption.textContent = displayTitle(photo);
    const download = lightbox.querySelector(".tv-lightbox-download");
    download.href = photo.safe.includes("res.cloudinary.com/")
      ? photo.safe.replace("/upload/", "/upload/fl_attachment/")
      : photo.safe;
    download.download = (displayTitle(photo) || "tilak-varma-photo").replace(/[^a-z0-9-_]+/gi, "-") + ".jpg";
    lightbox.querySelector(".tv-lightbox-count").textContent = (activeIndex + 1) + " / " + filtered.length;
    lightbox.classList.add("is-open");
    document.body.classList.add("lightbox-locked");
    lightbox.querySelector(".lightbox-close").focus();
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    document.body.classList.remove("lightbox-locked");
  }
  function displayTitle(photo) {
    const title = String(photo.title || "").trim();
    return !title || /^#?\\d{1,4}$/.test(title) ? "Photo " + title.replace(/^#/, "") : title;
  }
  function render() {
    const term = search.value.trim().toLowerCase();
    filtered = photos.filter((photo) =>
      [displayTitle(photo), photo.createdAt].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term),
      ),
    );
    const order = sort.value;
    filtered.sort((a, b) => {
      if (order === "album") return String(a.title || "").localeCompare(String(b.title || ""));
      const at = Date.parse(a.createdAt || "") || 0;
      const bt = Date.parse(b.createdAt || "") || 0;
      return order === "oldest" ? at - bt : bt - at;
    });
    const visible = filtered.slice(0, visibleCount);
    count.textContent = filtered.length + " of " + photos.length + " photos";
    empty.hidden = filtered.length !== 0;
    grid.innerHTML = visible
      .map((photo, index) => {
        const date =
          photo.createdAt && !Number.isNaN(Date.parse(photo.createdAt))
            ? new Date(photo.createdAt).toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "Date unavailable";
        return (
          '<button class="photo-card" type="button" data-photo-index="' +
          index +
          '" aria-label="Open ' +
          escapeHTML(displayTitle(photo)) +
          '"><img src="' +
          photo.safe +
          '" alt="' +
          escapeHTML(displayTitle(photo)) +
          '" loading="lazy" decoding="async"><span class="photo-card-caption"><strong>' +
          escapeHTML(displayTitle(photo)) +
          "</strong><small>" +
          escapeHTML(date) +
          "</small></span></button>"
        );
      })
      .join("");
    more.hidden = filtered.length <= visibleCount;
    grid
      .querySelectorAll("[data-photo-index]")
      .forEach((button) =>
        button.addEventListener("click", () => openPhoto(Number(button.dataset.photoIndex))),
      );
    grid.querySelectorAll("img").forEach((img) =>
      img.addEventListener(
        "error",
        () => {
          img.alt = "Photo preview unavailable";
          img.style.objectFit = "contain";
          img.style.padding = "24px";
        },
        { once: true },
      ),
    );
  }
  search.addEventListener("input", () => {
    visibleCount = 40;
    render();
  });
  sort.addEventListener("change", () => {
    visibleCount = 40;
    render();
  });
  more.addEventListener("click", () => {
    visibleCount += 40;
    render();
  });
  fetch("/photos/all-photos/photos.json?v=20261015-archive1", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Photo data unavailable");
      return response.json();
    })
    .then((data) => {
      photos = (Array.isArray(data.items) ? data.items : [])
        .filter((item) => item && item.type !== "video")
        .map((item) => ({ ...item, safe: safeURL(item.url) }))
        .filter((item) => item.safe)
        .sort(
          (a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0),
        );
      render();
    })
    .catch(() => {
      grid.innerHTML =
        '<div class="empty-state">Photos could not be loaded. Please refresh the page in a moment.</div>';
      count.textContent = "Gallery temporarily unavailable";
    });
})();
