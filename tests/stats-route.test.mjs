import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cases = [
  { file: "../functions/stats.js", url: "https://example.test/stats?from=fanclub" },
  { file: "../functions/stats/[[path]].js", url: "https://example.test/stats/batting?from=fanclub" },
];

for (const testCase of cases) {
  const source = await readFile(new URL(testCase.file, import.meta.url), "utf8");
  const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  const { onRequest } = await import(moduleUrl);
  let rewrittenRequest;
  const expectedResponse = new Response("site shell", {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  const context = {
    request: new Request(testCase.url),
    next: async (options) => {
      rewrittenRequest = options.request;
      return expectedResponse;
    },
  };

  const response = await onRequest(context);
  assert.equal(
    new URL(rewrittenRequest.url).pathname,
    "/index.html",
    testCase.file + " should internally rewrite to index.html",
  );
  assert.equal(response, expectedResponse, "The function should return the internally rewritten response");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Location"), null, "The route must not issue a browser redirect");
  assert.equal(context.request.url, testCase.url, "The original browser request URL should remain untouched");
}

console.log("PASS /stats and nested Stats Pages Functions rewrite internally without redirecting");
