import { json, requireAdmin, clearSession } from "../../_lib/admin.js";
export async function onRequestGet({ request, env }) {
  return json({ authenticated: await requireAdmin(request, env) });
}
export async function onRequestDelete() {
  return json({ ok: true }, 200, { "set-cookie": clearSession() });
}
