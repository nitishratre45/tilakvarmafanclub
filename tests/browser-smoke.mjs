import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseURL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8000";
const browser = await chromium.launch({ headless: true });
const failures = [];
const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("home loads without uncaught JavaScript exceptions", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-nav");
  await page.waitForTimeout(1200);
  assert.deepEqual(pageErrors, [], "Uncaught page errors: " + pageErrors.join(" | "));
  await page.close();
});

check("dedicated Stats folder opens full Batting/Bowling/Explore page", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="/stats/"]').click();
  await page.waitForURL(url => url.pathname === "/stats/");
  await page.locator("#stats").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/stats/", "Navbar Stats link should open the dedicated folder page");
  assert.equal(await page.locator("#stats-overview").isVisible(), true, "Batting view should be the default");
  await page.waitForFunction(() => document.querySelector('[data-stat="t20iRuns"]')?.textContent.trim() === "1,791");
  assert.equal(await page.locator("#career-formats .format-card").count() >= 4, true, "Format-wise batting cards should populate from saved JSON");
  assert.notEqual(await page.locator("#data-status").innerText(), "Loading", "Career data status should finish loading");
  const snapshotResponse = await page.request.get(baseURL + "/data/site-data.json");
  assert.equal(snapshotResponse.status(), 200, "Shared JSON must be served from the site root on nested Stats routes");
  await page.locator('#stats [data-stats-tab="stats-bowling"]').click();
  assert.equal(await page.locator("#stats-bowling").isVisible(), true, "Bowling tab should open its full view");
  await page.waitForFunction(() => document.querySelector("#bowling-updated")?.textContent.trim().length > 0);
  assert.match(await page.locator("#bowling-summary").innerText(), /WICKETS/i, "Bowling summary should render its verified metrics");
  assert.match(new URL(page.url()).search, /view=stats-bowling/, "Bowling view should be represented in the URL");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#stats-bowling").isVisible(), true, "Bowling view should survive refresh");
  await page.locator('#stats [data-stats-tab="statsguru"]').click();
  assert.equal(await page.locator("#statsguru").isVisible(), true, "Explore view should open");
  await page.waitForFunction(() => {
    const status = document.querySelector("#statsguru-updated")?.textContent || "";
    return status.length > 0 && !/Checking update|temporarily unavailable/i.test(status);
  });
  assert.equal(await page.locator("#statsguru-tbody tr").count() > 0, true, "Explore table should render data or an explicit empty state");
  assert.deepEqual(pageErrors, [], "Stats page errors: " + pageErrors.join(" | "));
  await page.close();
});

check("default appearance is dark", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const theme = await page.locator("html").getAttribute("data-theme");
  assert.equal(theme, "dark", "Expected dark theme by default");
  await page.close();
});

check("homepage section navigation and dedicated Stats route work independently", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="/records/"]').click();
  await page.waitForURL(url => url.pathname === "/records/");
  assert.equal(await page.locator("#icc-record-highlights").isVisible(), true, "Dedicated Records page should open");
  assert.equal(await page.locator("#stats").count(), 0, "Stats must stay on its dedicated folder page, not be embedded in homepage");
  await page.locator('#main-nav a[href="/stats/"]').click();
  await page.waitForURL(url => url.pathname === "/stats/");
  assert.equal(await page.locator("#stats").isVisible(), true, "Dedicated Stats page should open from homepage navbar");
  await page.close();
});

check("Stats Explore sub-tab responds on dedicated page", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL + "/stats/", { waitUntil: "domcontentloaded" });
  const tab = page.locator('#stats [data-stats-tab="statsguru"]');
  assert.equal(await tab.count(), 1, "Statsguru tab is missing from dedicated Stats page");
  await tab.click();
  assert.equal(await page.locator("#statsguru").isVisible(), true, "Statsguru view did not open");
  assert.match(new URL(page.url()).search, /view=statsguru/, "Explore view should be represented in the URL");
  await page.close();
});

check("Matches and Photos navbar links open their dedicated pages", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator('#main-nav a[href="/matches/"]').count(), 1, "Homepage Matches link must use the dedicated route");
  assert.equal(await page.locator('#main-nav a[href="/photos/"]').count(), 1, "Homepage Photos link must use the dedicated route");
  await page.locator('#main-nav a[href="/matches/"]').click();
  await page.waitForURL(url => url.pathname === "/matches/" || url.pathname === "/matches/index.html");
  assert.equal(await page.locator("main").innerText().then(text => /THE MATCHES/.test(text)), true, "Dedicated Matches content should render");
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="/photos/"]').click();
  await page.waitForURL(url => url.pathname === "/photos/");
  await page.locator("#tv-gallery-hub").waitFor({ state: "visible" });
  assert.equal(await page.locator(".tv-album-card").count() > 0, true, "Photos albums should render");
  await page.close();
});

