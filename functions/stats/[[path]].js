// Keep /stats/ and future nested Stats paths on the same site shell.
// This is an internal rewrite, not a redirect, so the URL remains unchanged.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  url.search = "";
  return context.next(new Request(url, context.request));
}
