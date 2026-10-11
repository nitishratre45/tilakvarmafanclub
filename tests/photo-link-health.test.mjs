import test from "node:test";
import assert from "node:assert/strict";
import { checkPhotoUrl, buildPhotoHealthReport } from "../scripts/photo-link-health.mjs";

test("reachable URL is reported without altering source data", async () => {
  const result = await checkPhotoUrl("https://example.com/a.jpg", async () => ({ status: 200 }));
  assert.equal(result.status, "reachable");
});

test("403 is treated as blocked, not broken", async () => {
  const result = await checkPhotoUrl("https://example.com/blocked.jpg", async () => ({ status: 403 }));
  assert.equal(result.status, "blocked_or_rate_limited");
  assert.equal(result.httpStatus, 403);
});

test("404 is reported as not found", async () => {
  const result = await checkPhotoUrl("https://example.com/missing.jpg", async () => ({ status: 404 }));
  assert.equal(result.status, "not_found");
});

test("HEAD-blocking hosts get a ranged GET fallback", async () => {
  const methods = [];
  const result = await checkPhotoUrl("https://example.com/image.jpg", async (_url, options) => {
    methods.push(options.method);
    return { status: options.method === "HEAD" ? 405 : 206 };
  });
  assert.deepEqual(methods, ["HEAD", "GET"]);
  assert.equal(result.status, "reachable");
});

test("report checks unique external URLs and never mutates media metadata", async () => {
  const data = { items: [
    { title: "A", album: "Match", url: "https://example.com/a.jpg" },
    { title: "Another caption", album: "Match", url: "https://example.com/a.jpg" },
    { title: "BCCI local", url: "/assets/imported-photos/" + "a".repeat(64) + ".webp" },
  ] };
  const original = JSON.stringify(data);
  const report = await buildPhotoHealthReport(data, async () => ({ status: 200 }));
  assert.equal(report.totalExternalUrls, 1);
  assert.equal(report.results[0].titles.length, 2);
  assert.equal(JSON.stringify(data), original);
});
