/**
 * Public-site shell middleware.
 * Injects the shared navbar/footer assets into every public HTML page,
 * including pages added in future folders. The private admin studio keeps
 * its own navigation and layout.
 */
export async function onRequest(context) {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const pathname = new URL(context.request.url).pathname;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return response;

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(
          '<link rel="stylesheet" href="/assets/site-shell.css?v=20261013-shared-shell1">',
          { html: true },
        );
      },
    })
    .on("body", {
      element(element) {
        element.append(
          '<script defer src="/assets/site-shell.js?v=20261013-shared-shell1"></script>',
          { html: true },
        );
      },
    })
    .transform(response);
}
