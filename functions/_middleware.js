/**
 * Shared public-site shell and favicon middleware.
 * Applies the same favicon to every HTML page, including nested/future folders.
 * The admin workspace keeps its own layout, but uses the same favicon.
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
      if (!isAdmin) {
        element.append(
          '<link rel="stylesheet" href="/assets/site-shell.css?v=20261013-navbar-v3">',
          { html: true },
        );
      }
    },
  });

  if (!isAdmin) {
    rewriter.on("body", {
      element(element) {
        element.append(
          '<script defer src="/assets/site-shell.js?v=20261013-navbar-v3"></script>',
          { html: true },
        );
      },
    });
  }

  return rewriter.transform(response);
}
