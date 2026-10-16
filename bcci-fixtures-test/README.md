# BCCI Fixtures Test Data

This folder is kept separate from the production `matches/` data.

The custom BCCI fixtures test workflow writes its fetched JSON snapshot to:

- `bcci-fixtures-test/bcci-fixtures.json`

Run the **Refresh Custom BCCI Fixtures** workflow from GitHub Actions to populate or refresh the JSON file.

## Results archive

- `results/index.html` is the completed-match results page.
- `results/results.json` stores completed matches, deduplicated by BCCI `gid`.
- `fetch_bcci_fixtures.py` refreshes the fixtures snapshot and attempts to archive completed matches; `results/fetch_results.py` is the dedicated historical-results refresher.
- Everything remains inside this folder; production `matches/` data and the main website are not changed.
