# Verified monetization — staged implementation, NOT deployed

This extends FIN-ClickClackFlow from `connect-render-staging`. The existing read-only reconciliation service is preserved. This separate Node service uses simple HTML matching the deep-blue app style. No scripts automatically enroll providers, buy traffic, deploy code, move money, run schema changes, or promise revenue.

## Included / intentionally disabled

- Controller-only Connect accounts (fees/losses paid by application, Express dashboard; NEVER top-level account type). Stripe SDK 23.0.0 and explicit **2026-09-30.endive**.
- Authenticated seller controls and fresh `accounts.retrieve` status, Account Links refresh/return handling, platform products using `default_price_data` with connected account metadata.
- Public storefront drains pagination for ALL active platform products and ALL connected accounts. Unmapped/unready/unsupported products remain visible but not purchasable; personal seller data is not published.
- Hosted Checkout destination charges with configurable commission (10% default). Platform Price is retrieved on server; client fees/prices/destinations/return URLs cannot override it.
- Raw-signature-verified paid receipts, private PostgreSQL ledger, atomic webhook deduplication, refund/dispute review flags.
- Optional Stripe Billing Checkout/portal, subscription status receipts. OFF until you implement real premium benefits. Billing configuration and entitlement integration into actual premium features still require testing; no paid feature is invented.
- Authenticated STANDARD test seller payouts with provider-confirmed balances, reservations, idempotency and paid/failed lifecycle webhooks. OFF by default. Only the seller's existing balance is used; no duplicate platform transfer or automatic owner sweep.
- Approved affiliate-link placements for impact.com, Awin, CJ, PartnerStack, Amazon Associates and Sovrn. These are **link integrations ONLY**, not provider API/data/postback adapters. Approval/contracts and exact official links must be supplied.
- First-party sponsor/partner HMAC conversion receipts. Pending/unsettled ONLY; no user balance credit or cash payout. NOT a generic verification adapter for external networks.
- AdSense, PropellerAds and OfferToro are explicitly marked NOT IMPLEMENTED. They require approval and provider-specific integration/policy review. Do not reward ordinary ad clicks or fabricate conversions.

## Setup (manual, test-only)

1. Review `schema.sql`; apply to a STAGING Supabase Postgres database. No legacy balances are migrated or treated as cash. Create/review a server DB role limited to these new tables with appropriate RLS access. Do not use the read-only audit role; never put DB credentials in browser envs.
2. `cd monetization && npm install`; use its isolated dependency set, not the legacy root Stripe SDK.
3. `cp .env.example .env`; fill the marked placeholders. Supabase public key must be anon/publishable, NEVER service_role. Set verified Supabase Auth administrator UUIDs. Enable email/password sign-in and email confirmation. If you choose another Supabase project, configure authentication consistently.
4. Use PLATFORM `sk_test_...`. LIVE keys are unconditionally rejected in this release. TLS verification is mandatory for Postgres; supply the correct CA if needed.
5. `npm test && npm run check && npm start`. Open `http://localhost:4243/storefront` and `/connect`. Root `.env` is NOT automatically loaded. Missing configuration produces named errors, not simulated payment success.
6. Configure NEW Stripe test webhooks: platform endpoint `/webhooks/stripe` and connected-account endpoint `/webhooks/connect`. Set each distinct signing secret. Platform events: checkout.session.completed, checkout.session.async_payment_succeeded, invoice.paid, customer.subscription.updated, customer.subscription.deleted, charge.refunded, charge.dispute.created. Connect events: payout.created, payout.updated, payout.paid, payout.failed, payout.canceled. Use Endive event version. A CLI listener uses its own secret. Never reuse the old cashout signing secret blindly.
7. Create a seller account and onboard using valid Stripe TEST details. Same-country demo; cross-border eligibility is not automatically handled. New accounts use manual payout schedules; existing accounts are not silently altered.
8. Create a platform product, e.g. 19.99 USD, refresh the catalog and buy with hosted Checkout using Stripe test card 4242 4242 4242 4242. Two units at 10% yields 399 minor units application fee, rounded down; Stripe processing fees are additional platform costs.
9. Verify paid webhook receipts and replay an event to check deduplication. Do not fulfill on the success page. Refund/dispute handling FLAGS accounting for review; transfer reversals and application-fee refunds are not automated here.
10. Only after balance and Connect webhook tests set `MONETIZATION_TEST_PAYOUTS=true`. Test pending/paid/failed states and network interruption. An unresolved request older than 23 hours requires admin reconciliation, not a fresh transfer. This does not certify production payout readiness.

## Affiliate and sponsor configuration

`MONETIZATION_AFFILIATE_LINKS` is a JSON array like `[{"provider":"awin","name":"Approved merchant offer","url":"https://YOUR_APPROVED_TRACKING_URL","approved":true}]`. Use your official program-approved URL and disclosure. Do not mark approval true before approval. Links do not create provider earnings in the ledger.

For a partner YOU control, approve a documented contract and configure a strong random HMAC secret. POST raw JSON to `/webhooks/partner` with `eventId`, `conversionId`, positive integer `amountMinor`, currency usd/eur/gbp. Headers: `X-Partner-Timestamp` Unix seconds and `X-Partner-Signature` hex HMAC-SHA256 of `timestamp + '.' + rawBody`. Timestamp tolerance is 5 minutes; IDs deduplicate receipts. This records pending conversions only. Independent settlement reconciliation and a funded reward pool are required before paying rewards. Existing ad calculators, mock swarms and game coins are not connected to this ledger.

## Revenue reporting and fair economics

`GET /api/admin/revenue` requires a verified allowlisted Supabase admin. It reports receipts, known/unknown Stripe processing fees, refund flags, pending partner conversion amounts, and current provider balance separately. It deliberately DOES NOT label total platform balance or ledger sums as withdrawable profit. Balance may contain unrelated money or seller liabilities. Pending conversions and game points are never spendable cash. Start with transparent fees and optimize observed net economics rather than merely adding connector logos.

## Existing unsafe paths

This feature branch disables the legacy Node cashout entrypoint and mutating legacy cashout/payment-processor Edge Functions. Legacy frontend cashout services now fail closed: no fake-success fallbacks and no redemption of browser-managed coins. Those files must not be selectively merged without testing the new UI/service. No deployed branch was modified. Legacy standalone scripts elsewhere in the repository have NOT all been audited/rewritten; do not run them with live keys.

## Integration into the existing app

Set `VITE_MONETIZATION_URL` to this service's origin before building the React app. `/revenue` links to the isolated marketplace, seller setup and connector directory. Backend has no cross-origin browser API: UI and API are served together with CSP, bearer Auth and request limits. Deploy separately only after review. Do NOT change the Render reconciliation service start command to this service; they have different credentials and responsibilities.

Before live production: implement real products/benefits, transactional fulfillment outbox, tax/shipping, refund/transfer reversal flows, provider-specific settlement reconciliation, anti-fraud, durable rate limits, consent/privacy/terms, and independent security/payout tests. This release is a test-only foundation, not guaranteed income or production certification.
