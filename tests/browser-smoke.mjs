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
  page.on("pageerror", error => pageErrors.push(JSON.stringify({ name: error.name, message: error.message, stack: error.stack })));
  page.on("console", message => {
    if (message.type() === "error") {
      const location = message.location();
      pageErrors.push("console: " + message.text() + (location.url ? " @ " + location.url + ":" + location.lineNumber : ""));
    }
  });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="/stats/"]').click();
  await page.waitForURL(url => url.pathname === "/stats/");
  await page.locator("#stats").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/stats/", "Navbar Stats link should open the dedicated folder page");
  assert.equal(await page.locator("#stats-overview").isVisible(), true, "Batting view should be the default");
  const snapshotResponse = await page.request.get(baseURL + "/data/site-data.json");
  assert.equal(snapshotResponse.status(), 200, "Shared JSON must be served from the site root on nested Stats routes");
  const snapshot = await snapshotResponse.json();
  const expectedT20IRuns = Number(snapshot.careerFormats?.T20I?.runs).toLocaleString("en-IN");
  assert.notEqual(expectedT20IRuns, "NaN", "Saved T20I career runs must exist in the shared snapshot");
  await page.waitForFunction((expected) => document.querySelector('[data-stat="t20iRuns"]')?.textContent.trim() === expected, expectedT20IRuns);
  assert.equal(await page.locator("#career-formats .format-card").count() >= 4, true, "Format-wise batting cards should populate from saved JSON");
  assert.notEqual(await page.locator("#data-status").innerText(), "Loading", "Career data status should finish loading");
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
  await page.locator('#main-nav a[href="/matches/"]').click({ force: true });
  await page.waitForURL(url => url.pathname === "/matches/" || url.pathname === "/matches/index.html", { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("main").innerText().then(text => /THE MATCHES/.test(text)), true, "Dedicated Matches content should render");
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('#main-nav a[href="/photos/"]').click({ force: true });
  await page.waitForURL(url => url.pathname === "/photos/", { waitUntil: "domcontentloaded" });
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
  await nav.locator('a[href="/records/"]').click({ force: true });
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
  await page.locator('#main-nav a[href="/photos/"]').click({ force: true });
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
  await page.locator('#main-nav a[href="/photos/"]').click({ force: true });
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

check("Matches folder defaults to Upcoming and opens complete match scorecards", async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const fixture = {
    checkedAt: "2026-10-15T12:00:00Z",
    status: "updated-from-news-and-bcci-json",
    fixtures: [{
      date: "2026-10-17", label: "Sat, 17 Oct 2026", match: "Tour match",
      team: "India", opponent: "Australia", venue: "Test Ground", time: "19:00",
      newsUrl: "/News-details/index.html?id=test-squad-announcement",
      tilakInSquad: true,
      confirmationSource: "BCCI squad announcement naming Tilak Varma"
    }]
  };
  const bcciFixtures = {
    status: "updated-from-bcci-stats",
    fixtures: [{
      date: "2026-10-17", match: "Tour match", team: "India", opponent: "Australia",
      venue: "Test Ground", time: "19:00", source: "https://stats.bcci.tv/match/fixtures/test"
    }]
  };
  const rows = [
    { matchId: "t20i-test", date: "2026-08-01", format: "T20I", team: "India", opposition: "Australia", venue: "Test Ground", result: "India won by 5 wickets", playerRuns: 40, inningsCount: 2 },
    { matchId: "t20-test", date: "2026-07-01", format: "T20", team: "Mumbai Indians", opposition: "Australia", venue: "Test Ground", result: "Match completed", playerRuns: 20, inningsCount: 2 },
    { matchId: "fc-test", date: "2026-06-01", format: "First-class", team: "Hyderabad (India)", opposition: "Australia", venue: "Test Ground", result: "Match drawn", playerRuns: 70, inningsCount: 4 },
    { matchId: "list-a-test", date: "2026-05-01", format: "List A", team: "Hyderabad (India)", opposition: "Australia", venue: "Test Ground", result: "Won by 10 runs", playerRuns: 30, inningsCount: 2 }
  ];
  const scorecard = {
    team: "India", opposition: "Australia", date: "2026-08-01", venue: "Test Ground",
    format: "T20I", result: "India won by 5 wickets", source: "https://cricsheet.org/",
    attribution: "Cricsheet match data",
    innings: [{
      number: 1, team: "India", runs: 40, wickets: 1, overs: "5.0", extras: 0,
      extrasBreakdown: {}, batting: [{ batter: "Tilak Varma", runs: 40, balls: 20, fours: 4, sixes: 2, strikeRate: 200, dismissal: "not out", notOut: true }],
      bowling: [{ bowler: "Australia Bowler", overs: "5.0", maidens: 0, runs: 40, wickets: 1, economy: 8 }],
      fallOfWickets: [], deliveries: [{ over: 1, ball: 1, batter: "Tilak Varma", bowler: "Australia Bowler", totalRuns: 4, wickets: [] }]
    }]
  };
  await page.route("**/data/site-data.json*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ playerMatches: [], recentInnings: [], bowlingStats: { formats: {} } })
  }));
  await page.route("**/matches/upcoming-fixtures-refresh.json*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(fixture)
  }));
  await page.route("**/matches/bcci-stats-fixtures.json*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(bcciFixtures)
  }));
  await page.route("**/matches/scorecards/index.json*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ matchCount: rows.length, updatedAt: "2026-10-13T12:00:00Z", coverageNote: "Verified test data", matches: rows })
  }));
  await page.route("**/matches/scorecards/data/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(scorecard)
  }));
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#match-tab-upcoming").count(), 0, "Homepage must not embed the Match Centre");
  await page.locator('#main-nav a[href="/matches/"]').click();
  await page.waitForURL(url => url.pathname === "/matches/");
  await page.locator("#match-tab-upcoming").waitFor();
  assert.equal(await page.locator("#match-tab-upcoming").getAttribute("aria-selected"), "true", "Upcoming must be selected by default");
  await page.locator(".upcoming-match-card").filter({ hasText: "Australia" }).waitFor({ state: "attached" });
  await page.locator("#recent-match-history-title").waitFor();
  await page.locator("#player-matches-table tr").first().waitFor();
  assert(await page.locator(".recent-match-table thead th").count() >= 7, "Recent Matches should show runs, balls, dismissal, date and boundary columns");
  await page.locator("#match-tab-complete").click();
  await page.waitForURL(url => url.pathname === "/matches/complete/");
  assert.equal(await page.locator("#match-complete-panel").count(), 0, "Complete Match must live on its own dedicated page");
  assert.equal(await page.locator('link[href^="/matches/complete/complete.css"]').count(), 1, "Complete page must load its own CSS");
  assert.equal(await page.locator('script[src^="/matches/complete/complete.js"]').count(), 1, "Complete page must load its own JavaScript");
  await page.locator(".complete-match-card").first().waitFor();
  assert.equal(await page.locator(".complete-match-card").count(), 4, "Complete Match should show all indexed format rows");
  await page.locator("#match-format-filter").selectOption("First-class");
  assert.equal(await page.locator(".complete-match-card").count(), 1, "First-class filter should show only its own match");
  await page.locator(".complete-match-card").first().locator(".scorecard-open").click();
  await page.waitForURL(url => url.pathname === "/matches/scorecards/" && url.searchParams.get("match") === "fc-test");
  await page.locator("#scorecard-content .scorecard-table").first().waitFor();
  await page.locator("#scorecard-content .scorecard-table td").filter({ hasText: /^Tilak Varma$/ }).first().waitFor();
  assert.equal(await page.locator(".scorecard-innings").count(), 1, "Dedicated scorecard page should show innings details");
  assert.equal(await page.locator(".scorecard-deliveries").count(), 1, "Dedicated scorecard page should include ball-by-ball details");
  await page.close();
});

