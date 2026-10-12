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

check("default appearance is dark", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const theme = await page.locator("html").getAttribute("data-theme");
  assert.equal(theme, "dark", "Expected dark theme by default");
  await page.close();
});

check("section navigation switches content and keeps one main section visible", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="#stats"]').click();
  await page.waitForFunction(() => location.hash === "#stats");
  assert.equal(await page.locator("#stats").isVisible(), true, "Stats section should be visible");
  assert.equal(await page.locator("#profile").isVisible(), false, "Profile should be hidden");
  const visibleSections = await page.locator("main > section[id]").evaluateAll((nodes) =>
    nodes.filter((node) => !node.hidden && getComputedStyle(node).display !== "none").map((node) => node.id),
  );
  assert(visibleSections.includes("stats"), "Stats missing from visible sections");
  assert(visibleSections.every((id) => id === "stats" || id === "home-snapshot"), "Unexpected visible sections: " + visibleSections.join(", "));
  await page.close();
});

check("Stats Explorer sub-tab responds", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="#stats"]').click();
  const tab = page.locator('#stats [data-stats-tab="statsguru"]');
  assert.equal(await tab.count(), 1, "Statsguru tab is missing");
  await tab.click();
  assert.equal(await page.locator("#statsguru").isVisible(), true, "Statsguru view did not open");
  await page.close();
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
  await nav.locator('a[href="#records"]').click();
  await page.waitForFunction(() => location.hash === "#records");
  assert.equal(await button.getAttribute("aria-expanded"), "false", "Menu did not close after navigation");
  assert.equal(await page.locator("#records").isVisible(), true, "Records section did not open");
  await page.close();
});

check("theme controls change and persist selected appearance", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="#settings"]').click();
  const light = page.locator('[data-theme-choice="light"]');
  assert.equal(await light.count(), 1, "Light theme control missing");
  await light.click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.equal(await page.evaluate(() => localStorage.getItem("tilak-fc-theme")), "light");
  await page.locator('[data-theme-choice="dark"]').click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.close();
});


check("gallery handles externally hosted photo previews that fail to load", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.route("https://media.gettyimages.com/**", (route) => route.abort());
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="#tv-gallery-hub"]').click();
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
  await page.locator('#main-nav a[href="#tv-gallery-hub"]').click();
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
  await page.locator('#main-nav a[href="#tv-gallery-hub"]').click();
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
  await page.locator('#main-nav a[href="#tilak-videos"]').click();
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
    assert(backHref && /#news$/.test(backHref), "Back link must target the News section; got: " + backHref);
    await back.click();
    await page.waitForFunction(() => location.hash === "#news", { timeout: 5000 }).catch(async () => {
      const current = new URL(page.url());
      assert.equal(current.hash, "#news", "Back navigation should return to News; current URL: " + current.href);
    });
    assert.equal(new URL(page.url()).hash, "#news", "Back navigation should return to the News section");
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
