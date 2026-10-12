// Case-sensitive compatibility route for the physical /Stats folder.
// The folder contains partial HTML, so direct browser requests must not serve
// those fragments as standalone pages. Use the app shell on any /Stats/* URL.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  url.search = "";
  return context.next(new Request(url, context.request));
}