check("One Over updates available overs when format changes", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => {
    window.addEventListener("error", event => {
      console.error("[window-error-detail]", JSON.stringify({
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error && event.error.stack
      }));
    });
    window.__exportBlobUrl = "";
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__exportBlobUrl = originalCreateObjectURL(blob);
      window.__exportBlob = blob;
      return window.__exportBlobUrl;
    };
  });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(JSON.stringify({ name: error.name, message: error.message, stack: error.stack })));
  page.on("console", message => {
    if (message.type() === "error") {
      const location = message.location();
      pageErrors.push("console: " + message.text() + (location.url ? " @ " + location.url + ":" + location.lineNumber : ""));
    }
  });
  await page.goto(baseURL + "/death-overs/one-over/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#format-filter")?.options.length > 0 && document.querySelector("#over-filter")?.options.length > 0);
  const format = page.locator("#format-filter");
  const over = page.locator("#over-filter");
  const available = await format.locator("option").evaluateAll(options => options.map(option => option.value));
  if (available.includes("odi")) {
    await format.selectOption("odi");
    assert.equal(await over.locator("option").count(), 50, "ODI must expose overs 1–50");
    await over.selectOption("50");
    assert.equal(await over.inputValue(), "50");
  }
  if (available.includes("t20i")) {
    await format.selectOption("t20i");
    assert.equal(await over.locator("option").count(), 20, "T20I must expose overs 1–20");
    assert.notEqual(await over.inputValue(), "50", "Switching back to T20I must clamp the selected over");
  }
  await page.locator("#export-over-csv").waitFor({ state: "visible" });
  await page.locator("#export-over-csv").click({ force: true });
  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("CSV exported"));
  const exportDetails = await page.evaluate(async () => ({
    blobUrl: window.__exportBlobUrl,
    csv: window.__exportBlob ? await window.__exportBlob.text() : "",
    downloadName: document.querySelector("#export-over-csv")?.textContent
  }));
  assert.match(exportDetails.blobUrl, /^blob:/, "CSV export should create a downloadable Blob URL");
  assert.match(exportDetails.csv, /^\uFEFF?"Date","Format","Over"/, "CSV export should contain a valid header row");
  assert.match(exportDetails.csv, /"Batter","Batter Runs"/, "CSV export should include the batter and batter-runs columns");
  assert.deepEqual(pageErrors, [], "One Over should not throw uncaught browser errors: " + pageErrors.join(" | "));
  await page.close();
});

