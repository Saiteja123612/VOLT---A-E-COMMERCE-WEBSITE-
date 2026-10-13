# VOLT — Everyday, upgraded.

A local electronics marketplace with customer accounts, an admin console, a seller studio, product photo uploads, order management, an original lightning logo, a responsive storefront, a Node.js HTTP backend, and persistent SQLite storage. No paid database, API keys, subscription, external CDN, or npm dependencies are required.

## Repository layout and privacy

Edit the storefront in `public/` and the backend in `server.js`, `marketplace.js`, and `operations.js`. Keep `scripts/`, `test/`, deployment configuration, and documentation. The generated `github-pages/` folder is rebuilt automatically; duplicate root storefront files and the old uploaded `VOLT-GitHub-Pages/` folder have been removed.

Vercel and GitHub Pages publish only the generated browsing preview. See [GITHUB-PAGES.md](GITHUB-PAGES.md) for deployment configuration and [SECURITY.md](SECURITY.md) for the privacy boundary and remaining launch requirements. Never upload the local `data/` folder, `.env`, backups, or service credentials. Source remains public by choice.

## Run

Requires Node.js 24 or newer (Node 26 is installed on this computer).

```powershell
cd D:\MYSELF\volt-store
$env:PORT = '3001'
npm start
```

Open http://localhost:3001. Keep the terminal running. Stop with Ctrl+C. For automatic server restarts while editing, use `npm run dev`. No installation step is necessary.

By default the server listens only on this computer, at `127.0.0.1`. The GitHub Pages export is a static browsing preview; this full backend has not been deployed publicly. No billing account or paid service has been connected.

## Admin and full-stack setup

See [FULL-STACK-SETUP.md](FULL-STACK-SETUP.md) for administrator setup, deployment, backups, and the complete panel guide. Create your account, then run `npm run admin -- your-account@example.com` and sign in again. No default admin password is installed.

## Included

- Administrator overview, inventory editing, order fulfillment, tracking references, customer/seller management, suspension, discount codes, support/return requests, and an audit log.
- Customer support conversations and return requests for delivered purchases.
- One account for buying and selling: signup, login, logout, password changes, and recovery using a private one-time recovery key.
- Customer overview, saved delivery address, account-synced wishlist, order history, status timelines, repeat purchases, receipts, and cancellation before shipping.
- Seller onboarding with a store name. Add/edit products, upload PNG/JPEG/WebP photos (up to 2 MB), manage prices and stock, archive/restore listings, and filter inventory.
- Seller dashboard with active listing counts, stock, incoming orders, and gross merchandise ordered (before discounts; not a payout balance).
- Sellers see only their order items and the delivery details needed for those orders. Fulfillment progresses from Confirmed → Processing → Shipped → Delivered.
- Buyers can review delivered products. Reviews are limited to one per buyer/product and can be updated. Ratings reflect actual local reviews rather than fabricated scores.
- Search suggestions, nine electronics categories, price/rating/discount sorting, hover effects, image movement, focus states, and responsive account/seller dashboards.
- Eleven real-brand demo listings and eight original concept products, INR prices, manufacturer references, product details, category filters, search, sorting, and favorites.
- Persistent shopping bag with quantity changes and item removal.
- Server-authoritative pricing, stock checks, and transactional order creation.
- `VOLT10`: 10% off the subtotal, capped at ₹1,000.
- Delivery: ₹99 below ₹2,999; free at or above ₹2,999 before discounts.
- Integer-paise calculations and exact display of fractional totals. Sample prices are tax-inclusive; this is not a GST tax-invoice system.
- Address validation for India and cash-on-delivery demo checkout.
- Unique checkout request keys prevent duplicate submissions from decrementing stock twice.
- Orders persist across restarts, with access-key protected lookup and downloadable plain-text receipts.
- Keyboard-accessible native dialogs, responsive mobile layouts, reduced-motion support, and error/empty states.
- No analytics, tracking cookies, remote fonts, stock-image services, or external requests.

## Important scope

Catalog prices, specifications, stock, and store policies are demonstration data. Admins can manage and fulfill the built-in catalog. Seller Studio products belong to their seller and support the seller order workflow.

Checkout saves a **local demo order**. Fulfillment buttons change local status only. The app does not take online payment, make payouts, book shipping, send email/SMS, or process refunds or return shipping. Return requests and decisions are recorded in the support panel. Use fictional personal information when testing. Guest purchases are found with their order key; only purchases made while signed in appear in account order history.

This is a functional full-stack marketplace foundation, not the full Amazon platform or a deployed commercial operation. A public launch needs HTTPS hosting, business policies, backups, seller moderation/verification, and payment, tax, returns, and fulfillment integrations as appropriate. Those services may have costs; none is connected here. Accounts are local and do not verify email ownership. Recovery uses a private key to avoid an email-service dependency.

## Start shopping and selling

1. Click **Account & lists → Create your account**. Use a password of at least 10 characters and save the recovery key when it is displayed.
2. Click **Sell on VOLT**, enter your store name, then choose **Add a product**.
3. Add the name, category, condition, selling/reference prices, stock, description, specifications, and an optional product photo. Click **Publish product**.
4. The listing appears immediately in the local marketplace. Manage it from **My listings**. Archiving hides it without deleting historical orders.
5. Use a separate buyer account to purchase it. The seller account cannot buy its own products.
6. Find purchases under **My orders** and sales under **Incoming orders**. Update each seller item’s fulfillment status. Buyers can review it once delivered.

