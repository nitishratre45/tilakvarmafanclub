(() => {
  "use strict";
  const SELECTOR = "select";
  let openControl = null;
  let overlay = null;

  const isMobile = () => window.matchMedia("(max-width: 640px)").matches;
  const labelFor = (select) => {
    const label = select.labels && select.labels[0];
    return (label && label.textContent.trim()) || select.getAttribute("aria-label") || select.id.replace(/[-_]/g, " ") || "Choose an option";
  };
  const selectedOption = (select) => select.options[select.selectedIndex] || select.options[0] || null;

  function closeMenu() {
    if (!overlay) return;
    const old = openControl;
    overlay.remove();
    overlay = null;
    openControl = null;
    if (old) {
      old.button.setAttribute("aria-expanded", "false");
      old.wrapper.classList.remove("is-open");
    }
  }

  function sync(control) {
    const option = selectedOption(control.select);
    control.buttonText.textContent = option ? option.textContent.trim() : "Choose…";
    control.button.disabled = control.select.disabled || control.select.options.length === 0;
    control.button.setAttribute("aria-label", labelFor(control.select) + ": " + control.buttonText.textContent);
    control.button.classList.toggle("has-value", !!option);
    if (overlay && openControl === control) renderOptions(control);
  }

  function renderOptions(control) {
    if (!overlay || openControl !== control) return;
    const list = overlay.querySelector(".cs-options");
    if (!list) return;
    list.replaceChildren();
    Array.from(control.select.options).forEach((option, index) => {
      if (option.hidden) return;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "cs-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === control.select.value));
      item.disabled = option.disabled;
      const text = document.createElement("span");
      text.className = "cs-option-label";
      text.textContent = option.textContent.trim();
      item.append(text);
      const mark = document.createElement("span");
      mark.className = "cs-option-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = option.value === control.select.value ? "✓" : "";
      item.append(mark);
      item.addEventListener("click", () => {
        if (option.disabled) return;
        control.select.selectedIndex = index;
        control.select.dispatchEvent(new Event("change", { bubbles: true }));
        sync(control);
        closeMenu();
        control.button.focus({ preventScroll: true });
      });
      list.append(item);
    });
    const current = list.querySelector('[aria-selected="true"]');
    if (current) current.scrollIntoView({ block: "nearest" });
  }

  function openMenu(control) {
    if (control.select.disabled || !control.select.options.length) return;
    if (openControl === control) { closeMenu(); return; }
    closeMenu();
    openControl = control;
    control.button.setAttribute("aria-expanded", "true");
    control.wrapper.classList.add("is-open");

    overlay = document.createElement("div");
    overlay.className = "cs-overlay";
    overlay.innerHTML = '<div class="cs-dialog" role="dialog" aria-modal="true"><div class="cs-dialog-head"><div><span class="cs-kicker">SELECT OPTION</span><strong class="cs-dialog-title"></strong></div><button type="button" class="cs-close" aria-label="Close options">×</button></div><div class="cs-options" role="listbox"></div></div>';
    overlay.querySelector(".cs-dialog-title").textContent = labelFor(control.select);
    overlay.querySelector(".cs-close").addEventListener("click", closeMenu);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) closeMenu(); });
    document.body.append(overlay);
    renderOptions(control);

    if (isMobile()) {
      overlay.classList.add("is-mobile");
    } else {
      const rect = control.button.getBoundingClientRect();
      const dialog = overlay.querySelector(".cs-dialog");
      const maxHeight = Math.min(window.innerHeight * 0.68, 420);
      dialog.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(Math.max(rect.width, 260), window.innerWidth - 24) - 12)) + "px";
      dialog.style.width = Math.min(Math.max(rect.width, 260), window.innerWidth - 24) + "px";
      dialog.style.maxHeight = maxHeight + "px";
      const estimated = Math.min(control.select.options.length * 52 + 76, maxHeight);
      const below = window.innerHeight - rect.bottom;
      dialog.style.top = (below >= estimated || below > rect.top ? rect.bottom + 8 : Math.max(12, rect.top - estimated - 8)) + "px";
    }
    const current = overlay.querySelector('[aria-selected="true"]');
    if (current) current.focus({ preventScroll: true });
    else overlay.querySelector(".cs-option")?.focus({ preventScroll: true });
  }

  function enhance(select) {
    if (select.dataset.customSelectReady === "true" || select.multiple || select.size > 1) return;
    select.dataset.customSelectReady = "true";
    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select);
    select.classList.add("cs-native-select");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cs-trigger";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    const buttonText = document.createElement("span");
    buttonText.className = "cs-trigger-text";
    const arrow = document.createElement("span");
    arrow.className = "cs-trigger-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    button.append(buttonText, arrow);
    wrapper.append(button);

    const control = { select, wrapper, button, buttonText };
    button.addEventListener("click", () => openMenu(control));
    select.addEventListener("change", () => sync(control));
    const observer = new MutationObserver(() => sync(control));
    observer.observe(select, { childList: true, subtree: true, attributes: true });
    control.observer = observer;
    sync(control);
  }

  document.querySelectorAll(SELECTOR).forEach(enhance);
  const pageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches(SELECTOR)) enhance(node);
      node.querySelectorAll?.(SELECTOR).forEach(enhance);
    }));
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("keydown", (event) => {
    if (!overlay) return;
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); openControl?.button.focus(); return; }
    const items = Array.from(overlay.querySelectorAll(".cs-option:not(:disabled)"));
    const index = items.indexOf(document.activeElement);
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index < 0 ? 0 : index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  });
  window.addEventListener("resize", () => { if (overlay) closeMenu(); });
  window.addEventListener("scroll", () => { if (overlay && !isMobile()) closeMenu(); }, true);
})();