check("Death Overs All Overs filters and over-range calculator work", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => {
    window.addEventListener("error", event => {
      console.error("[window-error-detail]", JSON.stringify({
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error && event.error.stack
      }));
    });
  });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(JSON.stringify({ name: error.name, message: error.message, stack: error.stack })));
  page.on("console", message => {
    if (message.type() === "error") {
      const location = message.location();
      pageErrors.push("console: " + message.text() + (location.url ? " @ " + location.url + ":" + location.lineNumber : ""));
    }
  });
  await page.goto(baseURL + "/death-overs/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#feed-status")?.textContent === "STATS LOADED");
  const format = page.locator("#data-format");
  const year = page.locator("#year-filter");
  const first = page.locator("#first-over");
  const last = page.locator("#last-over");
  assert.equal(await format.locator("option").count() > 0, true, "All Overs should populate available formats");
  assert.equal(await year.locator("option").count() > 1, true, "All Overs should populate year filters");
  assert.equal(await first.locator("option").count() > 0, true, "All Overs should populate the first-over selector");
  assert.equal(await last.locator("option").count(), await first.locator("option").count(), "First and last over selectors should expose the same over range");
  const available = await format.locator("option").evaluateAll(options => options.map(option => option.value));
  if (available.includes("odi")) {
    await format.selectOption("odi");
    assert.equal(await first.locator("option").count(), 50, "ODI must expose overs 1–50");
    assert.equal(await last.locator("option").count(), 50, "ODI last-over selector must expose overs 1–50");
    await year.selectOption("all");
    await page.locator("#calculate").click();
    assert.equal(await page.locator("#over-breakdown .breakdown-card").count() > 0, true, "All Overs calculator should render breakdown cards");
  }
  if (available.includes("t20i")) {
    await format.selectOption("t20i");
    assert.equal(await first.locator("option").count(), 20, "T20I must expose overs 1–20");
    assert.equal(await last.locator("option").count(), 20, "T20I last-over selector must expose overs 1–20");
    await page.locator("#calculate").click();
  }
  assert.deepEqual(pageErrors, [], "All Overs should not throw uncaught browser errors: " + pageErrors.join(" | "));
  await page.close();
});

