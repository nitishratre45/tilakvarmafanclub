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

  function addFanExtras() {
    const grid = document.querySelector("#fan-zone .fan-zone-grid");
    if (!grid || document.getElementById("fan-caption-lab")) return;
    const card = (id, eyebrow, title, body, inner) => {
      const el = document.createElement("article");
      el.className = "fan-card fan-club-card";
      el.id = id;
      el.innerHTML = '<div class="feature-eyebrow">' + eyebrow + '</div><h3>' + title + '</h3><p class="fan-card-intro">' + body + '</p>' + inner;
      grid.appendChild(el);
      return el;
    };
    const style = document.createElement("style");
    style.textContent = `
      .fan-extra-controls{display:grid;gap:10px;margin-top:12px}
      .fan-extra-controls select,.fan-extra-controls input{width:100%;min-width:0}
      .fan-caption-output{padding:14px;border:1px solid var(--border,rgba(255,255,255,.16));border-radius:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
      .fan-poster-preview{width:100%;max-width:300px;aspect-ratio:4/5;margin:14px auto;padding:22px;display:flex;flex-direction:column;justify-content:space-between;text-align:left;border-radius:14px;background:linear-gradient(145deg,#07101f,#0b5b43 65%,#f28c28);color:#fff;box-shadow:0 12px 32px #0003}
      .fan-poster-preview .poster-number{font-size:clamp(56px,12vw,86px);font-weight:900;line-height:1;letter-spacing:-.07em}
      .fan-poster-preview .poster-title{font-size:clamp(20px,5vw,28px);font-weight:900;line-height:1.08}
      .fan-poster-preview small{font-weight:800;letter-spacing:.12em}
      .fan-support-buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .fan-support-buttons button{flex:1;min-width:90px}
      .fan-support-count{font-size:28px;font-weight:900;margin:8px 0}
    `;
    document.head.appendChild(style);

    const captions = [
      "Calm under pressure. Fearless when it matters. That's our No. 72. 🧡",
      "Different match, same belief. Always backing Tilak Varma. 🇮🇳",
      "Built for the big moments. The 72 Club stands tall. 💥",
      "From Hyderabad to the biggest stage — keep shining, Tilak! ✨",
      "Talent, temperament and a touch of class. Our favourite left-hander. 🏏",
      "Win or lose, the support never changes. #TilakVarma #The72Club"
    ];
    const captionCard = card("fan-caption-lab","CAPTION LAB","Your next <em>fan post</em>","Create a ready-to-copy caption for your Tilak Varma edit, story or match post.",`
      <div class="fan-extra-controls"><label for="fan-caption-style">Post vibe</label>
      <select id="fan-caption-style"><option value="hype">Matchday hype</option><option value="edit">Player edit</option><option value="support">Support message</option><option value="milestone">Milestone post</option></select>
      <div id="fan-caption-output" class="fan-caption-output" aria-live="polite"></div>
      <button class="button primary" type="button" id="fan-caption-generate">NEW CAPTION ↻</button>
      <button class="button outline" type="button" id="fan-caption-copy">COPY CAPTION ↗</button></div>`);
    let captionIndex = -1;
    const captionOutput = captionCard.querySelector("#fan-caption-output");
    const makeCaption = () => {
      const vibe = captionCard.querySelector("#fan-caption-style").value;
      const pool = vibe === "hype" ? [captions[0],captions[2],captions[5]] : vibe === "edit" ? [captions[0],captions[3],captions[4]] : vibe === "support" ? [captions[1],captions[3],captions[5]] : ["Another milestone in the making. Keep rising, Tilak Varma. 📈🧡",captions[2],captions[4]];
      let next = Math.floor(Math.random()*pool.length);
      if (pool.length > 1 && pool[next] === captionOutput.textContent) next = (next+1)%pool.length;
      captionIndex = next; captionOutput.textContent = pool[next] + "\\n\\n#TilakVarma #The72Club";
    };
    captionCard.querySelector("#fan-caption-generate").addEventListener("click",makeCaption);
    captionCard.querySelector("#fan-caption-style").addEventListener("change",makeCaption);
    captionCard.querySelector("#fan-caption-copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(captionOutput.textContent);status("Caption copied — ready for your fan post!");}catch{status(captionOutput.textContent);}});
    makeCaption();

    const posterCard = card("fan-poster-lab","THE 72 CREATIVE STUDIO","Make a <em>72 Club poster</em>","Generate an original India-themed fan graphic. No player photo is fabricated or altered; add your own photo in your editor if needed.",`
      <div class="fan-extra-controls"><label for="fan-poster-title">Poster headline</label><input id="fan-poster-title" maxlength="34" value="BUILT FOR BIG MOMENTS" />
      <label for="fan-poster-subtitle">Small line</label><input id="fan-poster-subtitle" maxlength="48" value="TILAK VARMA · INDIA" />
      <div class="fan-poster-preview" id="fan-poster-preview"><small>THE 72 CLUB</small><div class="poster-number">72</div><div class="poster-title">BUILT FOR BIG MOMENTS</div><small>TILAK VARMA · INDIA</small></div>
      <button class="button primary" id="fan-poster-download" type="button">DOWNLOAD 1080 × 1350 PNG ↗</button></div>`);
    const posterTitle = posterCard.querySelector("#fan-poster-title"), posterSub = posterCard.querySelector("#fan-poster-subtitle"), posterPreview = posterCard.querySelector("#fan-poster-preview");
    const renderPoster = () => { posterPreview.querySelector(".poster-title").textContent = text(posterTitle.value).toUpperCase() || "TILAK VARMA"; posterPreview.querySelectorAll("small")[1].textContent = text(posterSub.value).toUpperCase() || "THE 72 CLUB"; };
    posterTitle.addEventListener("input",renderPoster); posterSub.addEventListener("input",renderPoster);
    posterCard.querySelector("#fan-poster-download").addEventListener("click",()=>{
      const canvas=document.createElement("canvas"); canvas.width=1080; canvas.height=1350; const c=canvas.getContext("2d");
      const g=c.createLinearGradient(0,0,1080,1350); g.addColorStop(0,"#07101f");g.addColorStop(.62,"#075b43");g.addColorStop(1,"#f28c28");c.fillStyle=g;c.fillRect(0,0,1080,1350);
      c.strokeStyle="rgba(255,255,255,.16)";c.lineWidth=3;for(let i=0;i<8;i++){c.beginPath();c.arc(920,190,80+i*45,0,Math.PI*2);c.stroke();}
      c.fillStyle="#fff";c.font="800 38px Arial";c.fillText("THE 72 CLUB",78,105);
      c.font="900 390px Arial";c.fillText("72",65,600);
      c.font="900 70px Arial";const headline=(text(posterTitle.value).toUpperCase()||"TILAK VARMA").slice(0,34);const words=headline.split(" ");let line="",y=790;for(const word of words){const test=line?line+" "+word:word;if(c.measureText(test).width>920){c.fillText(line,78,y);y+=86;line=word;}else line=test;}if(line)c.fillText(line,78,y);
      c.fillStyle="#ffb45f";c.fillRect(78,1100,180,9);c.fillStyle="#fff";c.font="700 36px Arial";c.fillText((text(posterSub.value).toUpperCase()||"TILAK VARMA · INDIA").slice(0,48),78,1175);
      c.font="700 25px Arial";c.fillText("FAN-MADE GRAPHIC · NOT AN OFFICIAL TEAM POSTER",78,1285);
      const a=document.createElement("a");a.download="the-72-club-poster.png";a.href=canvas.toDataURL("image/png");a.click();status("Your 1080 × 1350 fan poster was generated.");
    });

    const supportCard = card("fan-support-meter","PERSONAL FAN CHALLENGE","Keep the <em>72 spirit</em> alive","Log your own support actions. This is a personal counter saved on this device—not a public vote or a site-wide ranking.",`
      <div class="fan-support-count" id="fan-support-count">0</div><small>SUPPORT ACTIONS LOGGED ON THIS DEVICE</small>
      <div class="fan-support-buttons"><button class="button primary" type="button" data-support="1">CHEER 🧡 +1</button><button class="button outline" type="button" data-support="5">FAN MODE 🔥 +5</button></div>
      <button class="button outline fan-secondary-button" type="button" id="fan-support-reset">RESET MY COUNT</button>`);
    const countNode=supportCard.querySelector("#fan-support-count");let count=Math.max(0,Number(safeRead("tilak72-support-count-v1",0))||0);const drawCount=()=>countNode.textContent=count.toLocaleString();drawCount();
    supportCard.querySelectorAll("[data-support]").forEach(btn=>btn.addEventListener("click",()=>{count+=Number(btn.dataset.support);safeWrite("tilak72-support-count-v1",count);drawCount();status("Your personal 72 Club support counter was updated.");}));
    supportCard.querySelector("#fan-support-reset").addEventListener("click",()=>{count=0;safeWrite("tilak72-support-count-v1",count);drawCount();status("Your personal support counter was reset.");});
  }

  function init() {
    initBadge();
    initRituals();
    initMemory();
    initChant();
    addFanExtras();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
