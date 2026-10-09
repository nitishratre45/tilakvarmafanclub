# Tilak Varma 72 FC

A fresh fan-made website for Tilak Varma. The site is independent and not affiliated with BCCI, ICC, Mumbai Indians, or Tilak Varma.

## Features
- Responsive fan page with ICC-sourced profile image and source-linked photo gallery.
- Career-stat snapshot with explicit source link; verify latest figures at the linked official source.
- Recent T20I innings processed from Cricsheet public ball-by-ball data by Python.
- GitHub Actions workflow to refresh recent-innings data roughly twice per day.
- Static data editor at `/admin/`; it downloads a JSON file for a manual GitHub commit and is not a password-protected server admin.

## Sources
- ICC player profile: https://www.icc-cricket.com/rankings/70761/tilak-varma
- BCCI player profile: https://www.bcci.tv/international/men/players/tilak-verma/993
- Cricsheet: https://cricsheet.org/
- Gallery photos link back to publisher pages. Check the respective publisher for reuse/licensing requirements.

## Deployment
Cloudflare Pages project name: `tilakvarma72fc`. Production address: `https://tilakvarma72fc.pages.dev` once deployment succeeds. Build command: none. Build output: `/` (repository root).