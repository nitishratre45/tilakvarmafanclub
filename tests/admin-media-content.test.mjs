import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { webcrypto } from "node:crypto";
import { onRequestPost } from "../functions/api/admin/content.js";

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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Admin media save preserves local BCCI imports and same-caption photos with different URLs", async () => {
  let saved = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.github.com" && url.pathname.endsWith("/contents/data/admin-media.json")) {
      if ((init.method || "GET") === "GET") return Response.json({ sha: "old-media-sha" });
      assert.equal(init.method, "PUT");
      const payload = JSON.parse(init.body);
      saved = JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
      return Response.json({ commit: { sha: "media-save-commit" } });
    }
    throw new Error("Unexpected request: " + url.href);
  };

  const localBcci = {
    title: "Tilak Varma",
    album: "IND VS WI 3RD T20I",
    url: "/assets/imported-photos/" + "a".repeat(64) + ".webp",
    sourceUrl: "https://www.bcci.tv/_next/image?url=%2Fcms%2Fphotos%2Fgalleries%2Fseries%2Fphoto-a.webp&w=750&q=75",
    type: "image",
    storage: "github",
  };
  const anotherPhotoSameCaption = {
    title: "Tilak Varma",
    album: "IND VS WI 3RD T20I",
    url: "https://res.cloudinary.com/example/image/upload/photo-b.jpg",
    type: "image",
  };
  const invalid = { title: "Bad item", url: "javascript:alert(1)", type: "image" };
  const request = new Request("https://fanclub.test/api/admin/content", {
    method: "POST",
    headers: {
      cookie: await adminCookie(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      kind: "media",
      data: { items: [localBcci, anotherPhotoSameCaption, invalid], albums: ["IND VS WI 3RD T20I"] },
    }),
  });
  const response = await onRequestPost({
    request,
    env: {
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD: "test",
      GITHUB_TOKEN: "test-token",
    },
  });
  assert.equal(response.status, 200);
  assert.equal(saved.items.length, 2);
  assert.equal(saved.items[0].url, localBcci.url);
  assert.equal(saved.items[1].url, anotherPhotoSameCaption.url);
  assert.equal(saved.items[0].title, saved.items[1].title, "Same captions must not deduplicate photos");
});
