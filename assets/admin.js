(() => {
  "use strict";
  const REPO = "nitishratre45/tilakvarmafanclub";
  const BRANCH = "main";
  const $ = (id) => document.getElementById(id);
  const tokenInput = $("github-token");
  const datasetSelect = $("dataset");
  const editor = $("json-editor");
  const status = $("admin-status");
  const saveButton = $("save-data");
  let token = "";
  let loaded = null;

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = "admin-status" + (kind ? " " + kind : "");
  }
  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  function encodeUtf8(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }
  function decodeUtf8(base64) {
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  }
  async function api(path, options = {}) {
    const response = await fetch("https://api.github.com/repos/" + REPO + "/contents/" + path, {
      ...options,
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || ("GitHub API returned HTTP " + response.status));
    return body;
  }

  function renderSourceMap(data, path = "data/site-data.json") {
    const host = $("source-map-content");
    if (!host) return;
    const escHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const items = [];
    const add = (dataset, source, detail) => {
      if (source && typeof source === "string") items.push({dataset, source, detail});
    };
    if (!data || typeof data !== "object") {
      host.innerHTML = '<p class="admin-status">Connect GitHub and load a dataset to inspect its recorded data sources. Automatic refreshes run through GitHub Actions.</p>';
      return;
    }
    if (path === "data/site-data.json") {
      add("Career stats · fallback source", data.careerSource, "Used when a format-specific source is not recorded");
      add("Recent innings · source", data.recentSource, "Source for recent-form refreshes");
      add("Latest featured match", data.featuredMatch?.source, "Match scorecard");
      add("Player profile photo", data.profile?.photoSource, "Profile image source");
      Object.entries(data.careerFormats || {}).forEach(([format, values]) => add(format + " career snapshot", values?.source || data.careerSource, "Format career data"));
      const grouped = new Map();
      (Array.isArray(data.recentInnings) ? data.recentInnings : []).forEach(row => {
        if (!row.source) return;
        if (!grouped.has(row.source)) grouped.set(row.source, []);
        grouped.get(row.source).push([row.date, row.opposition].filter(Boolean).join(" · "));
      });
      grouped.forEach((matches, source) => add("Recent innings · " + matches.slice(0, 3).join(", ") + (matches.length > 3 ? " +" + (matches.length - 3) + " more" : ""), source, "Per-innings source"));
    } else if (path === "data/death-overs.json") {
      add("Ball-by-ball archive · default", data.source || data.archiveSource, "Underlying delivery-level dataset");
      Object.entries(data.formats || {}).forEach(([format, values]) => {
        add((values?.label || format.toUpperCase()) + " delivery archive", values?.source, (values?.matchesFound ?? 0) + " matches · " + (values?.inningsFound ?? 0) + " innings in the published archive");
      });
      add("Latest match summary", data.featuredMatch?.source, "Latest scorecard; only verified summary is included");
      add("Archive methodology", data.methodologySource, "Archive and calculation notes");
    } else if (path === "data/fan-zone.json") {
      (Array.isArray(data.gallery) ? data.gallery : []).forEach(item => add(item.title || "Fan resource", item.url, item.description || item.type || "Resource link"));
      if (!items.length) host.innerHTML = '<p class="admin-status">The Fan Zone poll is site-authored content. No external data feed is recorded for the poll itself.</p>';
    }
    const notice = '<div class="source-map-notice"><strong>Automatic data:</strong> scheduled workflows refresh the datasets where a public source is configured. Source URLs below are references, not editable score values. Use the JSON editor for text/content changes only when needed.</div>';
    host.innerHTML = items.length ? notice + '<div class="source-map-list">' + items.map(item => '<article class="source-map-item"><div><strong>'+escHtml(item.dataset)+'</strong><small>'+escHtml(item.detail)+'</small></div><a href="'+escHtml(item.source)+'" target="_blank" rel="noopener noreferrer">'+escHtml(item.source)+' ↗</a></article>').join("") + '</div>' : (path === "data/fan-zone.json" ? host.innerHTML : notice + '<p class="admin-status">No source URL is recorded in this dataset. This does not necessarily mean the content is missing; it may be manually maintained.</p>');
  }

  async function loadFile() {
    if (!token) {
      setStatus("Enter your GitHub token first.", "error");
      return;
    }
    const path = datasetSelect.value;
    setStatus("Loading " + path + " from main…");
    saveButton.disabled = true;
    try {
      const result = await api(path + "?ref=" + BRANCH);
      const text = decodeUtf8(result.content);
      const parsed = JSON.parse(text);
      loaded = { path, sha: result.sha, text };
      renderSourceMap(parsed, path);
      editor.value = JSON.stringify(JSON.parse(text), null, 2);
      $("loaded-file").textContent = path + " · loaded";
      saveButton.disabled = false;
      setStatus("Connected. " + path + " loaded successfully. Token remains in this tab's memory only.", "success");
    } catch (error) {
      loaded = null;
      $("loaded-file").textContent = "No file loaded";
      setStatus("Could not load data: " + error.message + ". Check token permissions (Contents: Read and write) and repository access.", "error");
    }
  }
  async function saveFile() {
    if (!token || !loaded || loaded.path !== datasetSelect.value) {
      setStatus("Connect and load the selected file before saving.", "error");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(editor.value);
    } catch (error) {
      setStatus("Invalid JSON: " + error.message, "error");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setStatus("The top-level JSON value must be an object.", "error");
      return;
    }
    saveButton.disabled = true;
    setStatus("Valid JSON. Committing changes to GitHub…");
    try {
      if (loaded.path === "data/site-data.json") {
        const now = new Date();
        const stamp = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
        const day = now.toISOString().slice(0, 10);
        parsed.lastUpdated = stamp;
        parsed.activityLog = Array.isArray(parsed.activityLog) ? parsed.activityLog : [];
        parsed.activityLog.unshift({
          date: day,
          category: "ADMIN",
          title: "Site data edited",
          description: "Profile, statistics or match-feed data was updated through Admin Studio.",
          source: "https://github.com/" + REPO
        });
        parsed.activityLog = parsed.activityLog.slice(0, 12);
      }
      // Refresh SHA just before writing so we don't overwrite a newer workflow commit.
      const latest = await api(loaded.path + "?ref=" + BRANCH);
      const message = $("commit-message").value.trim() || "chore: update Tilak Varma FC data";
      const body = {
        message,
        content: encodeUtf8(JSON.stringify(parsed, null, 2) + "\n"),
        sha: latest.sha,
        branch: BRANCH
      };
      const result = await api(loaded.path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      loaded.sha = result.content.sha;
      loaded.text = JSON.stringify(parsed, null, 2) + "\n";
      $("loaded-file").textContent = loaded.path + " · saved";
      setStatus("Saved to GitHub. Commit: " + result.commit.sha.slice(0, 7) + ". Cloudflare Pages deployment may take a short time.", "success");
    } catch (error) {
      setStatus("Save failed: " + error.message + ". If main changed during editing, reload the file and retry.", "error");
    } finally {
      saveButton.disabled = false;
    }
  }

  $("load-data").addEventListener("click", () => {
    token = tokenInput.value.trim();
    loadFile();
  });
  $("clear-token").addEventListener("click", () => {
    token = "";
    tokenInput.value = "";
    loaded = null;
    renderSourceMap(null, datasetSelect.value);
    editor.value = "";
    saveButton.disabled = true;
    $("loaded-file").textContent = "No file loaded";
    setStatus("Token cleared from this tab.", "success");
  });
  datasetSelect.addEventListener("change", () => { if (token) loadFile(); });
  saveButton.addEventListener("click", saveFile);
  $("format-json").addEventListener("click", () => {
    try {
      editor.value = JSON.stringify(JSON.parse(editor.value), null, 2);
      setStatus("JSON formatted. Save to publish these edits.", "success");
    } catch (error) {
      setStatus("Cannot format invalid JSON: " + error.message, "error");
    }
  });
  $("download-json").addEventListener("click", () => {
    try {
      const json = JSON.stringify(JSON.parse(editor.value), null, 2) + "\n";
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = datasetSelect.value.split("/").pop();
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Backup downloaded. This does not publish the changes.", "success");
    } catch (error) {
      setStatus("Fix invalid JSON before downloading a backup: " + error.message, "error");
    }
  });
  window.addEventListener("pagehide", () => { token = ""; });
})();