# Tilak Varma — SMAT ball-by-ball archive

This collector uses the three BCCI competition result IDs supplied for SMAT seasons starting in 2022, 2023 and 2024.

## Run locally

```bash
python -m pip install requests
python "SMAT/tilak_ball_by_ball.py"
```

If BCCI's enhanced commentary endpoint requires an active `edak` header, set the environment variable `BCCI_EDAK` before running. GitHub Actions reads it from the repository secret named `BCCI_EDAK`; do not hard-code a token in the script.

## Output layout

- `data/results/`: raw paginated BCCI match-result responses.
- `data/scorecards/`: scorecard responses downloaded for auditing.
- `data/commentary/`: raw enhanced commentary JSON per Tilak match.
- `data/tilak_balls/`: extracted Tilak batter events per match (best-effort until the live commentary schema is validated).
- `data/reports/tilak_smat_summary.json`: aggregate batting summary and innings rows.
- `data/reports/collection_audit.json`: result-page, scorecard and commentary failures.

## Coverage and accuracy

The collector saves source responses and reports failures separately. It does not treat unavailable data as zero. BCCI's scorecard and commentary JSON schemas can vary; inspect the raw JSON and audit report before treating derived totals as complete. The current extraction is deliberately conservative and must be validated against at least one known Tilak innings before using the summary as an official career record. The average is not calculated until dismissals/not-outs are normalized reliably.
