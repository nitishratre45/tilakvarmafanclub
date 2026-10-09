# Tilak Varma Fan Club — The 72 Club

A responsive static fan website celebrating Tilak Varma, built with HTML, CSS and vanilla JavaScript for Cloudflare Pages.

## Included
- Responsive landing page and stats dashboard
- Recent innings table backed by `data/site-data.json`
- Scheduled GitHub Actions refresh for recent innings from Cricsheet
- Data maintenance guide in `admin/`

## Run locally
Serve the repository root with any static HTTP server, for example `python -m http.server 8000`.

## Deployment
See [DEPLOYMENT.md](DEPLOYMENT.md). Configure Cloudflare Pages with branch `main`, no build command, and repository root as output.

## Data accuracy
Career stats are a manually maintained snapshot, not a live official feed. Verify before posting. Recent innings update only when the scheduled source refresh succeeds and matching player records are present.

## Disclaimer
Independent fan-made project; not affiliated with Tilak Varma, BCCI, IPL, or any team.

## Admin Studio

Open `/admin/` on the deployed site. Create a GitHub fine-grained personal access token restricted to this repository and grant **Contents: Read and write**. The admin page loads and saves `data/site-data.json` and `data/death-overs.json` through the GitHub Contents API. The token is not saved to local storage; clear it and close the tab when finished. Saving commits to `main`, which should trigger a Cloudflare Pages deployment.

The editor is intentionally token-gated rather than pretending that a public static page is private. Anyone can see the admin page, but writing requires a repository-scoped token. Never paste a classic broad-scope token or put secrets into JSON.

## Match data and activity feed

The homepage shows a verified latest-match card and the editable `activityLog` from `data/site-data.json`. Admin saves to the site data file automatically add an activity entry. The latest 9 October 2026 India–West Indies scorecard (Tilak Varma 44 not out from 18 balls) is also shown on the Stats Centre. That match summary is deliberately excluded from over-range calculations until player-specific delivery data can be verified; do not infer over-level numbers from the innings total.