check("legacy cached Matches and Photos hash links are redirected", async () => {
  for (const [legacyHref, expectedPath] of [["#innings", "/matches/index.html"], ["#tv-gallery-hub", "/photos/index.html"]]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await page.locator("#main-nav").evaluate((nav, href) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = "Legacy route test";
      nav.appendChild(link);
    }, legacyHref);
    await page.locator('#main-nav a').filter({ hasText: "Legacy route test" }).click();
    await page.waitForURL(url => url.pathname === expectedPath);
    await page.close();
  }
});

check("mobile navigation opens, scroll target works, and closes after selection", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const button = page.locator(".menu-toggle");
  const nav = page.locator("#main-nav");
  await button.click();
  assert.equal(await button.getAttribute("aria-expanded"), "true", "Menu aria-expanded did not become true");
  assert(await nav.evaluate((node) => node.classList.contains("open")), "Mobile nav did not open");
  await nav.locator('a[href="/records/"]').click();
  await page.waitForURL(url => url.pathname === "/records/");
  assert.equal(await button.getAttribute("aria-expanded"), "false", "Menu did not close after navigation");
  await page.close();
});

check("native navigation uses section-local UI assets without the removed global shell", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(8000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const nav = page.locator("#main-nav");
  for (const href of ["/stats/", "/death-overs/", "/matches/", "/records/", "/news/", "/photos/", "/videos/"]) {
    assert.equal(await nav.locator('a[href="' + href + '"]').count(), 1, "Native navbar route is missing: " + href);
  }
  assert.equal(await page.locator('script[src^="/home/app.js"]').count(), 1, "Home UI script should load from the home folder");
  assert.equal(await page.locator('link[href^="/home/premium-ui.css"]').count(), 1, "Home UI stylesheet should load from the home folder");
  assert.equal(await page.locator('script[src*="site-shell.js"]').count(), 0, "Removed global shell must not be injected");

  await page.goto(baseURL + "/stats/", { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator('script[src^="/stats/statsguru.js"]').count(), 1, "Stats module should load from the Stats folder");
  assert.equal(await page.locator('link[href^="/stats/premium-ui.css"]').count(), 1, "Stats UI stylesheet should load from the Stats folder");
  assert.deepEqual(pageErrors, [], "Native navigation errors: " + pageErrors.join(" | "));
  await page.close();
});

check("removed Settings section stays absent from the navbar", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator('#main-nav a[href="#settings"]').count(), 0, "Removed Settings link must not return");
  assert.equal(await page.locator("#settings").count(), 0, "Removed Settings section must not return");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "Default appearance should remain dark");
  await page.close();
});


check("gallery handles externally hosted photo previews that fail to load", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.route("https://media.gettyimages.com/**", (route) => route.abort());
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#tv-gallery-hub").count(), 0, "Homepage must not embed Photos section");
  await page.locator('#main-nav a[href="/photos/"]').click();
  await page.waitForURL(url => url.pathname === "/photos/");
  const album = page.locator(".tv-album-card").filter({ hasText: "ASIAN GAMES 2026 FINAL" });
  await album.waitFor();
  await album.click();
  const photo = page.locator(".tv-album-photo").first();
  await photo.waitFor();
  await photo.click();
  await page.locator(".tv-lightbox-download").waitFor();
  await page.waitForFunction(() => {
    const caption = document.querySelector("#tv-photo-lightbox figcaption");
    return caption && caption.textContent.includes("preview unavailable");
  });
  assert.match(await page.locator(".tv-lightbox-download").innerText(), /Open original photo/);
  assert.equal(await page.locator(".tv-lightbox-download").getAttribute("target"), "_blank");
  await page.close();
});

