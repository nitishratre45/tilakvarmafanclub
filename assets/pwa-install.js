(() => {
  "use strict";
  let installPrompt = null;
  const button = document.getElementById("pwa-install-button");
  if (!button) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const showHelp = () => {
    const message = isIOS
      ? 'To install this site on iPhone/iPad:\n1. Open it in Safari.\n2. Tap Share.\n3. Choose “Add to Home Screen”.'
      : 'To install this site:\n1. Open your browser menu (⋮).\n2. Choose “Install app” or “Add to Home screen”.\n\nIf the option is missing, update your browser and open this site over HTTPS.';
    window.alert(message);
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.textContent = "Install app";
    button.dataset.installReady = "true";
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.textContent = "App installed";
    button.disabled = true;
    button.setAttribute("aria-label", "App installed");
  });

  button.addEventListener("click", async () => {
    if (!installPrompt) {
      showHelp();
      return;
    }
    const promptEvent = installPrompt;
    installPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        button.textContent = "Installing…";
      } else {
        button.textContent = "Install app";
      }
    } catch (_) {
      showHelp();
    }
  });

  if (isIOS) button.title = "Add this site to your Home Screen";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("PWA service worker registration failed:", error);
      });
    });
  }
})();