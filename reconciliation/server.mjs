import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { authorize, configFromEnv, readLedger, readStripe } from './core.mjs';

export function makeServer(config, dependencies) {
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/dashboard.js', ['dashboard.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ].map(([url, [name, type]]) => [url, { type, content: readFileSync(new URL(`./public/${name}`, import.meta.url)) }]));
  let pendingSnapshot;
  const rates = new Map();
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `default-src 'self'; connect-src 'self' ${config.supabaseUrl}; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      // Never trust X-Forwarded-For from arbitrary clients. Render's proxy may
      // share one IP; this coarse limiter is a guard, not a production WAF.
      const now = Date.now();
      for (const [key, value] of rates) if (value.until < now) rates.delete(key);
      const ip = req.socket.remoteAddress;
      if (!rates.has(ip) && rates.size >= 1024) return json(429, { error: 'Rate limit capacity reached. Retry shortly.' });
      const rate = rates.get(ip) || { count: 0, until: now + 60000 }; rates.set(ip, rate);
      if (++rate.count > 120) return json(429, { error: 'Too many requests. Retry in a minute.' });
      // There are no mutation endpoints. Password sign-in goes DIRECTLY to
      // Supabase Auth; this server never accepts or stores a password.
      if (req.method !== 'GET') return json(405, { error: 'Read-only service: only GET is supported.' });
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/health') return json(200, { status: 'ok', mode: 'read_only' });
      if (files.has(path)) { const file = files.get(path); res.writeHead(200, { 'Content-Type': file.type }); return res.end(file.content); }
      if (path === '/api/config') return json(200, { supabaseUrl: config.supabaseUrl, publishableKey: config.publicKey });
      if (path !== '/api/reconciliation') return json(404, { error: 'Not found.' });
      const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
      if (!(await dependencies.authorize(token))) return json(403, { error: 'Sign in with an allowlisted Supabase administrator account.' });
      // Share only an IN-FLIGHT read among authorized admins. No financial
      // snapshot is persisted, and every new completed refresh reads again.
      if (!pendingSnapshot) pendingSnapshot = (async () => {
        const [ledger, stripe] = await Promise.allSettled([dependencies.readLedger(), dependencies.readStripe()]);
        return { checkedAt: new Date().toISOString(),
          ledger: ledger.status === 'fulfilled' ? ledger.value : { status: 'unavailable', error: 'Database read failed. Check the read-only connection; no data was changed.' },
          stripe: stripe.status === 'fulfilled' ? stripe.value : { status: 'unavailable', message: 'Stripe verification failed. Check account selection and restricted-key permissions; do not assume a zero balance.' },
          warning: 'Ledger values are not cash. Do not add balances, earnings and transfer requests together. Verify provider evidence before any withdrawal.' };
      })().finally(() => { pendingSnapshot = null; });
      return json(200, await pendingSnapshot);
    } catch {
      // Do not echo database DSNs, JWTs, passwords, provider responses or SQL
      // errors into the browser or logs. Fail closed if auth is unavailable.
      json(503, { error: 'Read-only service temporarily unavailable. No changes were made.' });
    }
  });
}

// Importing this file in tests never starts a server or connects to a database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configFromEnv(process.env);
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2,
      connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
      ssl: { rejectUnauthorized: true, ...(config.databaseCa ? { ca: config.databaseCa } : {}) } });
    pool.on('error', () => console.error('Read-only database connection unavailable.'));
    const server = makeServer(config, {
      authorize: token => authorize(token, config), readLedger: () => readLedger(pool),
      readStripe: () => readStripe(config),
    });
    server.listen(config.port, '0.0.0.0', () => console.log(`Read-only reconciliation dashboard listening on PORT ${config.port}.`));
    process.once('SIGTERM', () => server.close(() => pool.end()));
  } catch (error) { console.error(`Dashboard configuration error: ${error.message}`); process.exitCode = 1; }
}