check("Death Overs page loads the saved dataset and matches its innings count", async () => {
  const data = JSON.parse(await readFile(new URL("../data/death-overs.json", import.meta.url), "utf8"));
  const manualData = JSON.parse(await readFile(new URL("../data/manual-t20i-match-overrides.json", import.meta.url), "utf8"));
  assert(Array.isArray(data.innings) && data.innings.length > 0, "Saved Death Overs innings must not be empty");
  assert(data.updatedAt, "Death Overs dataset should include its update timestamp");
  const knownKeys = new Set(data.innings.map((i) =>
    String(i.date || "") + "|" + String(i.opposition || "").toLowerCase()
  ));
  const extraManualRows = (manualData.matches || []).filter((m) => {
    const key = String(m.date || "") + "|" + String(m.opposition || "").toLowerCase();
    return String(m.format || "").toUpperCase() === "T20I" &&
      m.includeInAllOvers === true &&
      !knownKeys.has(key);
  }).length;
  const expected = Number(data.inningsFound || data.innings.length) + extraManualRows;
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(baseURL + "/death-overs/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#feed-status")?.textContent === "STATS LOADED");
  const displayed = Number((await page.locator("#total-innings").innerText()).replace(/,/g, ""));
  assert.equal(displayed, expected, "Displayed innings count must match saved innings plus unique eligible manual T20I records");
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

check("New Zealand official T20I squad renders in Full Match Details", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12000);
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(
    baseURL + "/matches/details/?date=2026-10-24&match=2nd%20T20I&opponent=New%20Zealand&matchId=242109",
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(() => {
    const heading = document.querySelector("#squad-opponent-heading")?.textContent || "";
    const list = document.querySelector("#squad-opponent-list")?.textContent || "";
    return /New Zealand/i.test(heading) && /Mitchell Santner/i.test(list);
  });
  assert.match(await page.locator("#squad-opponent-list").innerText(), /Mitchell Santner/);
  assert.equal(await page.locator("#squad-opponent-list .details-player-row").count(), 16,
    "Official New Zealand T20I squad should render all 16 announced players");
  assert.deepEqual(pageErrors, [], "Match Details page errors: " + pageErrors.join(" | "));
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

check("Admin Studio mobile bottom navigation switches sections and desktop sidebar stays separate", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await page.route("**/api/admin/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith("/session")) return route.fulfill({ json: { authenticated: true } });
    if (url.pathname.endsWith("/content")) return route.fulfill({ json: url.searchParams.get("kind") === "media" ? { items: [], albums: [] } : { feedUrl: "" } });
    if (url.pathname.endsWith("/data-editor") && req.method() === "GET") return route.fulfill({ json: { kind: "stats", path: "data/site-data.json", data: {} } });
    return route.fulfill({ json: { ok: true, items: [], runs: [], datasets: [] } });
  });
  await page.goto(baseURL + "/admin/index.html", { waitUntil: "domcontentloaded" });
  const mobileNav = page.locator("#admin-mobile-bottom-nav");
  await mobileNav.waitFor({ state: "visible" });
  assert.equal(await mobileNav.locator("a[data-view]").count(), await page.locator("#admin-nav a[data-view]").count(),
    "Mobile nav should expose every desktop section");
  await mobileNav.locator("a[data-view='news']").click();
  await page.waitForFunction(() => location.hash === "#news");
  await page.waitForFunction(() => document.querySelector("#admin-mobile-bottom-nav a[data-view='news']")?.classList.contains("active"));
  assert.equal(await page.locator("#admin-mobile-bottom-nav a[data-view='news']").getAttribute("aria-current"), "page");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector("#admin-mobile-bottom-nav")).display === "none");
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
