import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "photos", "index.html"), "utf8");

test("Photos page loads only existing local stylesheets and scripts", () => {
  const localAssets = [...html.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))(?:\?[^"]*)?"/g)]
    .map((match) => match[1])
    .filter((url) => url.startsWith("/photos/") || url.startsWith("/assets/"));
  assert.ok(localAssets.length > 0, "expected local Photos assets");
  for (const url of localAssets) {
    assert.ok(fs.existsSync(path.join(ROOT, url.slice(1))), `missing referenced asset: ${url}`);
  }
});

test("Photos page no longer references removed legacy CSS or unused theme/Plyr assets", () => {
  for (const removed of [
    "/photos/style.css",
    "/photos/premium-ui.css",
    "/photos/site-refinement.css",
    "/photos/admin-inspired-ui.css",
    "/photos/theme.js",
    "plyr.css",
  ]) {
    assert.equal(html.includes(removed), false, `unexpected unused asset reference: ${removed}`);
  }
});

test("Photos navigation is controlled by the shared mobile menu only", () => {
  assert.match(html, /mobile-glass-menu\.js/);
  assert.doesNotMatch(html, /menu\.addEventListener\(["']click["']/);
  assert.doesNotMatch(html, /nav\?\.addEventListener\(["']click["']/);
});

test("Gallery and dedicated page styles are present", () => {
  assert.match(html, /\/photos\/gallery\.css/);
  assert.match(html, /\/photos\/photos\.css/);
  assert.ok(fs.existsSync(path.join(ROOT, "photos", "gallery.js")));
});
