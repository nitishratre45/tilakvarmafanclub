import { json, requireAdmin, saveRepoJson } from "../../_lib/admin.js";

const PATHS = {
  media: "data/admin-media.json",
  video: "data/video-config.json",
};

export async function onRequestGet({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  const kind = new URL(request.url).searchParams.get("kind") || "media";
  const path = PATHS[kind];
  if (!path) return json({ error: "Unknown content type." }, 400);
  const url =
    "https://raw.githubusercontent.com/" +
    (env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub") +
    "/" +
    (env.GITHUB_BRANCH || "main") +
    "/" +
    path;
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (response.status === 404) return json(kind === "media" ? { items: [] } : { feedUrl: "" });
  if (!response.ok) return json({ error: "Could not load saved content." }, 502);
  return json(await response.json());
}

export async function onRequestPost({ request, env }) {
  if (!(await requireAdmin(request, env)))
    return json({ error: "Admin session expired. Sign in again." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const kind = body.kind;
  const path = PATHS[kind];
  if (!path) return json({ error: "Unknown content type." }, 400);
  let data = body.data;
  if (kind === "media") {
    if (!data || !Array.isArray(data.items) || data.items.length > 300)
      return json({ error: "Invalid photo/video list." }, 400);
    data.items = data.items
      .filter((item) => item && typeof item.url === "string" && /^https:\/\//i.test(item.url))
      .slice(0, 300);
    data.updatedAt = new Date().toISOString();
  } else {
    const feedUrl = typeof data?.feedUrl === "string" ? data.feedUrl.trim() : "";
    if (feedUrl) {
      let parsed;
      try {
        parsed = new URL(feedUrl);
      } catch {
        return json({ error: "Enter a valid official BCCI video API URL." }, 400);
      }
      const allowedHosts = new Set(["www.bcci.tv", "bcci.tv"]);
      const allowedPaths = new Set(["/api/bff/cms/videos", "/api/bff/cms/videos/latest"]);
      if (
        parsed.protocol !== "https:" ||
        !allowedHosts.has(parsed.hostname) ||
        !allowedPaths.has(parsed.pathname) ||
        parsed.username ||
        parsed.password ||
        parsed.hash ||
        feedUrl.length > 1500
      ) {
        return json(
          {
            error:
              "Only the official BCCI videos API endpoint is allowed. Player/profile URLs or other websites are rejected.",
          },
          400,
        );
      }
    }
    data = { feedUrl, updatedAt: new Date().toISOString() };
  }
  try {
    const commit = await saveRepoJson(env, path, data);
    return json({ ok: true, commit, updatedAt: data.updatedAt });
  } catch (error) {
    return json({ error: error.message || "Save failed." }, 502);
  }
}
