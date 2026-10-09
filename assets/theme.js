(function () {
  "use strict";
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-theme-choice]")];
  const status = document.getElementById("theme-status");
  const allowed = new Set(["light", "dark", "system"]);
  const media = window.matchMedia("(prefers-color-scheme: light)");
  function apply(theme, save) {
    const value = allowed.has(theme) ? theme : "system";
    const resolved = value === "system" ? (media.matches ? "light" : "dark") : value;
    root.dataset.theme = value;
    root.dataset.themeResolved = resolved;
    root.style.colorScheme = resolved;
    buttons.forEach((button) => {
      const active = button.dataset.themeChoice === value;
      button.setAttribute("aria-pressed", String(active));
    });
    if (status)
      status.textContent =
        "Active appearance: " +
        (value === "system"
          ? "System (" + resolved + ")"
          : value.charAt(0).toUpperCase() + value.slice(1)) +
        ". Preference saved on this device.";
    if (save) {
      try {
        localStorage.setItem("tilak-fc-theme", value);
      } catch (_) {}
    }
  }
  let initial = "system";
  try {
    initial = localStorage.getItem("tilak-fc-theme") || "system";
  } catch (_) {}
  apply(initial, false);
  buttons.forEach((button) =>
    button.addEventListener("click", () => apply(button.dataset.themeChoice, true)),
  );
  if (media.addEventListener)
    media.addEventListener("change", () => {
      let value = "system";
      try {
        value = localStorage.getItem("tilak-fc-theme") || "system";
      } catch (_) {}
      if (value === "system") apply(value, false);
    });
  else if (media.addListener)
    media.addListener(() => {
      let value = "system";
      try {
        value = localStorage.getItem("tilak-fc-theme") || "system";
      } catch (_) {}
      if (value === "system") apply(value, false);
    });
})();
