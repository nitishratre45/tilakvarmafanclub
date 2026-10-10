(() => {
  "use strict";
  const host = document.getElementById("cricinfo-photo-grid");
  const stamp = document.getElementById("cricinfo-gallery-updated");
  if (!host) return;

  const safeUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

  function render(items, updatedAt) {
    const validItems = (Array.isArray(items) ? items : [])
      .map((item) => ({ ...item, safe: safeUrl(item.url) }))
      .filter((item) => item.safe);
    if (!validItems.length) {
      host.innerHTML = '<div class="bcci-photo-empty"><span class="bcci-photo-mark">72</span><div><strong>No photos uploaded yet</strong><p>Photos added through Admin Studio will appear here.</p><a href="/admin/">Open Admin Studio ↗</a></div></div>';
      if (stamp) stamp.textContent = "Fan Club uploads";
      return;
    }
    host.innerHTML = validItems.map((item) => {
      const title = esc(item.title || "Tilak Varma · Fan Club upload");
      if (item.type === "video") {
        return '<article class="admin-gallery-card"><a href="' + item.safe + '" target="_blank" rel="noopener noreferrer"><video src="' + item.safe + '" controls preload="metadata" playsinline></video></a><div class="bcci-profile-photo-caption"><strong>' + title + '</strong><span>FAN CLUB VIDEO</span></div></article>';
      }
      return '<article class="admin-gallery-card"><a class="bcci-profile-photo-open" href="' + item.safe + '" target="_blank" rel="noopener noreferrer"><img src="' + item.safe + '" alt="' + title + '" loading="lazy" decoding="async"><span>FAN CLUB PHOTO · 72</span></a><div class="bcci-profile-photo-caption"><strong>' + title + '</strong><span>FAN CLUB GALLERY</span></div></article>';
    }).join("");
    if (stamp) stamp.textContent = "Fan Club uploads" + (updatedAt ? " · Updated " + updatedAt : "");
  }

  fetch("data/admin-media.json?v=20261010-fan-gallery2", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Gallery data unavailable");
      return response.json();
    })
    .then((data) => render(data.items, data.updatedAt))
    .catch(() => {
      host.innerHTML = '<div class="bcci-photo-empty"><span class="bcci-photo-mark">72</span><div><strong>Gallery could not load</strong><p>Please refresh the page in a moment.</p><a href="/admin/">Open Admin Studio ↗</a></div></div>';
      if (stamp) stamp.textContent = "Gallery temporarily unavailable";
    });
})();