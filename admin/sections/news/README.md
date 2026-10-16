# News Manager

- Admin view ID: `news`
- Section owner folder: `admin/sections/news/`
- Current integration: `News pipeline helper is in news-pipeline-manager.js; shared admin routing remains in ../../assets/admin-core.js.`

This folder establishes a clear home for section-specific UI logic and styles. Existing features are kept connected to the shared Admin Studio entry point during the safe refactor; do not duplicate handlers or detach DOM IDs without updating the shared router and regression checks.
