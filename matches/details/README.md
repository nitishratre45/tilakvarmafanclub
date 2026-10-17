# Match Details data workflow

## Current source of truth
- Fixture schedule, opponent, venue, date and time: `/matches/upcoming-fixtures-refresh.json`.
- That snapshot is produced by the existing News/BCCI fixture pipeline. Do not duplicate or manually overwrite the schedule in this folder.
- Optional reviewed pre-match information: `/matches/details/data/match-details.json`.
- Weather forecast: Open-Meteo's public geocoding and forecast endpoints; forecasts are shown only when the requested match date is inside the provider's forecast range.

## Add a verified squad or preview
Add an object to `matches` in `data/match-details.json` using the same `date`, `match`, and `opponent` strings as the fixture snapshot. Example:

```json
{
  "date": "YYYY-MM-DD",
  "match": "Match name exactly as listed",
  "opponent": "Opponent exactly as listed",
  "series": "Series name",
  "format": "T20I",
  "squads": {
    "India": [
      { "name": "Player name", "role": "Role", "battingStyle": "Style", "bowlingStyle": "Style" }
    ],
    "Opponent": []
  },
  "playingXIStatus": "Squad announced; playing XI not confirmed",
  "pitchReport": "Verified pitch report plus source",
  "tossReport": "Pre-match context only",
  "groundReport": "Verified venue note",
  "tilakPreview": "Verified recent form note",
  "headToHead": "Verified head-to-head summary",
  "recentForm": "Verified recent results summary"
}
```

Only publish names or figures supported by a credible source. Keep the list empty when squads have not been announced; never label a probable XI as confirmed. Add source links to the fixture data where possible.

## What updates automatically
1. The page reads the latest saved fixture snapshot when opened.
2. Countdown is calculated in the visitor's browser.
3. Weather is requested from Open-Meteo; the page gracefully explains when the date is outside the forecast window or the service is unavailable.
4. Source/status workflow cards display which parts are available.

## Limitations
Squads, playing XI, pitch reports, head-to-head and recent form are not guaranteed to be provided by the existing free fixture feed. They are intentionally not fabricated. The site does not need a paid API key for the current fixture snapshot or weather feature.
