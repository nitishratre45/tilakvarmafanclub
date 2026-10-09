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
      JSON.parse(text);
      loaded = { path, sha: result.sha, text };
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