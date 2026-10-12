// Cloudflare Pages Function for the real /stats route.
// _redirects rules are bypassed for requests handled by Pages Functions, so
// serve index.html directly through the Assets binding while preserving the
// browser-visible URL (/stats).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  url.search = "";
  const rewrittenRequest = new Request(url, context.request);
  return context.env.ASSETS.fetch(rewrittenRequest);
}
