// Dependency-free, mocked tests: no external services, keys, or writes are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize, configFromEnv, readLedger, readStripe, usdFromMinorUnits, QUERIES, API_VERSION } from './core.mjs';
import { makeServer } from './server.mjs';
const uid = '11111111-1111-4111-8111-111111111111';
const config = { supabaseUrl: 'https://example.supabase.co', publicKey: 'sb_publishable_example',
  admins: new Set([uid]), stripeKey: '', stripeAccount: '' };
const goodEnv = { AUDIT_SUPABASE_URL: config.supabaseUrl, AUDIT_SUPABASE_PUBLISHABLE_KEY: config.publicKey,
  AUDIT_ADMIN_USER_IDS: uid, AUDIT_DATABASE_URL: 'postgresql://reader:unused@database.example/db' };

test('configuration requires all access placeholders and rejects secret browser keys', () => {
  for (const name of Object.keys(goodEnv)) assert.throws(() => configFromEnv({ ...goodEnv, [name]: '' }), new RegExp(name));
  assert.throws(() => configFromEnv({ ...goodEnv, AUDIT_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' }));
  const serviceRole = ['e30', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'fake'].join('.');
  assert.throws(() => configFromEnv({ ...goodEnv, AUDIT_SUPABASE_PUBLISHABLE_KEY: serviceRole }));
  assert.throws(() => configFromEnv({ ...goodEnv, AUDIT_STRIPE_READ_ONLY_KEY: 'sk_live_example' }));
  assert.throws(() => configFromEnv({ ...goodEnv, AUDIT_ADMIN_USER_IDS: 'anyone' }));
  assert.equal(configFromEnv(goodEnv).admins.has(uid), true);
  assert.equal(new URL(configFromEnv({ ...goodEnv, AUDIT_DATABASE_URL: goodEnv.AUDIT_DATABASE_URL + '?sslmode=disable' }).databaseUrl).search, '');
});

test('authorize verifies Supabase identity and checks explicit UUID allowlist', async () => {
  let calls = 0;
  const verify = async (url, options) => { calls++; assert.match(url, /\/auth\/v1\/user$/); assert.equal(options.headers.Authorization, 'Bearer token'); return { ok: true, json: async () => ({ id: uid }) }; };
  assert.equal(await authorize('', config, verify), false); assert.equal(calls, 0);
  assert.equal(await authorize('token', config, verify), true);
  assert.equal(await authorize('token', config, async () => ({ ok: true, json: async () => ({ id: 'not-allowlisted' }) })), false);
  assert.equal(await authorize('token', config, async () => ({ ok: false })), false);
});

test('ledger reads use fixed SELECT SQL in read-only transactions and retain decimal strings', async () => {
  const seen = []; let released = 0;
  const pool = { connect: async () => ({ query: async sql => { seen.push(sql); return { rows: [{ recorded_total: '100000000000.01' }] }; }, release: () => released++ }) };
  const result = await readLedger(pool);
  assert.equal(released, Object.keys(QUERIES).length);
  assert.equal(seen.filter(x => x === 'BEGIN TRANSACTION READ ONLY').length, released);
  assert.ok(Object.values(QUERIES).every(x => /^SELECT\b/.test(x)));
  assert.ok(!seen.some(x => /\b(INSERT|UPDATE|DELETE|CREATE|DROP)\b/.test(x)));
  assert.equal(result.earnings.rows[0].recorded_total, '100000000000.01');
  assert.ok(Object.values(result).every(x => x.status === 'unverified_ledger'));
});

test('missing table remains unavailable, never a fabricated zero', async () => {
  const pool = { connect: async () => ({ query: async sql => { if (sql === QUERIES.earnings) throw new Error('private SQL error'); return { rows: [] }; }, release() {} }) };
  const result = await readLedger(pool);
  assert.equal(result.earnings.status, 'unavailable'); assert.equal(result.earnings.rows, undefined);
  assert.ok(!JSON.stringify(result).includes('private SQL error'));
  assert.equal(result.storage.status, 'unverified_ledger');
});

test('Stripe disabled is not zero; enabled reads verify account and pin API version', async () => {
  assert.equal((await readStripe(config, () => { throw new Error('must not call'); })).status, 'not_configured');
  const stripeConfig = { ...config, stripeKey: 'rk_test_example', stripeAccount: 'acct_example' }; const seen = [];
  const request = async (url, options) => {
    seen.push(url); assert.equal(options.headers['Stripe-Version'], API_VERSION); assert.equal(options.method, undefined);
    return { ok: true, json: async () => url.endsWith('/account') ? { id: 'acct_example' } : {
      livemode: false, available: [{ currency: 'usd', amount: 1999 }, { currency: 'eur', amount: 100 }], pending: [{ currency: 'usd', amount: -1 }],
    } };
  };
  const result = await readStripe(stripeConfig, request);
  assert.equal(result.availableUsd, '19.99'); assert.equal(result.pendingUsd, '-0.01'); assert.equal(result.livemode, false);
  assert.deepEqual(seen, ['https://api.stripe.com/v1/account', 'https://api.stripe.com/v1/balance']);
  await assert.rejects(readStripe({ ...stripeConfig, stripeAccount: 'acct_wrong' }, request), /different account/);
  assert.equal(usdFromMinorUnits(50), '0.50'); assert.throws(() => usdFromMinorUnits(Number.MAX_SAFE_INTEGER + 1));
});

async function fixture(t, options = {}) {
  const calls = { ledger: 0, stripe: 0 };
  const server = makeServer(config, {
    authorize: async token => token === 'allowed',
    readLedger: async () => { calls.ledger++; if (options.fail) throw new Error('secret postgres password'); return { earnings: { status: 'unverified_ledger', rows: [] } }; },
    readStripe: async () => { calls.stripe++; if (options.fail) throw new Error('secret stripe key'); return { status: 'not_configured', message: 'Not configured' }; },
  });
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { calls, request: (path, init) => fetch(url + path, init) };
}

test('HTTP API denies anonymous users and all mutations before reading financial data', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/reconciliation')).status, 403);
  assert.equal((await f.request('/api/reconciliation', { headers: { Authorization: 'Bearer denied' } })).status, 403);
  assert.equal((await f.request('/api/reconciliation', { method: 'POST', headers: { Authorization: 'Bearer allowed' } })).status, 405);
  assert.equal(f.calls.ledger, 0); assert.equal(f.calls.stripe, 0);
  const publicConfig = await (await f.request('/api/config')).json();
  assert.deepEqual(Object.keys(publicConfig).sort(), ['publishableKey', 'supabaseUrl']);
  const response = await f.request('/api/reconciliation', { headers: { Authorization: 'Bearer allowed' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).stripe.status, 'not_configured');
  assert.equal(f.calls.ledger, 1); assert.equal(f.calls.stripe, 1);
  assert.equal((await f.request('/cashout')).status, 404);
});

test('HTTP evidence failures stay unavailable and do not expose secrets', async t => {
  const f = await fixture(t, { fail: true });
  const data = await (await f.request('/api/reconciliation', { headers: { Authorization: 'Bearer allowed' } })).json();
  assert.equal(data.ledger.status, 'unavailable'); assert.equal(data.stripe.status, 'unavailable');
  assert.equal(data.stripe.availableUsd, undefined); assert.ok(!JSON.stringify(data).includes('secret'));
});
