# DATA DETAILS — Stats / Explore Section

> Purpose: explain how the Stats section gets its data, how the Explore screen displays it, how scheduled updates work, and what happens when a refresh fails.
>
> **Scope:** this is documentation only. No existing application, data, CSS, JavaScript, workflow, or configuration file is changed by this note.

## 1. Quick overview

The Stats area is a browser-side dashboard. It does not calculate a player's career from scratch every time a visitor opens the page. Instead, the website reads a saved JSON snapshot, then JavaScript selects the requested format/category, applies filters, and renders metric cards and tables.

The main path is:

```text
Cricket data source(s)
       |
       v
GitHub Actions / refresh workflow
       |
       v
Python data-refresh script(s)
       |
       v
Validate and update data/site-data.json
       |
       v
Commit updated JSON to GitHub
       |
       v
Cloudflare Pages serves the website + JSON
       |
       v
assets/statsguru.js reads the snapshot
       |
       v
Format + category + filters
       |
       v
Career summary cards and tables in Stats / Explore
```

The browser uses the **last saved snapshot**. A visitor opening the page does not need to trigger a new ESPNcricinfo/Cricsheet scrape.

## 2. Main files and what each one does

| File | Responsibility |
|---|---|
| `index.html` | Contains the Stats/Explore interface, its controls and table containers, and loads `assets/statsguru.js`. |
| `assets/statsguru.js` | Browser-side rendering and interaction logic: reads the saved data, switches formats/categories, builds summary cards and tables, and applies filters. |
| `data/site-data.json` | The saved data snapshot consumed by the website. It contains several site datasets; Stats-related data is stored under keys such as `statsguru`, `bowlingStats`, and `fieldingStats`. |
| `scripts/refresh_ipl_explorer.py` | Builds the IPL Explore dataset from Cricsheet's IPL ball-by-ball JSON archive and writes it into the IPL entry inside `data/site-data.json`. |
| `assets/section-tabs.js` | Handles page-section/tab visibility. It is separate from the code that calculates the Stats figures. |
| `assets/premium-ui.css` and `assets/style.css` | Visual layout and responsive styling; CSS changes presentation, not the underlying cricket statistics. |

**Important distinction:** `site-data.json` is a shared site data file. Updating a specific Stats dataset must preserve its other top-level properties, because other parts of the website also read this file.

## 3. Where the data comes from

### A. Explore batting/career data

- The saved `statsguru` object in `data/site-data.json` contains the format-specific Explore snapshots.
- The source metadata identifies ESPNcricinfo Statsguru as a source for the saved Statsguru data.
- The visible interface can show formats that have saved, verified data. An absent dataset should appear as unavailable/empty; the UI should not invent figures to fill gaps.
- Format entries can contain a career `summary`, `innings`, and `careerBreakdown`. These serve different parts of the screen:
  - **summary:** totals such as matches, innings, runs, average, strike rate, 50s/100s, fours and sixes.
  - **innings:** individual batting rows used by the innings/match list and date/ground/opposition filtering.
  - **careerBreakdown:** grouped totals used by filters such as opposition, year, season, result, batting position and series, where those groups exist in the saved dataset.

### B. IPL Explore data

The dedicated script is `scripts/refresh_ipl_explorer.py`.

1. It reads the existing `data/site-data.json` snapshot.
2. It downloads the Cricsheet IPL JSON archive from `https://cricsheet.org/downloads/ipl_json.zip`.
3. It opens the match JSON files and finds innings in which the batter is named **Tilak Varma**.
4. It calculates innings-level runs, balls, fours, sixes, strike rate, dismissal/not-out state, opposition, venue, season, and a best-effort batting position.
5. It aggregates the innings into a career summary and grouped breakdowns by season, opposition and batting position.
6. It writes the result into `statsguru.formats.IPL` in `data/site-data.json` and records an update timestamp/status.

**Data-quality safeguards in the script:**
- If no Tilak Varma IPL innings are found, the script exits instead of replacing the saved snapshot with an empty result.
- If the incoming innings count is lower than the currently saved IPL innings count, the script stops and preserves the larger existing snapshot.
- Individual unreadable match files are skipped and reported.
- Batting position is inferred from the order batters first appear in the delivery list; Cricsheet does not supply an explicit batting-position field in this script.
- The coverage note warns that only matches present in the available archive can be counted. Missing archive matches are not guessed.

