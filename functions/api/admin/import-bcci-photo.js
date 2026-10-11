import { json, requireAdmin, saveRepoJson } from "../../_lib/admin.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_URLS = 12;
const ALLOWED_HOSTS = new Set(["www.bcci.tv", "bcci.tv"]);
const IMAGE_PATH = /^\/cms\/photos\/galleries\/[a-z0-9/_-]+\.(?:webp|jpe?g|png)$/i;

function validBcciImageUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !ALLOWED_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.hash
    )
      return null;

    if (url.pathname === "/_next/image") {
      const imagePath = url.searchParams.get("url") || "";
      if (!IMAGE_PATH.test(imagePath)) return null;
      const width = Number(url.searchParams.get("w") || "1920");
      const quality = Number(url.searchParams.get("q") || "75");
      if (!Number.isInteger(width) || width < 320 || width > 1920) return null;
      if (!Number.isInteger(quality) || quality < 30 || quality > 90) return null;
      if ([...url.searchParams.keys()].some((key) => !["url", "w", "q"].includes(key))) return null;
      return url;
    }

    if (IMAGE_PATH.test(url.pathname) && [...url.searchParams.keys()].length === 0) return url;
    return null;
  } catch {
    return null;
  }
}

function base64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

async function readMedia(env) {
  const repo = env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
  const branch = env.GITHUB_BRANCH || "main";
  const url = "https://raw.githubusercontent.com/" + repo + "/" + branch + "/data/admin-media.json";
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (response.status === 404) return { items: [], albums: ["General Photos"] };
  if (!response.ok) throw new Error("Could not load the current gallery metadata.");
  const data = await response.json();
  return {
    items: Array.isArray(data.items) ? data.items : [],
    albums: Array.isArray(data.albums) ? data.albums : ["General Photos"],
  };
}

async function saveBinary(env, path, bytes) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is missing from Cloudflare Pages settings.");
  const repo = env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
  const api = "https://api.github.com/repos/" + repo + "/contents/" + path;
  const headers = {
    authorization: "Bearer " + env.GITHUB_TOKEN,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "TilakVarmaFanClub-Admin",
  };
  const existing = await fetch(api + "?ref=" + encodeURIComponent(env.GITHUB_BRANCH || "main"), {
    headers,
  });
  if (existing.ok) return;
  if (existing.status !== 404)
    throw new Error("GitHub image check failed (" + existing.status + ").");

  const response = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "feat: import BCCI gallery photo",
      content: base64(bytes),
      branch: env.GITHUB_BRANCH || "main",
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      "Could not save photo to the website repository (" +
        response.status +
        "): " +
        detail.slice(0, 180),
    );
  }
}

function extensionFor(contentType) {
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/png") return "png";
  return "";
}

async function digestHex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  if (!env.GITHUB_TOKEN)
    return json({ error: "GITHUB_TOKEN is missing from Cloudflare Pages settings." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const urls = Array.isArray(body?.urls) ? body.urls : [];
  const album = typeof body?.album === "string" ? body.album.trim() : "";
  const titlePrefix =
    typeof body?.titlePrefix === "string" ? body.titlePrefix.trim().slice(0, 100) : "";
  if (!album || album.length > 120)
    return json({ error: "Choose a valid destination album." }, 400);
  if (!urls.length || urls.length > MAX_URLS) {
    return json({ error: "Paste between 1 and " + MAX_URLS + " BCCI image URLs at a time." }, 400);
  }

  const parsedUrls = [];
  const invalid = [];
  for (const value of urls) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) continue;
    const parsed = validBcciImageUrl(raw);
    if (!parsed) invalid.push(raw.slice(0, 180));
    else parsedUrls.push({ raw, parsed });
  }
  if (invalid.length) {
    return json(
      {
        error:
          "Only BCCI gallery image URLs are accepted (/_next/image with /cms/photos/galleries/ images, or the direct BCCI gallery image URL). Invalid URL(s): " +
          invalid.length,
      },
      400,
    );
  }
  if (!parsedUrls.length) return json({ error: "Paste at least one BCCI photo URL." }, 400);

  try {
    const data = await readMedia(env);
    if (!data.albums.includes(album)) data.albums.push(album);
    const existingSources = new Set(data.items.map((item) => item?.sourceUrl).filter(Boolean));
    const added = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < parsedUrls.length; i++) {
      const { raw, parsed } = parsedUrls[i];
      if (existingSources.has(raw)) {
        skipped.push(raw);
        continue;
      }
      try {
        const response = await fetch(parsed.href, {
          redirect: "manual",
          headers: { accept: "image/avif,image/webp,image/*" },
        });
        if (!response.ok) throw new Error("BCCI returned HTTP " + response.status + ".");
        const finalUrl = new URL(response.url || parsed.href);
        if (!ALLOWED_HOSTS.has(finalUrl.hostname) || finalUrl.protocol !== "https:") {
          throw new Error("The image redirected outside BCCI; import was blocked.");
        }
        const contentType = response.headers.get("content-type") || "";
        const extension = extensionFor(contentType);
        if (!extension) throw new Error("BCCI did not return a supported WebP, JPEG or PNG image.");
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (declaredLength > MAX_IMAGE_BYTES)
          throw new Error("Image exceeds the 8 MB per-photo limit.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
          throw new Error("Image is empty or exceeds the 8 MB per-photo limit.");

        const hash = await digestHex(bytes);
        const filename = hash + "." + extension;
        const path = "assets/imported-photos/" + filename;
        await saveBinary(env, path, bytes);
        const title = titlePrefix
          ? parsedUrls.length > 1
            ? titlePrefix + " " + String(i + 1).padStart(2, "0")
            : titlePrefix
          : "BCCI Photo " + hash.slice(0, 8).toUpperCase();

        const item = {
          title,
          album,
          url: "/" + path,
          type: "image",
          storage: "github",
          sourceUrl: raw,
          createdAt: new Date().toISOString(),
        };
        data.items.unshift(item);
        existingSources.add(raw);
        added.push({ title, url: item.url, album });
      } catch (error) {
        errors.push({ url: raw.slice(0, 180), error: error.message || "Import failed." });
      }
    }

    if (added.length) {
      data.updatedAt = new Date().toISOString();
      const commit = await saveRepoJson(env, "data/admin-media.json", data);
      return json({
        ok: true,
        added,
        skipped: skipped.length,
        errors,
        commit,
        storage: "GitHub repository (not Cloudinary)",
      });
    }
    return json({
      ok: errors.length === 0,
      added,
      skipped: skipped.length,
      errors,
      storage: "GitHub repository (not Cloudinary)",
    });
  } catch (error) {
    return json({ error: error.message || "BCCI photo import failed." }, 502);
  }
}
