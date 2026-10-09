# Deployment

## Cloudflare Pages
- Framework: None (static HTML/CSS/JavaScript)
- Build command: leave blank
- Build output directory: `/` (repository root)
- Production branch: `main`
- Entry page: `index.html`

## Data workflow
The GitHub Actions workflow runs twice daily (UTC) and can also be run manually from the Actions tab. It refreshes recent innings from Cricsheet where the player appears. Career snapshot figures in `data/site-data.json` are deliberately not automatically rewritten; verify those against official scorecards.

## Verify after deployment
1. Open the Pages URL and check Stats and Recent innings sections.
2. Check browser console/network if `data/site-data.json` does not load.
3. Check Actions for the latest refresh result.
4. Confirm the deployed commit in Cloudflare Pages.

This is an independent fan project and is not affiliated with the player, BCCI, IPL, or a team.