### C. Bowling and fielding

Bowling and fielding are stored separately from the main batting `statsguru` object:

- `bowlingStats.formats`
- `fieldingStats.formats`

The browser code reads these datasets independently. Therefore, a missing bowling/fielding format should not be interpreted as zero performance; it means there is no saved verified dataset available for that view. The UI is designed to show an unavailable state rather than manufacture values.

## 4. How the page displays the saved data

When a visitor opens the Stats/Explore area:

1. The HTML provides the selectors, summary container, table header/body, status/note areas and other required elements.
2. `assets/statsguru.js` loads and works with the saved data snapshot available to the page.
3. The selected format determines which `statsguru.formats[FORMAT]` entry is used. The “All” view combines available format snapshots; it does not create missing source rows.
4. The selected category decides which data to render: batting summary/list, high scores, series breakdown, bowling or fielding views.
5. Summary cards are generated from the selected summary. Table rows are generated from the saved innings/breakdown arrays.
6. The filter controls derive their available values from the data currently selected. Depending on the filter, the page narrows grouped breakdown rows and/or innings rows.
7. When no verified rows match, the table displays an empty-state message rather than invented data.

### Filter behavior in plain language

- **Format:** selects which saved format's snapshot is being viewed.
- **Category:** chooses the type of statistics or list.
- **Breakdown filter:** filters by a supported group such as opposition, year, season, result, position or series, if the selected dataset contains those groups.
- **Ground:** filters innings rows using the saved venue/ground field.
- **From / To dates:** narrows the innings list to dates within the selected range.
- **Apply:** validates the selected filter/date inputs before committing them as the active filter state.

A filter can only return detail that actually exists in the saved snapshot. If a source did not provide a field or group, the browser cannot recover it merely by changing a selector.

## 5. Automatic update lifecycle

For a scheduled refresh, the general lifecycle is:

1. **Schedule starts a GitHub Actions run.** A manual workflow run may also be available if the workflow supports it.
2. **The Python refresh script fetches the source.**
3. **The script parses and aggregates the raw records.**
4. **Validation/safety checks run.** Empty or suspiciously smaller IPL data must not replace the last valid saved snapshot.
5. **The JSON snapshot is written and committed** when the workflow succeeds.
6. **Cloudflare Pages deploys the repository's committed site files.**
7. **The next page load reads the latest deployed JSON.** Existing visitors may need a reload to see a newly deployed snapshot.

### Refresh intervals

- **IPL Explore:** the intended refresh interval is **20 hours**. The refresh process checks whether enough time has passed since the last successful update; a scheduled check is not the same thing as a successful data refresh.
- **Other saved Statsguru / career datasets:** these use their own refresh workflow and schedule; do not assume that the IPL refresh automatically refreshes every other Stats, bowling, fielding, profile or match dataset.
- The timestamp in the saved data indicates when that dataset was last updated. A workflow run timestamp by itself does not prove the data was updated successfully.

If a refresh fails, the old snapshot should remain available. “Workflow ran” and “data changed successfully” are two different states.

## 6. Status and timestamp fields

The saved JSON contains status/timestamp fields for troubleshooting. Examples currently present in the Stats-related structure include:

- `statsguru.updatedAt`
- `statsguru.lastAttemptAt`
- `statsguru.lastAttemptStatus`
- `statsguru.lastAttemptErrors`
- `statsguru.lastAttemptWarnings`
- `statsguru.iplUpdatedAt`
- `statsguru.iplLastAttemptStatus`
- `statsguru.iplLastAttemptError`
- `bowlingStats.updatedAt` and its attempt/status fields
- `fieldingStats.updatedAt` and its attempt/status fields

These fields describe different things. In particular, **last attempt** may be newer than **last successful data update**. If the latest attempt fails, the last successful snapshot timestamp should remain the useful indicator of the data actually displayed.

## 7. What a successful update should look like

Use this checklist when diagnosing stale or missing Explore figures:

- [ ] The relevant GitHub Actions workflow completed successfully.
- [ ] The log shows that the expected source was downloaded and parsed.
- [ ] The log reports a non-zero set of relevant Tilak Varma records/innings.
- [ ] `data/site-data.json` has the expected format key and a non-empty innings list.
- [ ] Summary totals and innings count agree with the saved rows for that dataset.
- [ ] The dataset's successful-update timestamp advanced.
- [ ] The updated JSON was committed to the repository and deployed by Cloudflare Pages.
- [ ] Reloading the live page shows the updated timestamp/data.