All of these actions are free and local. You do not need separate buyer and seller passwords for the same account; one account supports both roles.

## Account and data protection

Passwords use salted scrypt hashes. Sessions expire after seven days, are stored hashed in SQLite, and use HttpOnly/SameSite=Strict cookies. Mutations from signed-in accounts require a session CSRF token. The server binds to loopback, checks the Host/Origin headers, and rate-limits API and authentication requests. Content is escaped before being rendered and the site has a Content Security Policy.

Changing a password revokes previous sessions. Recovery keys are shown once, stored hashed, and rotated when used. Keep the downloaded key private. No default administrator or pre-seeded user account exists in the main database. HTTPS PUBLIC_ORIGIN enables Secure cookies and strict hosted-origin checks. Admins can suspend accounts and hide products. Email verification and external operational services still require integration.

## Files and customization

- `public/index.html`: store layout and copy.
- `public/styles.css`: original blue/lime/peach design and responsive breakpoints.
- `public/app.js`: shopping experience and API calls.
- `public/marketplace.js`: account, seller, listing, review, and order-management interfaces.
- `public/marketplace.css`: marketplace header, interaction effects, account dashboard, seller studio, and responsive layouts.
- `public/images/`: original logo and illustrations; edit directly or regenerate with `node create-assets.mjs`.
- `catalog.js`: product names, descriptions, prices in paise, initial stock, and specifications. Restart the server after editing. Catalog content/prices update automatically unless an admin has edited that product; admin overrides and existing inventory counts are preserved. Remove unwanted products from the database separately, since seed changes do not delete records.
- `operations.js`: admin authorization, inventory controls, coupons, support, return requests, and audit records.
- `public/operations.js` and `public/operations.css`: admin and support panels.
- `server.js`: HTTP routes, pricing rules, validation, inventory, and SQLite queries.
- `marketplace.js`: authentication, sessions, seller permissions, listings, uploads, order ownership, fulfillment, and reviews.
- `data/store.sqlite`: live local data, created automatically. Keep it private. Use `npm run backup` for a SQLite snapshot and matching uploads. Keep backups private. It is excluded from Git.
- `data/uploads/`: locally uploaded product photos. Back this directory up together with the database.
- `test/store.test.js`: isolated integration tests with a temporary database.
- `test/marketplace.test.js`: isolated buyer/seller, authentication, ownership, photo upload, recovery, fulfillment, and review tests.
- `test/browser-fixture.mjs`: optional isolated browser-QA server on port 3099. Its synthetic accounts exist only in a fresh temporary database, never in the main store.

To use another port or database path:

```powershell
$env:PORT = '3001'
$env:DB_PATH = 'D:\MYSELF\volt-store\data\alternate.sqlite'
npm start
```

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Server/database readiness |
| GET | `/api/products` | Catalog and live inventory |
| POST | `/api/quote` | Validated line prices, discount, shipping, total |
| POST | `/api/orders` | Transactionally create an order |
| POST | `/api/orders/lookup` | Retrieve an order with its private access key |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/recover` | Account lifecycle |
| GET | `/api/auth/me` | Current user and session CSRF token |
| POST | `/api/account/profile`, `/api/account/password`, `/api/account/wishlist` | Account settings |
| GET | `/api/account/orders` | Signed-in buyer’s order history |
| POST | `/api/account/cancel` | Cancel an owned, unshipped order and restore inventory |
| POST | `/api/seller/enroll` | Activate or rename your seller profile |
| GET | `/api/seller/dashboard` | Owned listings and seller-scoped incoming order data |
| POST | `/api/seller/products`, `/api/seller/image`, `/api/seller/visibility` | Listing management |
| POST | `/api/seller/fulfillment` | Advance the seller’s own order item status |
| GET | `/api/products/:id/reviews` | Public verified-purchase reviews |
| POST | `/api/reviews` | Create/update a review for a delivered purchase |

POST routes accept JSON. Order lookup intentionally uses POST so the private key is not placed in URLs/history. There is no public endpoint listing customers or all orders. Order keys are hashed in the database.

## Verify

```powershell
npm run check
npm run check:privacy
npm test
```

Tests use ports 3097/3098 and isolated temporary databases. They check pricing tampering, coupon limits, delivery thresholds, invalid carts, checkout validation, origin/CSRF protection, idempotency, access control, inventory rollback, seller ownership, image validation, order privacy, fulfillment transitions, review eligibility, password hashing, recovery-key replay prevention, session revocation, and persistence across server restarts.

## Real products

The catalog includes 11 real-brand demo listings: iPhone 16, Galaxy S25, OnePlus 13, MacBook Air M4, ASUS Zenbook 14 OLED, MacBook Pro M4, iPad A16, AirPods 4, Apple Watch Series 10, Logitech MX Master 3S, and PS5 Slim. Manufacturer photos are stored locally, so browsing requires no third-party image requests. See [PRODUCT_SOURCES.md](PRODUCT_SOURCES.md) for provenance. Demo prices/inventory are explicitly labelled; these are not live supplier offers. The original eight VOLT concept products remain available. No money is collected, paid database account created, or hosting purchased.

## GitHub Pages upload

GitHub Pages cannot execute the Node/SQLite backend. Use `npm run build:pages` to produce a static browsing preview with repository-relative assets and a seeded catalog. Upload the contents of `github-pages`, not `public` or the entire source directory. See [GITHUB-PAGES.md](GITHUB-PAGES.md) for the exact upload steps and feature limits. The full local store continues to use `npm start`.
