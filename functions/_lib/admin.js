const COOKIE_NAME = "tv_admin";
const COOKIE_TTL = 60 * 60 * 8;

export const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });

const bytesToHex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const hexToBytes = (hex) => new Uint8Array((hex.match(/.{2}/g) || []).map((x) => parseInt(x, 16)));

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function issueSession(env) {
  if (!env.ADMIN_SESSION_SECRET || !env.ADMIN_PASSWORD)
    throw new Error("Admin secrets are not configured in Cloudflare Pages.");
  const expires = String(Math.floor(Date.now() / 1000) + COOKIE_TTL);
  const signature = await hmac(env.ADMIN_SESSION_SECRET, expires);
  return (
    COOKIE_NAME +
    "=" +
    expires +
    "." +
    signature +
    "; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=" +
    COOKIE_TTL
  );
}

export async function requireAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET || !env.ADMIN_PASSWORD) return false;
  const raw = request.headers.get("Cookie") || "";
  const match = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE_NAME + "="));
  if (!match) return false;
  const token = match.slice(COOKIE_NAME.length + 1);
  const [expires, signature] = token.split(".");
  if (
    !expires ||
    !signature ||
    !/^\d+$/.test(expires) ||
    Number(expires) < Math.floor(Date.now() / 1000)
  )
    return false;
  const expected = await hmac(env.ADMIN_SESSION_SECRET, expires);
  const a = hexToBytes(signature);
  const b = hexToBytes(expected);
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(a, b)
    : a.every((v, i) => v === b[i]);
}

export function clearSession() {
  return COOKIE_NAME + "=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

export async function saveRepoJson(env, path, data) {
  if (!env.GITHUB_TOKEN)
    throw new Error("GITHUB_TOKEN is missing from Cloudflare Pages environment variables.");
  const repo = env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
  const api = "https://api.github.com/repos/" + repo + "/contents/" + path;
  const headers = {
    authorization: "Bearer " + env.GITHUB_TOKEN,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "TilakVarmaFanClub-Admin",
  };
  let sha;
  const current = await fetch(api, { headers });
  if (current.ok) sha = (await current.json()).sha;
  else if (current.status !== 404) throw new Error("GitHub read failed (" + current.status + ").");
  const text = JSON.stringify(data, null, 2) + "\n";
  const encoded = btoa(unescape(encodeURIComponent(text)));
  const response = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "chore: update site content from admin studio",
      content: encoded,
      ...(sha ? { sha } : {}),
      branch: env.GITHUB_BRANCH || "main",
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("GitHub save failed (" + response.status + "): " + detail.slice(0, 240));
  }
  return (await response.json()).commit?.sha || null;
}
