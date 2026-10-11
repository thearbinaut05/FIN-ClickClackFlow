# Verification scope

Run `node --test rules.test.mjs lifecycle.test.mjs` (18 offline tests) and `npm run check`; also check `lifecycle.mjs`. Tests cover controller-only account properties, Endive version, price/fee/destination validation, no client financial overrides, seller readiness, pagination, approved-link gating, HMAC/raw-body timestamps, UUIDs, late payout events using current provider state and early refunded receipts.

These checks do NOT certify live revenue, actual bank settlement, provider approval, a configured DB role, premium benefits, a deployed service, or the entire legacy React app. Premium billing and payout execution remain disabled by default. The new service is not deployed.

Before rollout: install isolated dependencies; validate staging DB TLS/RLS; test signed platform and Connect events, database rollback/retries, concurrent payouts and interrupted responses; integrate real entitlements/fulfillment, tax and refund/transfer-reversal/application-fee-refund operations; test the complete inherited application and audit remaining standalone financial scripts. No owner sweep or automatic user reward credit exists.
