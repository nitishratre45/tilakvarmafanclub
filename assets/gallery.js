(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const host = $("cricinfo-photo-grid");
  const stamp = $("cricinfo-gallery-updated");
  if (!host) return;
  const profileUrl = "https://www.bcci.tv/domestic/men/players/tilak-varma/993";
  const fallbackImage = "https://documents.bcci.tv/resizedimageskirti/11088_compress.png";
  let adminMedia = [];
  let currentPhotoData = { image: fallbackImage };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const render = (data) => {
    currentPhotoData = data || currentPhotoData;
    data = currentPhotoData;
    const image = safeUrl(data.image) || fallbackImage;
    if (!image) {
      host.innerHTML =
        '<div class="bcci-photo-empty"><span class="bcci-photo-mark">72</span><div><strong>Tilak Varma · Official BCCI Photo</strong><p>Photo feed is waiting for the first successful BCCI refresh.</p><a href="' +
        profileUrl +
        '" target="_blank" rel="noopener noreferrer">Open BCCI player profile ↗</a></div></div>';
      if (stamp)
        stamp.textContent = data.checkedAt
          ? "Checked " + data.checkedAt
          : "Waiting for BCCI photo feed";
      return;
    }
    host.innerHTML =
      '<article class="bcci-profile-photo-card"><a class="bcci-profile-photo-open" href="' +
      profileUrl +
      '" target="_blank" rel="noopener noreferrer" aria-label="Open Tilak Varma official BCCI profile"><img src="' +
      esc(image) +
      '" alt="Tilak Varma · Official BCCI player photo" loading="eager" decoding="async" referrerpolicy="strict-origin-when-cross-origin"><span>OFFICIAL BCCI PHOTO · 72</span></a><div class="bcci-profile-photo-caption"><strong>TILAK VARMA</strong><a href="' +
      profileUrl +
      '" target="_blank" rel="noopener noreferrer">BCCI PLAYER PROFILE ↗</a></div></article>';
    if (adminMedia.length) {
      const uploaded = adminMedia.map((item) => {
        const url = safeUrl(item.url);
        if (!url) return "";
        const title = esc(item.title || "Tilak Varma · Fan Club upload");
        if (item.type === "video") {
          return '<article class="admin-gallery-card"><a href="' + url + '" target="_blank" rel="noopener noreferrer"><video src="' + url + '" controls preload="metadata" playsinline></video></a><div class="bcci-profile-photo-caption"><strong>' + title + '</strong><span>FAN CLUB VIDEO</span></div></article>';
        }
        return '<article class="admin-gallery-card"><a class="bcci-profile-photo-open" href="' + url + '" target="_blank" rel="noopener noreferrer"><img src="' + url + '" alt="' + title + '" loading="lazy" decoding="async"><span>FAN CLUB PHOTO · 72</span></a><div class="bcci-profile-photo-caption"><strong>' + title + '</strong><span>CLOUDINARY</span></div></article>';
      }).join("");
      host.insertAdjacentHTML("beforeend", uploaded);
    }
    const img = host.querySelector("img");
    img.addEventListener(
      "error",
      () => {
        host.innerHTML =
          '<div class="bcci-photo-empty"><span class="bcci-photo-mark">72</span><div><strong>Official BCCI photo temporarily unavailable</strong><p>The saved BCCI image could not be loaded right now.</p><a href="' +
          profileUrl +
          '" target="_blank" rel="noopener noreferrer">Open BCCI player profile ↗</a></div></div>';
      },
      { once: true },
    );
    if (stamp)
      stamp.textContent =
        (data.updatedAt ? "BCCI photo updated " + data.updatedAt : "BCCI photo saved") +
        (data.lastAttemptStatus === "source-unavailable" ? " · previous photo kept" : "");
  };
  fetch("data/admin-media.json?v=20261010-adminmedia1", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : { items: [] })
    .then((data) => { adminMedia = Array.isArray(data.items) ? data.items : []; render(currentPhotoData); })
    .catch(() => {});
  fetch("data/bcci-tilak-photo.json?v=20261010-fix1", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Photo feed HTTP " + response.status);
      return response.json();
    })
    .then(render)
    .catch(() => render({ image: fallbackImage, status: "fallback" }));
})();
