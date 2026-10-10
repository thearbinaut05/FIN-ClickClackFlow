// All SQL below is fixed SELECT-only text. Do not accept SQL or table names from
// HTTP input, call legacy "monetize" routines, or interpret a ledger as cash.
export const API_VERSION = '2026-09-30.endive';
export const QUERIES = Object.freeze({
  earnings: `SELECT source, count(*)::text AS records, sum(amount)::text AS recorded_total,
    min(created_at) AS first_record_at, max(created_at) AS latest_record_at,
    count(*) FILTER (WHERE description ~* 'simulat|mock|test')::text AS explicitly_test_records,
    count(*) FILTER (WHERE metadata ? 'stripe_payment_intent_id' OR metadata ? 'stripe_charge_id')::text AS stripe_reference_records
    FROM public.earnings GROUP BY source ORDER BY source`,
  application: `SELECT balance_amount::text AS recorded_balance, pending_transfers::text,
    last_updated_at FROM public.application_balance`,
  storage: `SELECT balance_amount::text AS recorded_balance, stripe_balance::text AS recorded_stripe_balance,
    pending_transfers::text, last_updated_at FROM public.storage_balance`,
  snapshots: `SELECT source_system, balance_type, amount_usd::text, verification_status,
    last_updated FROM public.usd_balance_real_time ORDER BY source_system, balance_type`,
  transferRequests: `SELECT status, currency, count(*)::text AS records, sum(amount)::text AS recorded_total,
    count(*) FILTER (WHERE stripe_transfer_id IS NOT NULL AND stripe_transfer_id <> '')::text AS with_provider_id
    FROM public.autonomous_revenue_transfers GROUP BY status, currency ORDER BY status, currency`,
  localTransfers: `SELECT status, currency, count(*)::text AS records, sum(amount)::text AS raw_amount_total,
    count(*) FILTER (WHERE payout_id IS NOT NULL AND payout_id <> '')::text AS with_payout_id
    FROM public.stripe_transfers GROUP BY status, currency ORDER BY status, currency`,
  payments: `SELECT status, currency, count(*)::text AS records, sum(amount)::text AS raw_amount_total,
    count(*) FILTER (WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id <> '')::text AS with_payment_id
    FROM public.stripe_payments GROUP BY status, currency ORDER BY status, currency`,
});

function required(env, name) {
  const value = env[name]?.trim();
  if (!value || /REPLACE_ME|PLACEHOLDER/i.test(value)) throw new Error(`Missing ${name}. Fill the placeholder in reconciliation/.env.example; never commit credentials.`);
  return value;
}
export function configFromEnv(env) {
  const supabaseUrl = new URL(required(env, 'AUDIT_SUPABASE_URL'));
  if (supabaseUrl.protocol !== 'https:' || !supabaseUrl.hostname.endsWith('.supabase.co') || supabaseUrl.pathname !== '/' || supabaseUrl.username || supabaseUrl.password || supabaseUrl.search || supabaseUrl.hash) throw new Error('AUDIT_SUPABASE_URL must be your HTTPS Supabase project origin.');
  const publicKey = required(env, 'AUDIT_SUPABASE_PUBLISHABLE_KEY');
  // Avoid accidentally shipping a service-role key through /api/config.
  let anon = false;
  try { anon = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role === 'anon'; } catch { /* Not a legacy JWT key. */ }
  if (!publicKey.startsWith('sb_publishable_') && !anon) throw new Error('Use a Supabase publishable key or legacy anon key, NEVER a secret/service_role key.');
  const admins = new Set(required(env, 'AUDIT_ADMIN_USER_IDS').split(',').map(x => x.trim()));
  if (![...admins].every(x => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x))) throw new Error('AUDIT_ADMIN_USER_IDS must contain Supabase Auth user UUIDs, separated by commas.');
  const databaseUrl = required(env, 'AUDIT_DATABASE_URL');
  const db = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(db.protocol)) throw new Error('AUDIT_DATABASE_URL must be a PostgreSQL connection URL.');
  // Explicit TLS verification must not be weakened by query-string sslmode flags.
  for (const name of [...db.searchParams.keys()]) if (/^ssl/i.test(name)) db.searchParams.delete(name);
  const stripeKey = env.AUDIT_STRIPE_READ_ONLY_KEY?.trim() || '';
  if (stripeKey && !/^rk_(test|live)_/.test(stripeKey)) throw new Error('Use an rk_test_ or rk_live_ restricted Stripe READ-ONLY key; do not use an unrestricted secret key.');
  const stripeAccount = stripeKey ? required(env, 'AUDIT_STRIPE_ACCOUNT_ID') : '';
  if (stripeKey && !/^acct_[A-Za-z0-9]+$/.test(stripeAccount)) throw new Error('AUDIT_STRIPE_ACCOUNT_ID must be an acct_ identifier.');
  const port = Number(env.PORT || 4242);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { supabaseUrl: supabaseUrl.origin, publicKey, admins, databaseUrl: db.toString(),
    databaseCa: env.AUDIT_DATABASE_CA_PEM || '', stripeKey, stripeAccount, port };
}

// Validate the token with Supabase, then authorize the verified user ID. Never
// trust a user ID, email, admin flag, or JWT payload sent by the browser alone.
export async function authorize(token, config, request = fetch) {
  if (!token) return false;
  const response = await request(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.publicKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return false;
  const user = await response.json();
  return typeof user.id === 'string' && config.admins.has(user.id);
}

export async function readLedger(pool) {
  const blocks = {};
  // Separate bounded, read-only transactions let a missing legacy table produce
  // an explicit unavailable block rather than a misleading zero. These blocks
  // are not a single atomic snapshot. No raw user/customer rows are returned.
  for (const [name, sql] of Object.entries(QUERIES)) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const result = await client.query(sql);
      await client.query('ROLLBACK');
      blocks[name] = { status: 'unverified_ledger', rows: result.rows };
    } catch {
      await client.query('ROLLBACK').catch(() => {});
      blocks[name] = { status: 'unavailable', error: 'Cannot read this table. Check schema and read-only role permissions; do not treat missing data as zero.' };
    } finally { client.release(); }
  }
  return blocks;
}

export function usdFromMinorUnits(value) {
  // Keep large amounts exact; do not use floating point for financial values.
  if (!Number.isSafeInteger(value)) throw new Error('Stripe returned an unsafe amount.');
  const n = BigInt(value); const abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export async function readStripe(config, request = fetch) {
  if (!config.stripeKey) return { status: 'not_configured', message: 'Stripe evidence is unavailable until a restricted read-only key and account ID are configured. This does NOT mean zero.' };
  // Fixed READ endpoints only. No charges, transfers, payouts, or mutations.
  const get = async path => {
    const response = await request(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${config.stripeKey}`, 'Stripe-Version': API_VERSION },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Stripe read failed. Check restricted-key READ permissions and the account selection.');
    return response.json();
  };
  const account = await get('account');
  if (account.id !== config.stripeAccount) throw new Error('Stripe key belongs to a different account than AUDIT_STRIPE_ACCOUNT_ID.');
  const balance = await get('balance');
  const sum = rows => usdFromMinorUnits((rows || []).filter(x => x.currency === 'usd').reduce((s, x) => s + x.amount, 0));
  return { status: 'provider_confirmed', accountId: account.id, livemode: balance.livemode,
    availableUsd: sum(balance.available), pendingUsd: sum(balance.pending), checkedAt: new Date().toISOString(),
    scope: 'USD balance only. Does not reconcile individual ledger entries or prove payout eligibility.' };
}
