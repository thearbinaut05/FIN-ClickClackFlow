-- REVIEW and apply manually to a staging DB. This script is NOT auto-run.
-- Every financial table is isolated from legacy simulated balances.
BEGIN;
CREATE TABLE public.monetization_users (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), store_name text NOT NULL,
 account_id text UNIQUE, customer_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.monetization_events (event_id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.monetization_receipts (
 receipt_id text PRIMARY KEY, payment_intent_id text UNIQUE, kind text NOT NULL,
 account_id text, user_id uuid, gross_minor bigint NOT NULL CHECK(gross_minor >= 0),
 currency text NOT NULL, commission_minor bigint NOT NULL DEFAULT 0,
 processing_fee_minor bigint, refunded_minor bigint NOT NULL DEFAULT 0,
 needs_review boolean NOT NULL DEFAULT false, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.monetization_subscriptions (
 subscription_id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL, paid_through timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.monetization_withdrawals (
 request_id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), account_id text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency text NOT NULL,
 payout_id text UNIQUE, status text NOT NULL DEFAULT 'reserved',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.monetization_partner_receipts (
 event_id text PRIMARY KEY, conversion_id text UNIQUE NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency text NOT NULL,
 status text NOT NULL DEFAULT 'pending_external_settlement', created_at timestamptz NOT NULL DEFAULT now()
);
-- No anonymous financial reads or client writes. Server role must be restricted
-- to these tables; do NOT reuse the read-only audit DB role.
ALTER TABLE public.monetization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_partner_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monetization_users, public.monetization_events, public.monetization_receipts,
 public.monetization_subscriptions, public.monetization_withdrawals, public.monetization_partner_receipts FROM anon, authenticated;
-- Supabase service_role has RLS bypass. An ordinary dedicated server role needs
-- reviewed RLS policies keyed to its role; do not grant BYPASSRLS casually.
GRANT SELECT,INSERT,UPDATE ON public.monetization_users, public.monetization_events, public.monetization_receipts,
 public.monetization_subscriptions, public.monetization_withdrawals, public.monetization_partner_receipts TO service_role;
COMMIT;
