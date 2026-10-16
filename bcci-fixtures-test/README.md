# BCCI Matches

This folder contains the separate BCCI-backed **Upcoming Match** and **Complete Match** views used by the Tilak Varma Fan Club website.

- Upcoming fixtures: `bcci-fixtures.json`
- Completed match archive: uses the existing production scorecard index at `/matches/scorecards/index.json`
- Fixture refresh: `.github/workflows/refresh-custom-bcci-fixtures.yml`

The old BCCI test-only Live Scores and Results pages, their JSON/Python fetchers, and their dedicated results workflow have been removed. The production `matches/` data and production live/results workflows are intentionally untouched.

Upcoming fixtures are filtered to exclude matches already live or completed. The page's live-aware refresh indicator must remain paused when no live match is detected; it must not create a fake live state.
