# VOLT full-stack marketplace

This is the complete application source, including the Node backend, SQLite schema/migrations, customer panel, seller studio, and admin console. The static GitHub Pages ZIP is a separate browsing preview.

## Start for free on this computer

Requires Node.js 24 or newer. There are no npm dependencies, paid database services, or API keys.

```powershell
cd D:\MYSELF\volt-store
$env:PORT = '3001'
npm start
```

Open http://localhost:3001. If the store is already running, open that address directly. `Start-VOLT.cmd` is also included.

## Make your account an administrator

1. In VOLT, choose **Account & lists → Create your account**. Save your recovery key.
2. Double-click **Setup-Admin.cmd**, enter that account's email, and press Enter. Alternatively:

```powershell
npm run admin -- your-account@example.com
```

3. Sign in again. Your sidebar now includes **STORE MANAGEMENT**, and admin login opens the admin overview. You can also open http://localhost:3001/#admin.

No shared/default admin password is installed. Signup always creates a customer account. The bootstrap command requires access to the server and only promotes an existing account. All prior sessions for that account are revoked. Admins can grant/revoke other administrators from Customers & sellers, but cannot remove their own admin access or the final active administrator.

## Panels and workflows

| Panel | Included |
|---|---|
| Customer | Account overview, profile/address, password change/recovery, saved products, order history, status timeline, receipts, repeat purchases, pre-shipping cancellation, verified reviews, support and return requests |
| Seller | Store profile, listings, product photos, prices, inventory, archive/restore, own incoming order items, fulfillment |
| Admin | Store overview, 7-day order chart, low-stock count, all products, seeded catalog editing, product visibility, all orders, per-item fulfillment, tracking references, customers/sellers, suspension/reactivation, administrator roles, coupons, support conversations, return decisions, audit history |

Every management view uses the backend. Authenticated writes require CSRF tokens. Admin routes verify roles on the server; hiding frontend buttons is not the access control. Suspended accounts lose sessions and their seller products leave the public catalog. Products hidden by an admin stay hidden even if a seller edits or restores them. Account details, order ownership, and ticket ownership are checked before returning data.

Admin inventory edits survive a restart through catalog overrides. Seed refreshes preserve overrides and existing stock. Order creation and cancellation use transactions. Repeated cancellation does not restock twice. Coupons use integer-paise totals, expiry, a minimum spend, and a maximum discount. Only admins can fulfill the unowned seed catalog; sellers can fulfill their own items.

## What remains an external integration

Checkout records cash-on-delivery demo orders. There is no online payment gateway, card collection, courier booking, email/SMS provider, seller payout, GST invoice service, or automatic refund. Tracking references and delivery statuses are entered manually. Return requests are stored and managed as conversations; approval does not move money, book pickup, or restock items. Admin order value is merchandise/order data, not collected revenue.

The sample products, prices, and stock remain demonstration data. Real-brand manufacturer references are documented in PRODUCT_SOURCES.md. Accounts do not verify email ownership; recovery uses a private one-time key. A public commercial launch also needs business policies, verified inventory, and the relevant operational integrations.

## Publish the full application

Upload **VOLT-Full-Stack.zip** to a private source repository or your chosen backend host. It contains source code only. Do not use the GitHub Pages ZIP for the full application.

The included server requires a persistent Node process and a writable, durable disk. GitHub Pages cannot run it. Uploading this project unchanged to Vercel Functions will not provide durable local SQLite storage. Choose hosting that supports Node 24+ and a persistent volume, or migrate the database and image storage for a serverless deployment. No hosting service was purchased or connected.

For a conventional host:

- Start command: `node server.js` (no install/build command is required).
- Set `HOST=0.0.0.0`, `PORT` to the host's assigned port, `NODE_ENV=production`, and `PUBLIC_ORIGIN=https://your-actual-domain`.
- Set `DB_PATH` to a persistent-volume path, for example `/app/data/store.sqlite`.
- Keep SQLite and its `uploads` directory on that volume. Use one application instance with this file database.
- Terminate HTTPS at the host/reverse proxy. Preserve the original Host header. Only the exact PUBLIC_ORIGIN is accepted; HTTPS enables Secure session cookies.
- Run `node scripts/admin.mjs your-account@example.com` in the hosting console after registering your account on that deployment.
- Health endpoint: `/api/health` using the configured Host header.

An optional Dockerfile is included. Supply PUBLIC_ORIGIN and mount durable storage at `/app/data`. Container tooling was not installed or a hosted container deployed as part of this build.

## Back up and verify

```powershell
npm run backup
npm run check
npm run check:privacy
npm test
```

Backups are stored privately under `data/backups`. The SQLite snapshot uses VACUUM INTO and includes copied uploads. Pause uploads while backing up. To restore, stop the app and replace its data with the matching backup snapshot; do not mix a restored database with stale WAL/SHM files. Keep credentials, account data, and backups out of public repositories.

Tests create temporary isolated stores. Test accounts in `test/browser-fixture.mjs` are synthetic and never seeded into the user's real database. The test fixture is excluded from the public deployment package.

## Source and deployment privacy

The source repository remains public; runtime account records and credentials are private and excluded. Read SECURITY.md before connecting a production database. The Vercel configuration intentionally publishes the browsing preview until the full backend is adapted for a durable hosted database. GitHub Pages uses a workflow that uploads only the generated preview, not the repository root.
