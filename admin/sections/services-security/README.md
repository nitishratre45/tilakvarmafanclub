# Services & Security

- Admin view ID: `services`
- Section owner folder: `admin/sections/services-security/`
- Current integration: `Service and security controls currently initialize through ../assets/admin-core.js.`

This folder establishes a clear home for section-specific UI logic and styles. Existing features are kept connected to the shared Admin Studio entry point during the safe refactor; do not duplicate handlers or detach DOM IDs without updating the shared router and regression checks.
