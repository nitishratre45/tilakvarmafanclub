// Case-sensitive compatibility route for the physical /Stats folder.
// Its HTML files are partials, not standalone pages. Redirect direct browser
// visits to the canonical lowercase route; internal fetches still load /Stats/*.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  // Keep the Stats module files available for fetches, but do not serve a
  // partial document as a standalone page in the browser.
  if (context.request.headers.get("accept")?.includes("text/html")) {
    return Response.redirect(new URL("/stats" + url.search + url.hash, url), 302);
  }
  return context.next();
}
