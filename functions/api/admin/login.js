import { json, issueSession } from "../../_lib/admin.js";

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ error: "Admin login is not configured yet. Add ADMIN_PASSWORD and ADMIN_SESSION_SECRET as Cloudflare Pages secrets." }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const supplied = typeof body.password === "string" ? body.password : "";
  // Cloudflare dashboard pastes can accidentally include a trailing newline/space.
  // Normalize only the configured secret boundary so a copied value still works.
  const expected = String(env.ADMIN_PASSWORD).trim();
  let mismatch = supplied.length ^ expected.length;
  const length = Math.max(supplied.length, expected.length);
  for (let i = 0; i < length; i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  if (mismatch !== 0) return json({ error: "Incorrect password." }, 401);
  try {
    const cookie = await issueSession(env);
    return json({ ok: true }, 200, { "set-cookie": cookie });
  } catch {
    return json({ error: "Could not start a secure admin session." }, 500);
  }
}

export async function onRequestDelete() {
  return json({ ok: true }, 200, { "set-cookie": "tv_admin=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
}
