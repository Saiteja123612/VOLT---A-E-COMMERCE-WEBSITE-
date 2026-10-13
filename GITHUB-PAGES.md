# Publishing the VOLT preview

GitHub Pages and Vercel publish the generated `github-pages/` directory only. The editable frontend is `public/`; the backend stays at the repository root.

## Automatic publishing

- GitHub Pages: `.github/workflows/pages.yml` checks source privacy, runs tests, builds the preview, and uploads only `github-pages/`. Repository Settings → Pages must use **GitHub Actions** as its source.
- Vercel: `vercel.json` selects the build command and `github-pages` output. Keep the Vercel project's Root Directory at the repository root. The preview receives security headers.
- A push to `main` triggers these deployments. Pull requests run checks without deploying Pages.

Do not upload extra copies of the site into the root or into `VOLT-GitHub-Pages/`. Do not select the entire repository as a static publishing directory.

## What the preview supports

Browsing, categories, real product photos, search, sorting, saved favorites, bag quantities, and sample price calculations work. The preview never collects signup passwords, delivery addresses, orders, or payment details. Login, admin, and selling require the full backend and a persistent database.

The Node/SQLite app remains available locally through `Start-VOLT.cmd` at http://localhost:3001. Online account functionality still needs a compatible backend/database deployment.

## Manual export for a separate static host

Run `npm run build:pages`. Upload only the contents of `github-pages/`. The generated folder is ignored by Git and rebuilt from source. `node scripts/preview-pages.mjs` serves it locally on port 3101 under the GitHub repository path.

The builder uses an explicit file allowlist, validates image assets, and refuses unexpected files in an existing output directory. If that check fails, inspect the named file before rebuilding; do not publish it blindly.