check("mobile photo gallery shows ten albums at a time and filters by year/month", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  const items = [];
  const names = [];
  for (let i = 0; i < 23; i++) {
    const year = i < 12 ? 2024 : 2025;
    const month = i < 6 ? "01" : i < 12 ? "02" : "03";
    const album = "Archive Album " + String(i + 1).padStart(2, "0");
    names.push(album);
    items.push({
      title: "Tilak Varma " + i,
      album,
      url: "https://example.com/photo-" + i + ".jpg",
      type: "image",
      createdAt: year + "-" + month + "-15T12:00:00.000Z",
    });
  }
  await page.route("**/data/admin-media.json*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items, albums: names, updatedAt: "2026-10-11T00:00:00.000Z" }),
  }));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const menu = page.locator(".menu-toggle");
  if (await menu.isVisible()) await menu.click();
  await page.locator('#main-nav a[href="/photos/"]').click();
  await page.waitForURL(url => url.pathname === "/photos/");
  await page.locator(".tv-gallery-year").waitFor();
  const geometry = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height) };
    };
    return {
      section: rect("#tv-gallery-hub"),
      gallery: rect("#tv-gallery-hub > .tv-gallery-hub__shell"),
      toolbar: rect("#tv-gallery-grid > .tv-gallery-toolbar"),
      firstAlbum: rect("#tv-gallery-grid .tv-album-card"),
    };
  });
  assert(geometry.section && geometry.gallery && geometry.toolbar && geometry.firstAlbum,
    "Photo gallery geometry is incomplete: " + JSON.stringify(geometry));
  assert(geometry.gallery.top - geometry.section.top < 45,
    "Unexpected blank gap above gallery: " + JSON.stringify(geometry));
  assert(geometry.firstAlbum.top - geometry.toolbar.bottom < 36,
    "Unexpected blank gap between filters and first album: " + JSON.stringify(geometry));
  assert.equal(await page.locator(".tv-album-card").count(), 10, "First page should show 10 albums");
  await page.locator(".tv-gallery-more").click();
  assert.equal(await page.locator(".tv-album-card").count(), 20, "More albums should reveal the next 10");
  await page.locator(".tv-gallery-more").click();
  assert.equal(await page.locator(".tv-album-card").count(), 23, "Final page should show remaining albums");
  await page.locator(".tv-gallery-year").selectOption("2024");
  assert.equal(await page.locator(".tv-album-card").count(), 10, "Year filter resets paging and shows first 10 matches");
  await page.locator(".tv-gallery-month").selectOption("1");
  assert.equal(await page.locator(".tv-album-card").count(), 6, "Month filter should narrow results");
  assert.equal(await page.locator(".tv-gallery-more").count(), 0, "More button should hide when all filtered albums fit");
  await page.close();
});

check("Matches folder loads upcoming fixtures and keeps match formats separate", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const date = "2026-08-01";
  const row = (format, score, source = "ESPNcricinfo Statsguru") => ({
    date, opposition: "Australia", ground: "Test Ground", score, runs: Number.parseInt(score, 10),
    balls: 10, source, format
  });
  const fixture = {
    playerMatches: [],
    playerMatchesUpdatedAt: "2026-10-12 12:00 UTC",
    statsguru: { updatedAt: "2026-10-12 12:00 UTC", formats: {
      T20I: { innings: [row("T20I", "40")] },
      T20: { innings: [row("T20", "40")] },
      FC: { innings: [row("FC", "70")] },
      "List A": { innings: [row("List A", "30")] }
    }},
    recentInnings: [],
    bowlingStats: { formats: {} }
  };
  await page.route("**/data/site-data.json*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(fixture)
  }));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#player-matches-table").count(), 0, "Homepage must not embed the Match section");
  assert.equal(await page.locator("#upcoming-matches-list").count(), 0, "Homepage must not embed upcoming fixtures");
  await page.locator('#main-nav a[href="/matches/"]').click();
  await page.waitForURL(url => url.pathname === "/matches/");
  await page.locator("#player-matches-table tr").filter({ hasText: "Australia" }).first().waitFor();
  const rows = await page.locator("#player-matches-table tr").filter({ hasText: "Australia" }).evaluateAll(nodes =>
    nodes.map(node => ({ text: node.innerText, format: node.cells[5]?.innerText }))
  );
  assert.equal(rows.length, 3, "T20I/T20 overlap should collapse, but FC and List A rows must remain: " + JSON.stringify(rows));
  assert.deepEqual(rows.map(row => row.format).sort(), ["FC", "List A", "T20I"]);
  await page.locator("#player-match-format").selectOption("FC");
  assert.equal(await page.locator("#player-matches-table tr").filter({ hasText: "Australia" }).count(), 1,
    "FC filter should show its own match row");
  await page.close();
});

check("Death Overs page loads the saved dataset and matches its innings count", async () => {
  const data = JSON.parse(await readFile(new URL("../data/death-overs.json", import.meta.url), "utf8"));
  assert(Array.isArray(data.innings) && data.innings.length > 0, "Saved Death Overs innings must not be empty");
  assert(data.updatedAt, "Death Overs dataset should include its update timestamp");
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(baseURL + "/death-overs/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#feed-status")?.textContent === "STATS LOADED");
  const displayed = Number((await page.locator("#total-innings").innerText()).replace(/,/g, ""));
  assert.equal(displayed, Number(data.inningsFound || data.innings.length), "Displayed innings count must match saved JSON");
  await page.close();
});

