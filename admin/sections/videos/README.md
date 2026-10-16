# Video Feed

- Admin view ID: `video`
- Section owner folder: `admin/sections/videos/`
- Current integration: `Video feed settings currently initialize through ../assets/admin-core.js.`

This folder establishes a clear home for section-specific UI logic and styles. Existing features are kept connected to the shared Admin Studio entry point during the safe refactor; do not duplicate handlers or detach DOM IDs without updating the shared router and regression checks.
