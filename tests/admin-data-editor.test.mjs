import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { onRequestGet, onRequestPost } from "../functions/api/admin/data-editor.js";

globalThis.crypto ||= webcrypto;

const secret = "test-only-admin-session-secret";
const statsFixture = JSON.parse(
  await readFile(new URL("../data/site-data.json", import.meta.url), "utf8"),
);
const deathFixture = JSON.parse(
  await readFile(new URL("../data/death-overs.json", import.meta.url), "utf8"),
);
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
  return `tv_admin=${expires}.${signature}`;
}

async function requestFor(kind, body, method = "GET", authenticated = true) {
  const headers = new Headers();
  if (authenticated) headers.set("cookie", await adminCookie());
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(
    "https://fanclub.test/api/admin/data-editor?kind=" + encodeURIComponent(kind),
    {
      method,
      headers,
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    },
  );
}

function mockGitHubFetch() {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || "GET" });
    if (init.method === "PUT") {
      return Response.json({ commit: { sha: "test-commit-sha" } });
    }
    if (url.includes("raw.githubusercontent.com")) {
      return Response.json(url.endsWith("/data/death-overs.json") ? deathFixture : statsFixture);
    }
    return Response.json({ sha: "existing-file-sha" });
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("rejects requests without a valid admin session", async () => {
  const response = await onRequestGet({
    request: await requestFor("stats", undefined, "GET", false),
    env: { ADMIN_SESSION_SECRET: secret, ADMIN_PASSWORD: "configured" },
  });
  assert.equal(response.status, 401);
});

test("loads the requested saved data family and its path", async () => {
  mockGitHubFetch();
  const response = await onRequestGet({
    request: await requestFor("stats"),
    env: { ADMIN_SESSION_SECRET: secret, ADMIN_PASSWORD: "configured" },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.path, "data/site-data.json");
  assert.ok(body.data.careerStats);
});

test("rejects an incomplete stats replacement without writing to GitHub", async () => {
  const calls = mockGitHubFetch();
  const response = await onRequestPost({
    request: await requestFor("stats", { kind: "stats", data: { profile: {} } }, "POST"),
    env: {
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD: "configured",
      GITHUB_TOKEN: "test-token",
    },
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /careerStats/);
  assert.equal(calls.length, 0);
});

test("rejects an empty Death Overs replacement without writing to GitHub", async () => {
  const calls = mockGitHubFetch();
  const response = await onRequestPost({
    request: await requestFor(
      "death",
      { kind: "death", data: { formats: {}, innings: [], overTotals: [] } },
      "POST",
    ),
    env: {
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD: "configured",
      GITHUB_TOKEN: "test-token",
    },
  });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("accepts the current verified Stats snapshot and returns the GitHub commit", async () => {
  const calls = mockGitHubFetch();
  const response = await onRequestPost({
    request: await requestFor("stats", { kind: "stats", data: statsFixture }, "POST"),
    env: {
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD: "configured",
      GITHUB_TOKEN: "test-token",
    },
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.path, "data/site-data.json");
  assert.equal(body.commit, "test-commit-sha");
  assert.ok(calls.some((call) => call.method === "PUT" && call.url.endsWith("/data/site-data.json")));
});

test("accepts the current Death Overs snapshot and returns the GitHub commit", async () => {
  const calls = mockGitHubFetch();
  const response = await onRequestPost({
    request: await requestFor("death", { kind: "death", data: deathFixture }, "POST"),
    env: {
      ADMIN_SESSION_SECRET: secret,
      ADMIN_PASSWORD: "configured",
      GITHUB_TOKEN: "test-token",
    },
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.path, "data/death-overs.json");
  assert.equal(body.commit, "test-commit-sha");
  assert.ok(calls.some((call) => call.method === "PUT" && call.url.endsWith("/data/death-overs.json")));
});
