import { json, requireAdmin, saveRepoJson } from "../../_lib/admin.js";

const PATHS = {
  media: "data/admin-media.json",
  video: "data/video-config.json",
  news: "News/newsjson.json",
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
  if (response.status === 404)
    return json(
      kind === "media"
        ? { items: [] }
        : kind === "news"
          ? { news: [], updatedAt: null }
          : { feedUrl: "" },
    );
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
  if (!body || typeof body !== "object" || Array.isArray(body))
    return json({ error: "Invalid request body." }, 400);
  const kind = body.kind;
  const path = PATHS[kind];
  if (!path) return json({ error: "Unknown content type." }, 400);
  let data = body.data;
  if (kind === "news") {
    const action = body.action === "delete" ? "delete" : "upsert";
    const input = body.item;
    if (!input || typeof input !== "object" || Array.isArray(input))
      return json({ error: "News item is required." }, 400);
    const title = String(input.title || "")
      .trim()
      .slice(0, 220);
    const bodyText = String(input.body || input.description || "")
      .trim()
      .slice(0, 30000);
    const publishedAt = String(input.publishedAt || "").trim();
    const category = String(input.category || "Manual News")
      .trim()
      .slice(0, 80);
    const imageUrl = String(input.imageUrl || "").trim();
    const sourceUrl = String(input.webviewUrl || "").trim();
    if (action === "upsert" && (!title || !bodyText || !publishedAt))
      return json({ error: "Title, article body and publication date/time are required." }, 400);
    if (publishedAt && !Number.isFinite(Date.parse(publishedAt)))
      return json({ error: "Publication date/time is invalid." }, 400);
    for (const [label, value] of [
      ["Image URL", imageUrl],
      ["Source URL", sourceUrl],
    ]) {
      if (!value) continue;
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        return json({ error: label + " must be a valid HTTPS URL." }, 400);
      }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        return json({ error: label + " must be a valid HTTPS URL." }, 400);
    }
    const repo = env.GITHUB_REPOSITORY || "nitishratre45/tilakvarmafanclub";
    const branch = env.GITHUB_BRANCH || "main";
    if (!env.GITHUB_TOKEN)
      return json({ error: "GITHUB_TOKEN is missing from Cloudflare Pages environment variables." }, 503);
    const currentUrl = "https://api.github.com/repos/" + repo + "/contents/News/newsjson.json?ref=" + encodeURIComponent(branch);
    let archiveResponse;
    try {
      archiveResponse = await fetch(currentUrl, {
        headers: {
          authorization: "Bearer " + env.GITHUB_TOKEN,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "TilakVarmaFanClub-Admin"
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return json({ error: "Could not load the latest news archive. No changes were saved." }, 502);
    }
    if (!archiveResponse.ok)
      return json({ error: "Could not load the latest news archive (" + archiveResponse.status + "). No changes were saved." }, 502);
    let archive;
    let archiveSha;
    try {
      const file = await archiveResponse.json();
      archiveSha = file.sha;
      const binary = atob(String(file.content || "").replace(/\\s/g, ""));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      archive = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "The saved news archive is not valid JSON. No changes were saved." }, 502);
    }
    if (!archive || typeof archive !== "object" || !Array.isArray(archive.news))
      return json({ error: "Unexpected news archive format. No changes were saved." }, 502);
    const id = String(input.id || "")
      .trim()
      .slice(0, 160);
    let resultId = id;
    if (action === "delete") {
      const existing = archive.news.find((item) => item && item.id === id && item.manual === true);
      if (!existing)
        return json({ error: "Only manually added news entries can be deleted." }, 404);
      archive.news = archive.news.filter(
        (item) => !(item && item.id === id && item.manual === true),
      );
    } else {
      const safeId = id || "manual-" + crypto.randomUUID();
      resultId = safeId;
      const existingIndex = archive.news.findIndex(
        (item) => item && item.id === safeId && item.manual === true,
      );
      const contentBlocks = bodyText
        .split(/\\n\\s*\\n/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ type: "paragraph", text }));
      const item = {
        ...(existingIndex >= 0 ? archive.news[existingIndex] : {}),
        id: safeId,
        manual: true,
        sourceName: String(input.sourceName || "The 72 Club")
          .trim()
          .slice(0, 100),
        category,
        title,
        webviewUrl: sourceUrl,
        imageUrl,
        publishedAt: new Date(publishedAt).toISOString(),
        description: bodyText.slice(0, 1200),
        fullText: bodyText,
        pageText: bodyText,
        contentBlocks,
        editorial:
          input.editorial && typeof input.editorial === "object" ? input.editorial : undefined,
        updatedAt: new Date().toISOString(),
      };
      if (existingIndex >= 0) archive.news[existingIndex] = item;
      else archive.news.push(item);
    }
    archive.news.sort(
      (a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0),
    );
    archive.updatedAt = new Date().toISOString();
    archive.manualChangesAt = archive.updatedAt;
    try {
      const commit = await saveRepoJson(env, PATHS.news, archive, archiveSha);
      return json({
        ok: true,
        action,
        id: resultId,
        count: archive.news.length,
        commit,
        updatedAt: archive.updatedAt,
      });
    } catch (error) {
      return json({ error: error.message || "News save failed." }, error.status || 502);
    }
  }
  if (kind === "media") {
    if (!data || !Array.isArray(data.items) || data.items.length > 300)
      return json({ error: "Invalid photo/video list." }, 400);
    data.items = data.items
      .filter((item) => {
        if (!item || typeof item.url !== "string") return false;
        if (/^https:\/\//i.test(item.url)) return true;
        // BCCI imports are stored as same-origin files in the repository.
        // Preserve these paths when any Admin edit saves the media library.
        return /^\/assets\/imported-photos\/[a-f0-9]{64}\.(?:webp|jpe?g|png)$/i.test(item.url);
      })
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
      const isVideoUpNextEndpoint = /^\/api\/bff\/cms\/videos\/[a-z0-9-]+\/up-next$/i.test(
        parsed.pathname,
      );
      const isMatchVideoPage = /^\/matches\/[0-9a-f-]+\/[a-z0-9-]+\/video$/i.test(parsed.pathname);
      const isVideoDetailPage = /^\/videos\/[a-z0-9-]+$/i.test(parsed.pathname);
      const isPublicVideosListing =
        parsed.pathname === "/videos" &&
        parsed.searchParams.get("tags") === "international" &&
        [...parsed.searchParams.keys()].every((key) => key === "tags");
      if (
        parsed.protocol !== "https:" ||
        !allowedHosts.has(parsed.hostname) ||
        (!allowedPaths.has(parsed.pathname) &&
          !isVideoUpNextEndpoint &&
          !isMatchVideoPage &&
          !isVideoDetailPage &&
          !isPublicVideosListing) ||
        parsed.username ||
        parsed.password ||
        parsed.hash ||
        feedUrl.length > 1500
      ) {
        return json(
          {
            error:
              "Only official BCCI videos API, supported public videos listing, up-next, match video, or video detail URLs are allowed. Other websites are rejected.",
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
