// Keep /stats/ and any future nested Stats URLs on the same site shell.
// The browser URL is not redirected; only the internal asset request changes.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  url.search = "";
  const rewrittenRequest = new Request(url, context.request);
  return context.env.ASSETS.fetch(rewrittenRequest);
}
