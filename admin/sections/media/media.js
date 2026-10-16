(() => {
  const root = document.getElementById("media");
  if (!root) return;
  root.dataset.adminSectionModule = "media";
  root.querySelectorAll("img").forEach((img) => {
    img.loading = "lazy";
    img.decoding = "async";
  });
})();
