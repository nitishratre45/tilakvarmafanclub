# Gallery Updates

- Admin view ID: `gallery-updates`
- Section owner folder: `admin/sections/gallery-updates/`
- Current integration: `Gallery refresh and album management currently initialize through ../assets/admin-core.js.`

This folder establishes a clear home for section-specific UI logic and styles. Existing features are kept connected to the shared Admin Studio entry point during the safe refactor; do not duplicate handlers or detach DOM IDs without updating the shared router and regression checks.
