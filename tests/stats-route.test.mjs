import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../functions/stats.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { onRequest } = await import(moduleUrl);
let rewrittenRequest;
const expectedResponse = new Response("site shell", { status: 200, headers: { "Content-Type": "text/html" } });
const context = {
  request: new Request("https://example.test/stats?from=fanclub"),
  next: async (options) => {
    rewrittenRequest = options.request;
    return expectedResponse;
  },
};

const response = await onRequest(context);
assert.equal(rewrittenRequest.url, "https://example.test/index.html", "The function should internally rewrite to index.html");
assert.equal(response, expectedResponse, "The function should return the internally rewritten response");
assert.equal(response.status, 200);
assert.equal(response.headers.get("Location"), null, "The route must not issue a browser redirect");
assert.equal(context.request.url, "https://example.test/stats?from=fanclub", "The browser request URL should remain untouched");
console.log("PASS /stats Pages Function internally rewrites without redirecting");
