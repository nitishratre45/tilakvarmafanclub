(() => {
  "use strict";
  const legacyRoutes = {
    "#innings": "/matches/index.html",
    "#tv-gallery-hub": "/photos/index.html",
    "#records": "/records/",
    "#news": "/news/",
    "#tilak-videos": "/videos/",
  };
  const routeFor = (value) => legacyRoutes[value] || legacyRoutes[new URL(value, location.href).hash];
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/" && location.hash && legacyRoutes[location.hash]) {
    location.replace(legacyRoutes[location.hash]);
    return;
  }
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || (location.pathname.replace(/\/+$/, "") || "/") !== "/") return;
    const destination = routeFor(link.getAttribute("href"));
    if (!destination) return;
    event.preventDefault();
    location.assign(destination);
  }, true);
})();
