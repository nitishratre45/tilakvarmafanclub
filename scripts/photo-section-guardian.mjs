import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MEDIA_FILE = path.join(ROOT, "data", "admin-media.json");
const LOCAL_PHOTO_RE = /^\/assets\/imported-photos\/[a-f0-9]{64}\.(?:webp|jpe?g|png)$/i;

export function inspectMedia(data, exists = (file) => fs.existsSync(path.join(ROOT, file.replace(/^\//, "")))) {
  const errors = [];
  const warnings = [];
  if (!data || !Array.isArray(data.items)) {
    return { errors: ["data/admin-media.json must contain an items array"], warnings, duplicateUrls: [], missingLocalFiles: [] };
  }

  const seen = new Set();
  const duplicateUrls = [];
  const missingLocalFiles = [];
  for (const [index, item] of data.items.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`items[${index}] is not an object`);
      continue;
    }
    if (typeof item.url !== "string" || !item.url.trim()) {
      errors.push(`items[${index}] has no photo URL`);
      continue;
    }

    const url = item.url.trim();
    const isLocal = LOCAL_PHOTO_RE.test(url);
    let validHttps = false;
    try {
      validHttps = new URL(url).protocol === "https:";
    } catch {
      // Local repository paths are checked separately.
    }
    if (!isLocal && !validHttps) {
      errors.push(`items[${index}] has an unsupported URL: ${url}`);
      continue;
    }

    // URL is the only duplicate key. Captions/titles are deliberately ignored.
    if (seen.has(url)) duplicateUrls.push(url);
    else seen.add(url);

    if (isLocal && !exists(url)) missingLocalFiles.push(url);
  }

  if (missingLocalFiles.length) {
    warnings.push(...missingLocalFiles.map((url) => `Local photo file is missing; metadata was preserved: ${url}`));
  }
  return { errors, warnings, duplicateUrls, missingLocalFiles };
}

export function repairExactUrlDuplicates(data) {
  if (!data || !Array.isArray(data.items)) throw new Error("Cannot repair media data without an items array");
  const seen = new Set();
  const items = [];
  let removed = 0;
  for (const item of data.items) {
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    // Invalid records are not silently discarded; validation must flag them.
    if (!url || seen.has(url)) {
      if (url && seen.has(url)) {
        removed += 1;
        continue;
      }
      items.push(item);
      continue;
    }
    seen.add(url);
    items.push(item);
  }
  return { data: { ...data, items }, removed };
}

function main() {
  if (!fs.existsSync(MEDIA_FILE)) throw new Error("Missing data/admin-media.json");
  const original = fs.readFileSync(MEDIA_FILE, "utf8");
  const data = JSON.parse(original);
  const repaired = repairExactUrlDuplicates(data);
  const before = inspectMedia(data);
  if (repaired.removed > 0) {
    fs.writeFileSync(MEDIA_FILE, `${JSON.stringify(repaired.data, null, 2)}\n`);
    console.log(`Removed ${repaired.removed} exact-URL duplicate(s); different URLs/captions were preserved.`);
  } else {
    console.log("No exact-URL duplicates found.");
  }
  const report = inspectMedia(repaired.data);
  console.log(`Photo guardian: ${repaired.data.items.length} media item(s), ${report.errors.length} error(s), ${report.warnings.length} warning(s).`);
  for (const warning of report.warnings) console.warn(`WARNING: ${warning}`);
  for (const error of report.errors) console.error(`ERROR: ${error}`);
  if (report.errors.length) process.exitCode = 1;
  if (before.missingLocalFiles.length) {
    console.warn("Missing local images were not deleted from metadata; check repository assets before repairing.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
