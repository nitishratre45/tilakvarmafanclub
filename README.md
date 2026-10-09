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
