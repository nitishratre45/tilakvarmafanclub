/* Lightweight section module; shared business logic remains in admin/assets/admin-core.js. */
(() => {
  const root = document.getElementById("matches-manager");
  if (!root || root.dataset.adminSectionModule) return;
  root.dataset.adminSectionModule = "matches";
})();
