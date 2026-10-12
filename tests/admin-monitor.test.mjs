import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { webcrypto } from "node:crypto";
import { onRequest } from "../functions/api/admin/monitor.js";

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
  )].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return "tv_admin=" + expires + "." + signature;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function request(env, authenticated = true) {
  const headers = new Headers();
  if (authenticated) headers.set("cookie", await adminCookie());
  return onRequest({
    request: new Request("https://fanclub.test/api/admin/monitor", { method: "GET", headers }),
    env,
  });
}

test("workflow monitor requires an authenticated admin session", async () => {
  const response = await request({
    ADMIN_SESSION_SECRET: secret,
    ADMIN_PASSWORD: "configured",
    GITHUB_TOKEN: "test-token",
  }, false);
  assert.equal(response.status, 401);
});

test("workflow monitor identifies GitHub API rate limiting separately from permissions", async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: "API rate limit exceeded" }),
    { status: 403, headers: { "content-type": "application/json", "x-ratelimit-remaining": "0" } },
  );
  const response = await request({
    ADMIN_SESSION_SECRET: secret,
    ADMIN_PASSWORD: "configured",
    GITHUB_TOKEN: "test-token",
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /rate limit/i);
});

test("workflow monitor returns a clear timeout message instead of hanging", async () => {
  globalThis.fetch = async () => {
    const error = new Error("request timed out");
    error.name = "TimeoutError";
    throw error;
  };
  const response = await request({
    ADMIN_SESSION_SECRET: secret,
    ADMIN_PASSWORD: "configured",
    GITHUB_TOKEN: "test-token",
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /timed out after 12 seconds/i);
});
