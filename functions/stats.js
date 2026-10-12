// Cloudflare Pages Function for the real /stats route.
// Rewrite the internal asset request while preserving the browser-visible URL.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  url.search = "";
  return context.next({ request: new Request(url, context.request) });
}
