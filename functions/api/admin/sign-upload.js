import { json, requireAdmin } from "../../_lib/admin.js";

async function sha1Hex(value) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return json(
      {
        error:
          "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Cloudflare Pages secrets.",
      },
      503,
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const resourceType = body.resourceType === "video" ? "video" : "image";
  const folder = resourceType === "video" ? "tilakvarmafanclub/videos" : "tilakvarmafanclub/photos";
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, timestamp };
  const toSign =
    Object.keys(params)
      .sort()
      .map((key) => key + "=" + params[key])
      .join("&") + env.CLOUDINARY_API_SECRET;
  return json({
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature: await sha1Hex(toSign),
    resourceType,
  });
}
