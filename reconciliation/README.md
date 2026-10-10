# Isolated, read-only USD reconciliation dashboard

This directory is intentionally independent of legacy cashout/revenue servers.
It has no payout, transfer, database-write, migration, or routine-execution routes.
No real keys, financial results, customer records or historical audit data are
included here. Existing application code and database policies are unchanged.

## Run locally (Node.js 20.6+)

1. Copy `reconciliation/.env.example` to `reconciliation/.env`; fill the clearly
   marked placeholders. Do not copy or automatically load the repository root
   `.env`: that file is tracked in the public repository and needs separate review.
2. Use existing Supabase email/password Auth users and explicitly allowlist their
   UUIDs. No user creation is performed. A missing/invalid allowlist fails closed.
3. Provide a dedicated read-only PostgreSQL connection. This service does not
   create a role or change grants. Provisioning one, rotating secrets, or tightening
   existing policies requires a separately approved database change.
4. The server uses `pg`, already declared in the repository's package.json.
   Install reviewed dependencies in a clean environment before starting. Never
   run legacy deploy/sweep scripts just to launch this dashboard.
5. Run from the repository root:
   ```sh
   node --test reconciliation/core.test.mjs
   node --env-file=reconciliation/.env reconciliation/server.mjs
   ```
6. Open http://localhost:4242. Tokens stay in browser memory only. Refreshing the
   page requires sign-in again. This email/password sample does not implement
   MFA/SSO flows; add a verified MFA/admin-session integration before production.

## Read-only safeguards and limitations

- Supabase verifies bearer tokens server-side; the verified user ID must match
  an explicit server allowlist. An anonymous/public Supabase key is never admin
  authorization. Service-role/secret keys are rejected for the public config.
- Every database query is fixed SELECT-only SQL inside an explicit READ ONLY
  transaction, with a five-second statement timeout and verified TLS. No SQL,
  table names, user IDs or monetary values are accepted from request parameters.
- PostgreSQL decimals are returned as strings to preserve exact recorded values.
  Unknown units are shown as raw totals, not silently converted or combined.
- Missing tables, credentials, or provider evidence produce UNAVAILABLE—not $0.
  Ledger blocks are separate reads, not a single atomic financial snapshot.
- Database “verified” / “completed” labels remain UNVERIFIED LEDGER claims.
  The dashboard does not match each entry to a provider transaction yet.
- Optional Stripe reads use only GET /v1/account and GET /v1/balance with API
  version 2026-09-30.endive. The key's account must match the configured account
  ID. Use a restricted READ-only key; account permission labels can vary in Stripe.
  The mode is prominently displayed. Test-mode balances are not real money.
- Other Stripe accounts, affiliate networks, banks, taxes and payout restrictions
  are outside this initial dashboard. A provider balance is not payout eligibility.
- Responses have no-store caching and a restrictive CSP. There is no CORS API
  access or persistent finance cache. Financial fields are rendered with textContent.
- The built-in limiter uses socket IP, not untrusted proxy headers; add a trusted
  proxy-aware production limiter/WAF and request monitoring before public launch.
- Read-only transactions protect this service, not other applications. Previously
  discovered public write policies and exposed ledger-changing routines remain
  urgent security issues requiring separately approved remediation.

## Organization workflow

Preserve backups/export evidence first. Keep separate: provider-confirmed cash,
externally approved receivables, internal credits, simulated/test data, and
unverified/unmatched records. Record provider account, live/test mode, currency,
minor-unit convention, external transaction ID, gross, fees, net and timestamps.
Do not add balance snapshots to transaction totals or count transfers as new
revenue. Verify CPA commissions with network conversion/approval/payout reports.
Never execute legacy “monetize” routines to make a database amount spendable.

## Render preparation — NOT deployed automatically

After approval, create a separate staging **Web Service** on branch
`connect-render-staging`, with start command `node reconciliation/server.mjs`.
Supply credentials through Render's private Environment settings; do not embed
an env-file in an image or commit it. A reviewed build command must install the
`pg` dependency. Bind uses 0.0.0.0 and Render's PORT; health path is `/health`.
Keep main's existing deployment untouched. Review plan cost before provisioning.
This change does not create a Render service, database role, or Stripe resource.