check("photo album cover uses the newest photo in that album", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const items = [
    { title: "Older photo", album: "Sort Order Test", url: "https://example.com/older.jpg", type: "image", createdAt: "2026-01-01T00:00:00.000Z" },
    { title: "Newest photo", album: "Sort Order Test", url: "https://example.com/newest.jpg", type: "image", createdAt: "2026-10-12T00:00:00.000Z" },
  ];
  await page.route("**/data/admin-media.json*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items, albums: ["Sort Order Test"], updatedAt: "2026-10-12T00:00:00.000Z" }),
  }));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#tv-gallery-hub").count(), 0, "Homepage must not embed Photos section");
  await page.locator('#main-nav a[href="/photos/"]').click();
  await page.waitForURL(url => url.pathname === "/photos/");
  const album = page.locator(".tv-album-card").filter({ hasText: "Sort Order Test" });
  await album.waitFor();
  assert.match(await album.locator("img").getAttribute("src"), /newest\.jpg$/, "Album cover should use the newest photo");
  await page.close();
});

check("video hub puts the newest published BCCI video first", async () => {
  const data = JSON.parse(await readFile(new URL("../assets/bcci-videos.json", import.meta.url), "utf8"));
  const newest = [...data.videos].sort((a, b) => (Date.parse(b.publishedDate || "") || 0) - (Date.parse(a.publishedDate || "") || 0))[0];
  assert(newest?.id, "Video feed should contain a published video");
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="/videos/"]').click();
  await page.waitForURL(url => url.pathname === "/videos/");
  const firstVideo = page.locator(".bcci-video-card button[data-bcci-video]").first();
  await firstVideo.waitFor();
  assert.equal(await firstVideo.getAttribute("data-bcci-video"), newest.id, "Video cards should be sorted newest-first");
  await page.close();
});

check("News Details opens article and returns safely on desktop and mobile", async () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10000);
    await page.route("**/News/newsjson.json*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ news: [{
        id: "browser-test-tilak-story",
        title: "Browser test Tilak story",
        description: "News summary for interaction test.",
        webviewUrl: "https://example.com/tilak-story",
        publishedAt: "2026-10-12T08:00:00Z",
        sourceName: "Test source",
        contentBlocks: [{ type: "paragraph", text: "Article body for the browser test." }]
      }] }),
    }));
    await page.goto(baseURL + "/News-details/index.html?id=browser-test-tilak-story", { waitUntil: "domcontentloaded" });
    await page.locator("#news-article").waitFor({ state: "visible" });
    assert.equal(await page.locator("#detail-title").innerText(), "Browser test Tilak story");
    assert.match(await page.locator("#detail-excerpt").innerText(), /Article body for the browser test/);
    const back = page.locator(".mobile-back");
    await back.waitFor({ state: "visible" });
    const backHref = await back.getAttribute("href");
    assert(backHref && /\/news\/?$/.test(backHref), "Back link must target the News page; got: " + backHref);
    await back.click();
    await page.waitForURL(url => url.pathname === "/news/" || url.pathname === "/news", { timeout: 5000 });
    assert.match(new URL(page.url()).pathname, /^\/news\/?$/, "Back navigation should return to the News page");
    await page.close();
  }
});
check("Admin Studio warns before discarding unsaved edits", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const stats = JSON.parse(await readFile(new URL("../data/site-data.json", import.meta.url), "utf8"));
  await page.route("**/api/admin/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { authenticated: true } });
    if (url.pathname.endsWith("/content")) return route.fulfill({ json: url.searchParams.get("kind") === "media" ? { items: [], albums: [] } : { feedUrl: "" } });
    if (url.pathname.endsWith("/data-editor") && req.method() === "GET") return route.fulfill({ json: { kind: "stats", path: "data/site-data.json", data: stats } });
    return route.fulfill({ json: { ok: true, items: [], runs: [], datasets: [] } });
  });
  await page.goto(baseURL + "/admin/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#admin-nav [data-view='data-editor']").click();
  const field = page.locator('#friendly-fields [data-friendly-key]:not([type="number"])').first();
  await field.waitFor();
  const originalKind = await page.locator("#friendly-kind").inputValue();
  await field.fill((await field.inputValue()) + " test");
  let warned = false;
  page.once("dialog", async (dialog) => { warned = true; await dialog.dismiss(); });
  await page.locator("#friendly-kind").selectOption("profile");
  assert.equal(warned, true);
  assert.equal(await page.locator("#friendly-kind").inputValue(), originalKind);
  await page.close();
});

try {
  for (const item of checks) {
    try {
      await item.fn();
      console.log("PASS " + item.name);
    } catch (error) {
      failures.push({ name: item.name, error: error?.stack || String(error) });
      console.error("FAIL " + item.name + "\\n" + (error?.stack || error));
    }
  }
} finally {
  await browser.close();
}

console.log("\\nBrowser smoke tests: " + (checks.length - failures.length) + "/" + checks.length + " passed");
if (failures.length) process.exitCode = 1;
