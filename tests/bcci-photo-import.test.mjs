import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { webcrypto } from "node:crypto";
import { onRequestPost } from "../functions/api/admin/import-bcci-photo.js";

globalThis.crypto ||= webcrypto;

const secret = "test-only-admin-session-secret";
const originalFetch = globalThis.fetch;

async function adminCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + 3600);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = [...new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expires)),
  )]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return "tv_admin=" + expires + "." + signature;
}

async function request(body, authenticated = true) {
  const headers = new Headers({ "content-type": "application/json" });
  if (authenticated) headers.set("cookie", await adminCookie());
  return onRequestPost({
    request: new Request("https://fanclub.test/api/admin/import-bcci-photo", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    env: { ADMIN_SESSION_SECRET: secret, ADMIN_PASSWORD: "test", GITHUB_TOKEN: "test-token" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("BCCI photo import requires an authenticated Admin session", async () => {
  const response = await request({ urls: ["https://www.bcci.tv/_next/image?url=%2Fcms%2Fphotos%2Fgalleries%2Fmaster%2Fa.webp&w=1920&q=75"], album: "General Photos" }, false);
  assert.equal(response.status, 401);
});

test("BCCI photo import rejects non-BCCI and non-gallery URLs before fetching", async () => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network access for invalid URL");
  };
  const response = await request({
    urls: ["https://attacker.example/_next/image?url=%2Fcms%2Fphotos%2Fgalleries%2Fmaster%2Fa.webp&w=1920&q=75"],
    album: "General Photos",
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /BCCI gallery image URLs/);
});

test("BCCI Next image URL imports to GitHub repository storage, not Cloudinary", async () => {
  let savedMedia = null;
  const imageBytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method || "GET";

    if (url.hostname === "www.bcci.tv") {
      return new Response(imageBytes, {
        status: 200,
        headers: { "content-type": "image/webp", "content-length": String(imageBytes.length) },
      });
    }

    if (url.hostname === "raw.githubusercontent.com" && url.pathname.endsWith("/data/admin-media.json")) {
      return Response.json({ items: [], albums: ["General Photos"] });
    }

    if (url.hostname === "api.github.com" && url.pathname.endsWith("/contents/assets/imported-photos/" + url.pathname.split("/").pop())) {
      if (method === "GET") return Response.json({ message: "Not Found" }, { status: 404 });
      assert.equal(method, "PUT");
      return Response.json({ commit: { sha: "photo-commit" } }, { status: 201 });
    }

    if (url.hostname === "api.github.com" && url.pathname.endsWith("/contents/data/admin-media.json")) {
      if (method === "GET") return Response.json({ sha: "existing-media-sha" });
      assert.equal(method, "PUT");
      const payload = JSON.parse(init.body);
      savedMedia = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
      return Response.json({ commit: { sha: "media-commit" } }, { status: 200 });
    }

    throw new Error("Unexpected request: " + method + " " + url.href);
  };

  const imageUrl = "https://www.bcci.tv/_next/image?url=%2Fcms%2Fphotos%2Fgalleries%2Fmaster%2F7tFehizQweZ1n3ugtTQVI0%2F134ca27bfdd8aef14f5c8768.webp&w=750&q=75";
  const markdownTableCell =
    "| <br>[" + imageUrl + "](" + imageUrl.replaceAll("&", "\\&") + ") |";
  const response = await request({
    urls: [markdownTableCell],
    album: "IND VS WI 3RD T20I",
    titlePrefix: "Tilak Varma",
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.added.length, 1);
  assert.equal(result.storage, "GitHub repository (not Cloudinary)");
  assert.equal(savedMedia.items[0].album, "IND VS WI 3RD T20I");
  assert.equal(savedMedia.items[0].title, "Tilak Varma");
  assert.match(savedMedia.items[0].url, /^\/assets\/imported-photos\/[a-f0-9]+\.webp$/);
  assert.equal(savedMedia.items[0].storage, "github");
  assert.equal(savedMedia.items[0].sourceUrl, imageUrl);
});
