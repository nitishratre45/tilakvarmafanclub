# Tilak Varma Fan Club — The 72 Club

A responsive static fan website celebrating Tilak Varma, built with HTML, CSS and vanilla JavaScript for Cloudflare Pages.

## Included
- Responsive landing page and stats dashboard
- Recent innings table backed by `data/site-data.json`
- Scheduled GitHub Actions refresh for recent innings from Cricsheet
- Automated, source-verified data refresh through GitHub Actions

## Run locally
Serve the repository root with any static HTTP server, for example `python -m http.server 8000`.

## Deployment
See [DEPLOYMENT.md](DEPLOYMENT.md). Configure Cloudflare Pages with branch `main`, no build command, and repository root as output.

## Data accuracy
Career and match statistics are sourced from ESPNcricinfo/Statsguru where the public data is available. ICC is used for official ICC rankings/records only. Saved snapshots can lag behind live scorecards; missing values are not guessed. Recent innings update only when the scheduled source refresh succeeds and matching player records are present.

## Disclaimer
Independent fan-made project; not affiliated with Tilak Varma, BCCI, IPL, or any team.

## Match data and activity feed

The homepage shows a verified latest-match card and the editable `activityLog` from `data/site-data.json`. Admin saves to the site data file automatically add an activity entry. The latest 9 October 2026 India–West Indies scorecard (Tilak Varma 44 not out from 18 balls) is also shown on the Stats Centre. That match summary is deliberately excluded from over-range calculations until player-specific delivery data can be verified; do not infer over-level numbers from the innings total.



## India-theme feature modules

- **Stats Explorer:** filters available recent innings by format/opposition and plots scored innings.
- **Records & Milestones:** calculates arithmetic progress to stored-stat targets; not a prediction.
- **Performance Analytics:** summarizes the available numeric innings and does not infer missing scorecard fields.
- **Fan Zone & Poll:** poll prompt/options and official/editorial links are editable in `data/fan-zone.json` by editing `data/fan-zone.json` and committing the change. Poll counts are browser-local, not shared across visitors; a shared live tally needs a server-side vote store and spam controls.
- **Wallpaper & Poster Maker:** generates a 1080 × 1350 PNG using a canvas and editable text/theme. It is an original fan graphic and does not copy player photos.
- **Website-wide Search:** searches page sections, stored innings, format snapshots, activity entries and fan resources.
- **Auto updates:** the existing GitHub Actions workflow checks public sources on a 12-hour schedule and preserves prior verified data when feeds are stale or unavailable. This is not a live-score feed; no fake live scores are displayed.

The site remains a static Cloudflare Pages project. Content and verified snapshots are maintained in the repository and refreshed by scheduled GitHub Actions. The poll is deliberately browser-local until a secure shared backend is configured.
