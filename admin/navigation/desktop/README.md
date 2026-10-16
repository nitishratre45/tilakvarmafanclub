# Admin Desktop Navigation

Desktop sidebar navigation is rendered by `admin/index.html` and styled by `admin/assets/admin.css`.

- Desktop-only sidebar: `.sidebar` and `#admin-nav`
- Keep this navigation hidden on mobile using the responsive rules in `admin/assets/admin.css`.
- Do not duplicate mobile bottom-navigation behavior here.

This folder documents the desktop navigation boundary. The live markup remains in `admin/index.html` until it can be extracted without breaking existing selectors.