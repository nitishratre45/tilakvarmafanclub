(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORE = {
    badge: "tilak72-fan-badge-v1",
    rituals: "tilak72-fan-rituals-v1",
    memory: "tilak72-fan-memory-v1",
  };
  const safeRead = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };
  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const text = (value) => String(value ?? "").trim();
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  function status(message) {
    const node = $("fan-zone-action-status");
    if (node) node.textContent = message;
  }
  function initBadge() {
    const form = $("fan-badge-form"),
      name = $("fan-nickname"),
      format = $("fan-favourite-format");
    const preview = $("fan-badge-preview");
    if (!form || !name || !format || !preview) return;
    const saved = safeRead(STORE.badge, {});
    if (saved.name) name.value = saved.name;
    if (
      saved.format &&
      [...format.options].some((o) => o.value === saved.format || o.text === saved.format)
    )
      format.value = saved.format;
    const render = () => {
      const nick = text(name.value) || "YOUR NAME";
      preview.innerHTML =
        "<span>THE 72 CLUB</span><strong>" +
        esc(nick) +
        "</strong><small>FAN MEMBER · " +
        esc(format.value.toUpperCase()) +
        " · JERSEY 72</small>";
    };
    name.addEventListener("input", () => {
      name.setCustomValidity("");
      render();
    });
    format.addEventListener("change", render);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nick = text(name.value).slice(0, 22);
      if (!nick) {
        name.focus();
        name.setCustomValidity("Enter a fan name first.");
        name.reportValidity();
        return;
      }
      name.setCustomValidity("");
      safeWrite(STORE.badge, { name: nick, format: format.value });
      render();
      status("Your 72 Club badge is ready on this device.");
    });
    $("fan-badge-copy")?.addEventListener("click", async () => {
      const nick = text(name.value) || "72 Army";
      const line = "THE 72 CLUB | " + nick + " | " + format.value + " | Jersey 72";
      try {
        await navigator.clipboard.writeText(line);
        status("Badge text copied! Share it with your fan group.");
      } catch {
        status(line);
      }
    });
    render();
  }
  function initRituals() {
    const host = $("fan-ritual-list");
    if (!host) return;
    const boxes = [...host.querySelectorAll('input[type="checkbox"][data-ritual]')];
    const saved = safeRead(STORE.rituals, {});
    boxes.forEach((box) => {
      box.checked = saved[box.dataset.ritual] === true;
    });
    const update = () => {
      const state = {};
      boxes.forEach((box) => {
        state[box.dataset.ritual] = box.checked;
      });
      safeWrite(STORE.rituals, state);
      const count = boxes.filter((box) => box.checked).length;
      if ($("fan-ritual-progress-text"))
        $("fan-ritual-progress-text").textContent = count + " of " + boxes.length + " completed";
      if ($("fan-ritual-progress-bar"))
        $("fan-ritual-progress-bar").style.width =
          (boxes.length ? (count / boxes.length) * 100 : 0) + "%";
    };
    boxes.forEach((box) => box.addEventListener("change", update));
    $("fan-ritual-reset")?.addEventListener("click", () => {
      boxes.forEach((box) => {
        box.checked = false;
      });
      update();
      status("Checklist reset.");
    });
    update();
  }
  function initMemory() {
    const form = $("fan-memory-form"),
      title = $("fan-memory-title"),
      note = $("fan-memory-note"),
      output = $("fan-memory-saved");
    if (!form || !title || !note || !output) return;
    const render = () => {
      const saved = safeRead(STORE.memory, null);
      if (!saved || !saved.title || !saved.note) {
        output.textContent = "No saved memory yet.";
        return;
      }
      output.innerHTML =
        "<strong>" +
        esc(saved.title) +
        "</strong>" +
        esc(saved.note) +
        "<small>Saved privately in this browser" +
        (saved.savedAt ? " · " + esc(saved.savedAt) : "") +
        "</small>";
      title.value = saved.title;
      note.value = saved.note;
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = text(title.value),
        n = text(note.value);
      if (!t || !n) return;
      const saved = {
        title: t.slice(0, 60),
        note: n.slice(0, 600),
        savedAt: new Date().toLocaleDateString(),
      };
      if (safeWrite(STORE.memory, saved)) {
        render();
        status("Fan memory saved privately on this device.");
      } else status("Browser storage is unavailable. Your memory could not be saved.");
    });
    $("fan-memory-delete")?.addEventListener("click", () => {
      try {
        localStorage.removeItem(STORE.memory);
      } catch {}
      title.value = "";
      note.value = "";
      output.textContent = "No saved memory yet.";
      status("Saved fan memory cleared from this browser.");
    });
    render();
  }
  function initChant() {
    $("fan-chant-copy")?.addEventListener("click", async () => {
      const chant = "Number 72, we back you through and through! 🧡";
      try {
        await navigator.clipboard.writeText(chant);
        status("Chant copied! Share it with your fan group.");
      } catch {
        status(chant);
      }
    });
  }
  function init() {
    initBadge();
    initRituals();
    initMemory();
    initChant();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
