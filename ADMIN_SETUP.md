# Admin Studio setup

The private admin page is served at `/admin/`. Password validation, session signing, and Cloudinary upload signatures run in Cloudflare Pages Functions; the password is not embedded in frontend code.

## Required Cloudflare Pages production secrets

Open **Cloudflare Dashboard → Workers & Pages → tilakvarmafc → Settings → Variables and Secrets**. Add these under **Production**:

- `ADMIN_PASSWORD` — the admin password you chose (secret text).
- `ADMIN_SESSION_SECRET` — a long random secret (secret text; do not reuse the password).
- `GITHUB_TOKEN` — a fine-grained GitHub token with **Contents: Read and write** access only to `nitishratre45/tilakvarmafanclub` (secret text). This lets the admin save gallery and video-feed settings to `data/admin-media.json` and `data/video-config.json`.
- `CLOUDINARY_CLOUD_NAME` — `wad76b1f`.
- `CLOUDINARY_API_KEY` — from Cloudinary Console → Settings → API Keys (secret text).
- `CLOUDINARY_API_SECRET` — from Cloudinary Console → Settings → API Keys (secret text).

Do not commit these values to GitHub, and do not add them to HTML, JavaScript, JSON, or this document. The Cloudinary account is connected for asset management, but the Cloudinary API secret and a GitHub write token are not exposed by those integrations; they must be configured as runtime secrets.

After saving variables, trigger a new production deployment (a new commit to `main` also triggers the connected Pages deployment). The Functions environment only receives variables after deployment.

## Admin features

- Sign in at `https://tilakvarmafc.pages.dev/admin/`.
- Upload image/video assets to Cloudinary with a server-signed request.
- Save or remove media from the public Photos & News gallery (removing an entry does not delete its Cloudinary asset).
- Configure an HTTPS JSON video-feed URL. The feed host must permit browser CORS requests and return a `videos` array. Supported fields include `id`, `title`, `playbackUrl`, `thumbnailUrl`, `publishedDate`, `year`, and `format`.

## Data freshness and limitations

The ESPNcricinfo Statsguru refresh workflow runs daily and preserves the last verified snapshot if a source request or parser fails. The legacy Statsguru endpoint currently errors for List A and does not return recognizable First-Class tables in the latest saved run. Do not label fallback or incomplete data as ESPNcricinfo data; domestic match-by-match rows must be sourced and validated before being published. BCCI player-photo refresh remains a separate scheduled workflow.
