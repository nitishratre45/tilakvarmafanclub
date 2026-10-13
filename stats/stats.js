(() => {
  "use strict";
  const root = document.getElementById("stats");
  if (!root) return;
  const views = new Set(["stats-overview", "stats-bowling", "statsguru"]);
  const readView = () => {
    const requested = new URL(location.href).searchParams.get("view");
    if (views.has(requested)) return requested;
    try {
      const saved = sessionStorage.getItem("tilak-stats-view");
      if (views.has(saved)) return saved;
    } catch (_) {}
    return "stats-overview";
  };
  const setView = (view, updateUrl = true) => {
    if (!views.has(view)) view = "stats-overview";
    root.querySelectorAll(".stats-subview").forEach((node) => {
      node.hidden = node.id !== view;
      node.setAttribute("aria-hidden", String(node.hidden));
    });
    root.querySelectorAll("[data-stats-tab]").forEach((button) => {
      const active = button.dataset.statsTab === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    try { sessionStorage.setItem("tilak-stats-view", view); } catch (_) {}
    if (updateUrl) {
      const url = new URL(location.href);
      if (view === "stats-overview") url.searchParams.delete("view");
      else url.searchParams.set("view", view);
      history.replaceState({ statsView: view }, "", url.pathname + url.search + url.hash);
    }
  };
  root.querySelectorAll("[data-stats-tab]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.statsTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...root.querySelectorAll("[data-stats-tab]")];
      const current = tabs.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
        (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      setView(tabs[next].dataset.statsTab);
    });
  });
  setView(readView(), false);
  window.addEventListener("pageshow", () => setView(readView(), false));
})();
