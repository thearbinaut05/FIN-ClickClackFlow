-- REVIEW and apply manually to a staging DB. NOT auto-run. Financial tables
-- are isolated from legacy simulated balances. Run exactly once as a migration.
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
-- Defense in depth for overlapping events: a late pending webhook must not
-- overwrite paid/failed/canceled. A later provider-confirmed terminal change
-- (such as a bank return changing paid to failed) remains allowed.
CREATE FUNCTION public.monetization_payout_status_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status IN ('paid','failed','canceled') AND NEW.status NOT IN ('paid','failed','canceled') THEN
  NEW.status := OLD.status;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_terminal_payout_status BEFORE UPDATE ON public.monetization_withdrawals
 FOR EACH ROW EXECUTE FUNCTION public.monetization_payout_status_guard();
CREATE TABLE public.monetization_partner_receipts (
 event_id text PRIMARY KEY, conversion_id text UNIQUE NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency text NOT NULL,
 status text NOT NULL DEFAULT 'pending_external_settlement', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.monetization_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monetization_partner_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monetization_users, public.monetization_events, public.monetization_receipts,
 public.monetization_subscriptions, public.monetization_withdrawals, public.monetization_partner_receipts FROM anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.monetization_users, public.monetization_events, public.monetization_receipts,
 public.monetization_subscriptions, public.monetization_withdrawals, public.monetization_partner_receipts TO service_role;
-- An ordinary dedicated server DB role needs reviewed policies from
-- server-role.sql.example. Never use the audit read-only role for mutations.
COMMIT;
