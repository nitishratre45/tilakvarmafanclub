/* Lightweight section module; shared business logic remains in admin/assets/admin-core.js. */
(() => {
  const root = document.getElementById("data-editor");
  if (!root || root.dataset.adminSectionModule) return;
  root.dataset.adminSectionModule = "stats-death-overs";
})();
