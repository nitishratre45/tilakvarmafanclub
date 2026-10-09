# Deployment

## Cloudflare Pages
- Framework: None (static HTML/CSS/JavaScript)
- Build command: leave blank
- Build output directory: repository root (`/`)
- Production branch: `main`
- Entry page: `index.html`

## Automated data refresh
GitHub Actions runs the repository-managed refresh jobs on schedules (UTC), and each job can also be started manually from the Actions tab:

- Recent innings, player profile, and news: every 12 hours.
- ESPNcricinfo Statsguru batting and bowling snapshots: daily.
- Death-overs archive data: every 12 hours.
- Official ICC rankings and record highlights: daily.

Jobs that update `data/site-data.json` share one concurrency group and retry publishing if another repository update lands first. Refresh scripts preserve existing verified snapshots when a source is unavailable; missing stats must not be guessed. A successful workflow means the saved data passed that workflow's validation, not that every external source necessarily exposes every format.

## Verify after deployment
1. Open the Pages URL and check the Stats, Bowling, Recent Innings, and Death Overs sections.
2. Check the browser console and network panel if a JSON file fails to load.
3. Check GitHub Actions for the latest refresh result and inspect the saved `updatedAt` / status fields.
4. Confirm the deployed commit in Cloudflare Pages.

This is an independent fan project and is not affiliated with the player, BCCI, IPL, or a team.
