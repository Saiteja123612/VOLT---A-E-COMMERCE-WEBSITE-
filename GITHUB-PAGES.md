# Fix the GitHub Pages upload

Your project URL is https://saiteja123612.github.io/VOLT---A-E-COMMERCE-WEBSITE-/.
The old HTML used `/styles.css`, `/app.js`, and `/images/...`, which request files from the account's domain root instead of this repository. The corrected export uses relative paths and includes a static product catalog.

## Upload the ready-made version

1. Extract `VOLT-GitHub-Pages.zip`.
2. Open https://github.com/Saiteja123612/VOLT---A-E-COMMERCE-WEBSITE-.
3. Choose **Add file → Upload files**.
4. Drag all files and the **images** folder from inside the extracted folder into the repository root. Replace the existing files. Do not upload the ZIP itself or a parent folder.
5. Commit the upload. In **Settings → Pages**, use **Deploy from a branch → main → / (root)**, if that is not already selected.
6. Wait for the Pages deployment to finish, then open the site and press **Ctrl+F5** to refresh cached files.

The root must contain `index.html`, `styles.css`, `marketplace.css`, `fonts.css`, `app.js`, `marketplace.js`, `pages-preview.js`, `catalog.json`, and the `images` directory. Keep `.nojekyll` if your upload method includes hidden files; this site also works without it.

## What works on GitHub Pages

The layout, real product photographs, product details, manufacturer links, category filters, search, sorting, favorites, bag quantities, sample price totals, and VOLT10 calculations work without a backend. The bag and favorites persist in each visitor's browser.

GitHub Pages only hosts static files. It cannot run `server.js` or SQLite. This export clearly labels itself as a preview and does not accept passwords, delivery addresses, orders, or payments. Account, seller, and checkout buttons explain this limitation rather than showing broken forms. No client-side password database or fake authentication is included.

The full local marketplace is unchanged: run `npm start` from `D:\MYSELF\volt-store` and open http://localhost:3000. A public full-stack deployment requires a host capable of running the backend with durable storage. No paid service or hosting account has been created by this change.

## Rebuild after editing

Run `npm run build:pages`. Upload the contents of the generated `github-pages` folder, not the full project directory. Run `node scripts/preview-pages.mjs` to test the export under the same repository subpath on port 3101.

Only public frontend files and the seeded sample catalog are exported. Never upload `data`, SQLite files, account records, recovery keys, `.env`, or private seller uploads to a public repository.

Reference: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