If any step fails, diagnose that stage before changing front-end CSS or unrelated site code.

## 8. Common issues and what they usually mean

| Symptom | Likely stage to inspect |
|---|---|
| Explore shows old figures after a match | Source archive/snapshot refresh, workflow schedule, commit/deployment, then browser cache. |
| Workflow ran but timestamp did not move | The run may have been a check, a failed attempt, or a no-op rather than a successful data update. |
| IPL data disappears or becomes smaller | Check script validation and the workflow log. The IPL script contains guards intended to preserve a larger valid snapshot. |
| One format is empty but others work | Inspect that format's key inside `statsguru.formats`; the format may not have a verified saved dataset. |
| Bowling/fielding is missing | Inspect `bowlingStats.formats` / `fieldingStats.formats`, not just the batting `statsguru.formats` object. |
| Filter option is missing | Check whether the selected format's `careerBreakdown` or innings rows actually contain the field/group needed by that filter. |
| Numbers look plausible but don't match an official scorecard | Compare the underlying innings rows with the source. Do not patch totals manually without validating the raw rows and calculation rules. |

## 9. Important limitations

- This is a static-site architecture: the browser renders saved data; it is not a live score API.
- The website can only display records that were successfully collected, parsed, saved and deployed.
- Source coverage may lag behind the latest match. A 20-hour schedule is a refresh cadence, not a guarantee that a source has published every new match.
- IPL batting position is inferred by the current IPL script and should be treated as derived data.
- An empty or unavailable field must not be silently converted into a real statistic.
- Do not replace `data/site-data.json` with a partial object. Preserve all unrelated top-level keys and datasets when changing any one Stats feed.
- Do not edit the Stats rendering code to fix a source/workflow failure; identify the failing stage first.

## 10. Safe troubleshooting order

When Explore is stale or incorrect, inspect in this order:

1. GitHub Actions run and error log.
2. The source fetch/parse step.
3. The appropriate Python refresh script and its validation guards.
4. The relevant data path in `data/site-data.json`.
5. Last successful timestamp versus last attempt status.
6. Commit and Cloudflare Pages deployment.
7. Only then inspect `assets/statsguru.js`, HTML IDs and browser-side filtering.
8. Inspect CSS only when the data is correct but the presentation/layout is wrong.

**Do not start by changing unrelated sections, deleting existing rows, or regenerating the entire JSON file.**


---

# 11. Stats → Batting Overview: exact data flow

This section documents the **Batting** tab under `#stats` (the career snapshot cards and format-wise cards). It is separate from the **Explore** view rendered by `assets/statsguru.js`.

## A. Page structure and renderers

| UI area | HTML container / selector | Renderer | JSON path |
|---|---|---|---|
| Main T20I summary cards | `#stats-overview .stats-grid` and `[data-stat]` | `assets/app.js` | `careerStats` |
| Format-wise cards | `#career-formats` | `assets/career-formats.js` | `careerFormats` |
| Data status and timestamp | `#data-status`, `#career-updated` | `assets/app.js` | `lastChecked`, `lastUpdated`, `lastRefreshStatus`, `careerStatsUpdated`, `statsguru.updatedAt` |
| Tab visibility | Stats tab buttons / `#stats-overview` | `assets/section-tabs.js` | No cricket data calculation |
| Styling | `#stats #stats-overview` | `assets/premium-ui.css` and `assets/style.css` | No cricket data calculation |

## B. Main T20I summary cards

The HTML defines six cards with `data-stat` keys:

- `t20iRuns`
- `highestScore`
- `average`
- `strikeRate`
- `fifties`
- `hundreds`

When `assets/app.js` successfully fetches `data/site-data.json`, it reads `data.careerStats`, loops over each `[data-stat]` element, and replaces the card text when the matching key exists. If the key is missing, the HTML's initial text remains visible.

**Important fallback detail:** initial HTML text is only a loading/fallback value, not the authoritative source. For example, if HTML says `FIFTIES = 6` but JSON says `careerStats.fifties = 10`, the browser should replace the visible value with 10 after the JSON request succeeds. If the request fails, the fallback may remain, which can look like a real value even though it wasn't loaded. When diagnosing a suspicious number, inspect the JSON and network/load status before editing the card text.

