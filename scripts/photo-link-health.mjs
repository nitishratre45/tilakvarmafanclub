import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_FILE = path.join(ROOT, "data", "admin-media.json");
const REPORT_FILE = path.join(ROOT, "photo-health-report.json");

export async function checkPhotoUrl(url, fetchImpl = fetch) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, status: "invalid_url", detail: "URL could not be parsed" };
  }
  if (parsed.protocol !== "https:") {
    return { url, status: "invalid_url", detail: "Only HTTPS external URLs are checked" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let response;
    try {
      response = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
      if ([403, 405, 501].includes(response.status)) {
        response = await fetchImpl(url, { method: "GET", headers: { Range: "bytes=0-0" }, redirect: "follow", signal: controller.signal });
      }
    } catch (error) {
      return { url, status: error?.name === "AbortError" ? "timeout" : "network_error", detail: String(error?.message || error) };
    }

    if (response.status >= 200 && response.status < 400) {
      return { url, status: "reachable", httpStatus: response.status };
    }
    if ([401, 403, 405, 429].includes(response.status)) {
      return { url, status: "blocked_or_rate_limited", httpStatus: response.status, detail: "Host may block automated checks; inspect manually before changing the photo" };
    }
    if (response.status === 404 || response.status === 410) {
      return { url, status: "not_found", httpStatus: response.status };
    }
    return { url, status: "http_error", httpStatus: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildPhotoHealthReport(data, fetchImpl = fetch) {
  if (!data || !Array.isArray(data.items)) throw new Error("admin-media.json must contain an items array");
  const unique = new Map();
  for (const item of data.items) {
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    if (!url || url.startsWith("/")) continue;
    if (!unique.has(url)) unique.set(url, { url, titles: [], albums: [] });
    const entry = unique.get(url);
    if (item.title && !entry.titles.includes(item.title)) entry.titles.push(item.title);
    if (item.album && !entry.albums.includes(item.album)) entry.albums.push(item.album);
  }

  const results = [];
  // Sequential checks avoid flooding image hosts or triggering rate limits.
  for (const item of unique.values()) {
    const check = await checkPhotoUrl(item.url, fetchImpl);
    results.push({ ...item, ...check });
  }
  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    totalExternalUrls: results.length,
    counts,
    note: "Report-only check. No photos or metadata are changed. Blocked/rate-limited hosts are not assumed broken.",
    results,
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(MEDIA_FILE, "utf8"));
  const report = await buildPhotoHealthReport(data);
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Photo URL health report: ${report.totalExternalUrls} unique external URLs checked.`);
  console.log(JSON.stringify(report.counts));
  console.log("No photo metadata was modified.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
