/* Mobile-only persistent bottom navigation. Does not replace or modify the existing header menu. */
(function () {
  "use strict";
  if (document.getElementById("tvfc-mobile-bottom-nav")) return;
  const path = (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  const items = [
    { label: "Home", href: "/", key: "home", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>', active: path === "/" },
    { label: "Match", href: "/matches/", key: "match", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"/><path d="m7 6 11 12M17 5l2 2M5 17l2 2"/></svg>', active: path.startsWith("/matches") || path.startsWith("/stats") || path.startsWith("/records") || path.startsWith("/death-overs") },
    { label: "Photo", href: "/photos/", key: "photo", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/></svg>', active: path.startsWith("/photos") },
    { label: "Video", href: "/videos/", key: "video", icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/></svg>', active: path.startsWith("/videos") }
  ];
  const style = document.createElement("style");
  style.id = "tvfc-mobile-bottom-nav-style";
  style.textContent = [
    "#tvfc-mobile-bottom-nav{display:none}",
    "@media(max-width:767px){",
    "body{padding-bottom:calc(88px + env(safe-area-inset-bottom,0px))!important}",
    "#tvfc-mobile-bottom-nav{position:fixed;left:12px;right:12px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:9990;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:8px 7px calc(8px + env(safe-area-inset-bottom,0px));border:1px solid rgba(160,205,232,.34);border-radius:24px;background:rgba(7,19,36,.91);box-shadow:0 10px 34px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}",
    "#tvfc-mobile-bottom-nav a{min-width:0;min-height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:16px;color:#c5d3e4;text-decoration:none;font:600 11px/1.1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.01em;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background-color .16s ease,color .16s ease,transform .16s ease}",
    "#tvfc-mobile-bottom-nav a:active{transform:scale(.96)}",
    "#tvfc-mobile-bottom-nav a[aria-current='page']{color:#8cddff;background:linear-gradient(145deg,rgba(37,126,177,.27),rgba(24,67,107,.32));box-shadow:inset 0 0 0 1px rgba(104,203,244,.25)}",
    "#tvfc-mobile-bottom-nav svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}",
    "#tvfc-mobile-bottom-nav span{white-space:nowrap}",
    "html{scroll-padding-bottom:100px}",
    "}",
    "@media(min-width:768px){#tvfc-mobile-bottom-nav{display:none!important}body{padding-bottom:0!important}}",
    "@media(prefers-reduced-motion:reduce){#tvfc-mobile-bottom-nav a{transition:none}}"
  ].join("");
  document.head.appendChild(style);
  const nav = document.createElement("nav");
  nav.id = "tvfc-mobile-bottom-nav";
  nav.setAttribute("aria-label", "Quick navigation");
  nav.innerHTML = items.map(function (item) {
    return '<a href="' + item.href + '"' + (item.active ? ' aria-current="page"' : "") + ' data-nav="' + item.key + '">' + item.icon + "<span>" + item.label + "</span></a>";
  }).join("");
  document.body.appendChild(nav);
})();