## C. Format-wise career cards

`assets/career-formats.js` independently fetches the same `data/site-data.json` file and renders `data.careerFormats` into `#career-formats`.

Each available format entry can supply:

- `matches`, `innings`, `notOuts`
- `runs`, `highestScore`, `average`, `strikeRate`
- `fours`, `sixes`, `fifties`, `hundreds`, `balls`
- `source` and, where provided, `updatedAt`

The renderer escapes text fields before inserting them into HTML. Missing fields are displayed as an em dash rather than calculated or invented. It renders the format entries that exist; it does not infer a missing format from another format.

Current format keys in the saved snapshot include `ODI`, `T20I`, `First-class`, `List A`, `IPL`, and `Overall T20 (all competitions)`. The data sources and timestamps are not necessarily identical for every format. Check each entry's own `source` / `updatedAt` metadata rather than assuming all formats updated together.

## D. Batting overview flow diagram

```text
Career-stat refresh workflow(s)
        |
        v
Source-specific parser / validation
        |
        v
data/site-data.json
  ├─ careerStats       -> six main T20I cards
  └─ careerFormats     -> format-wise cards
        |
        ├─ assets/app.js
        |    └─ sets [data-stat] values and status text
        |
        └─ assets/career-formats.js
             └─ renders each available format card
        |
        v
Stats → Batting UI
```

The page itself does not scrape scorecards or recompute career totals on each visit. It renders the most recently saved JSON snapshot served by the deployed site.

## E. Update responsibilities and what not to confuse

- `scripts/refresh_data.py` maintains profile metadata and checks recent T20I innings from Cricsheet. Its comments explicitly say career totals are refreshed separately from ESPNcricinfo and preserved when that source is unavailable. Do **not** assume running this script alone refreshes every batting-overview total.
- The main career totals are stored under `careerStats`; format cards are stored under `careerFormats`. These are distinct from Explore's `statsguru.formats` structure and from `bowlingStats` / `fieldingStats`.
- The IPL Explore refresh script writes to `statsguru.formats.IPL`; that does not automatically mean the top-level `careerFormats.IPL` card was refreshed too. Check both data paths if the overview and Explore show different IPL totals.
- CSS changes in `assets/premium-ui.css` only change presentation. They must not modify numbers, update timestamps, JSON keys, or source data.
- A cache-busting query string on the stylesheet affects CSS delivery only; it does not refresh the saved cricket data.

## F. Status text caveat

`assets/app.js` derives `#data-status` mainly from the presence of `recentInnings`, `lastChecked` / `lastUpdated`, and `lastRefreshStatus`. That status is **not a dedicated validation result for every field in `careerStats` or every entry in `careerFormats`**. Likewise, `#career-updated` chooses the latest parseable timestamp from `careerStatsUpdated`, `statsguru.updatedAt`, and `lastUpdated`; this displayed time may not be the individual format's own last-update time.

For exact freshness, inspect:
1. `careerStatsUpdated` for the main career summary;
2. the relevant `careerFormats[FORMAT].updatedAt`, when present, for the format card;
3. the relevant refresh workflow's run log and commit;
4. the deployed `data/site-data.json` snapshot.

A workflow run alone is not proof that the displayed totals changed or that every format refreshed successfully.

## G. Batting overview troubleshooting checklist

- [ ] Open the deployed `data/site-data.json` and inspect `careerStats`.
- [ ] Confirm the six `careerStats` keys match the values expected in the main cards.
- [ ] Inspect `careerFormats` separately and confirm each format's totals/source.
- [ ] Compare any stale format card with its individual `updatedAt` and the relevant workflow log.
- [ ] Confirm the workflow committed the JSON change and Cloudflare Pages deployed that commit.
- [ ] Reload the site and check that the JSON request succeeds.
- [ ] Only if JSON is correct but UI is wrong, inspect `assets/app.js`, `assets/career-formats.js`, and the HTML IDs.
- [ ] Only if values are correct but the cards look wrong, inspect the scoped CSS under `#stats #stats-overview`.

Never change a displayed number by hard-coding it into HTML to conceal a stale or failed data feed. Fix the source/refresh path or the renderer, and preserve all unrelated JSON datasets.
