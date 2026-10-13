/**
 * Shared favicon middleware.
 * Keep each page's own navbar and footer intact so its navigation handlers remain attached.
 */
export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const pathname = new URL(context.request.url).pathname;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  const rewriter = new HTMLRewriter().on("head", {
    element(element) {
      element.append(
        '<link rel="icon" type="image/png" href="/tilak%20varma%20photos%20fv/tilak%20varma%20favicon.png?v=20261013-favicon2">',
        { html: true },
      );
      element.append(
        '<link rel="apple-touch-icon" href="/tilak%20varma%20photos%20fv/tilak%20varma%20favicon.png?v=20261013-favicon2">',
        { html: true },
      );
      element.append('<meta name="theme-color" content="#0b5fc4">', { html: true });
    },
  });

  return rewriter.transform(response);
}
