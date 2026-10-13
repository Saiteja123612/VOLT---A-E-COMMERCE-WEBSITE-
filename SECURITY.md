# Privacy and security

## Public source, private store records

This repository intentionally remains public. Application source and fictional test fixtures are readable by anyone. Customer records, password hashes, session tokens, recovery keys, real uploaded photos, backups, and service credentials must never be committed. `.gitignore` and `.dockerignore` exclude their normal locations; ignoring a file does not erase a previously published copy.

Keep database/service credentials in the hosting provider's server-side environment settings. Never put secret keys in `public/`, browser JavaScript, GitHub issues, screenshots, or frontend environment variables. `.env.example` contains non-secret examples only. GitHub secret scanning and push protection are enabled on this repository. `npm run check:privacy` adds a limited filename/token-pattern check; it cannot recognize every secret or personal record.

## Deployment boundary

`public/` is the frontend source. `npm run build:pages` creates a static preview from approved files and the sample catalog. Both hosted preview configurations publish `github-pages/` only. The Node server exposes its frontend allowlist and validated uploaded product images; it does not serve its project directory.

The hosted preview does not collect passwords, addresses, payments, or support messages. Hosting providers still process ordinary request metadata. The full app stores account and order data on the server. Store administrators have access to customer/order/support records; sellers receive delivery details for their own order items. Uploaded product photos and published reviews are public content.

## Existing application controls

- Salted scrypt password hashes; hashed session and recovery tokens.
- HttpOnly and SameSite=Strict session cookies; Secure on configured HTTPS hosting.
- Server-side role and ownership checks; CSRF tokens for authenticated changes.
- Transactional inventory/order updates and server-calculated prices.
- Session revocation on password, role, and suspension changes.
- Origin/host checks, request limits, escaped content, and browser security policies.
- Audit records for administrator changes; no default administrator credentials.

Browser storage may contain bag items, favorites, and private order lookup keys. Signing out does not erase all browser storage. Clear site data before leaving a shared computer. Local database files are not encrypted at rest by this application; restrict filesystem access and protect backups.

## Before accepting real customer data

Connect a durable hosted database and backend, configure HTTPS/PUBLIC_ORIGIN, verify email ownership, define retention/deletion and business policies, and test backup restoration. The current rate limit is per process and uses the socket address; a production reverse proxy needs a reviewed trusted-proxy and shared rate-limit setup. There is no online payment, automatic refund, courier integration, or email verification yet.

For a suspected leak, revoke/rotate the affected credential first. Removing a file in a later commit does not remove it from Git history or other copies. Do not post credentials or customer records in public issues.

## Review record — 13 October 2026

A scan of the available Git history found no tracked runtime database, environment secret file, private-key file, or matches for the checked token formats. This is a limited repository review, not a guarantee of absence of secrets or a penetration test. No history rewrite or deletion of the local store database was performed.
