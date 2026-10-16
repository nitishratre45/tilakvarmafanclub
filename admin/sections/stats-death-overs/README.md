# Stats & Death Overs

- Admin view ID: `data-editor`
- Section owner folder: `admin/sections/stats-death-overs/`
- Current integration: `Stats/death-overs editor currently initializes through ../assets/admin-core.js.`

This folder establishes a clear home for section-specific UI logic and styles. Existing features are kept connected to the shared Admin Studio entry point during the safe refactor; do not duplicate handlers or detach DOM IDs without updating the shared router and regression checks.
