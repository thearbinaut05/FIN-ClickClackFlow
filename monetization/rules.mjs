import { createHmac, timingSafeEqual } from 'node:crypto';
export const API_VERSION = '2026-09-30.endive';
export class HttpError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function required(value, name) {
  if (!value || /REPLACE_ME|PLACEHOLDER|your_.*key/i.test(value)) throw new HttpError(`Missing ${name}. Fill monetization/.env from .env.example; never commit credentials.`, 503);
  return value;
}
export function origin(value) {
  let u; try { u = new URL(required(value, 'MONETIZATION_URL')); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError('MONETIZATION_URL must be an absolute origin.', 503); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash || (u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw new HttpError('Use an HTTPS origin, or HTTP localhost, without path/query/credentials.', 503);
  return u.origin;
}
export function config(env) {
  const key = required(env.MONETIZATION_STRIPE_KEY, 'MONETIZATION_STRIPE_KEY');
  if (!key.startsWith('sk_test_')) throw new HttpError('Live/restricted keys are blocked. Use a PLATFORM sk_test_ key for this test-only release.', 503);
  const supabaseUrl = new URL(required(env.MONETIZATION_SUPABASE_URL, 'MONETIZATION_SUPABASE_URL'));
  if (supabaseUrl.protocol !== 'https:' || !supabaseUrl.hostname.endsWith('.supabase.co') || supabaseUrl.pathname !== '/' || supabaseUrl.username || supabaseUrl.password || supabaseUrl.search || supabaseUrl.hash) throw new HttpError('Use your HTTPS Supabase project origin.', 503);
  const publicKey = required(env.MONETIZATION_SUPABASE_PUBLIC_KEY, 'MONETIZATION_SUPABASE_PUBLIC_KEY');
  let anon = false; try { anon = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url')).role === 'anon'; } catch { /* modern publishable key */ }
  if (!publicKey.startsWith('sb_publishable_') && !anon) throw new HttpError('Supabase key must be PUBLIC publishable/anon, never service_role.', 503);
  const admins = required(env.MONETIZATION_ADMIN_IDS, 'MONETIZATION_ADMIN_IDS').split(',').map(v => v.trim());
  if (!admins.every(v => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v))) throw new HttpError('MONETIZATION_ADMIN_IDS must contain Supabase Auth UUIDs.', 503);
  const database = new URL(required(env.MONETIZATION_DATABASE_URL, 'MONETIZATION_DATABASE_URL'));
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new HttpError('Database URL must be PostgreSQL.', 503);
  // Prevent URL SSL flags overriding explicit TLS verification in pg.
  for (const k of [...database.searchParams.keys()]) if (/^ssl/i.test(k)) database.searchParams.delete(k);
  const bps = Number(env.MONETIZATION_FEE_BPS ?? 1000);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new HttpError('MONETIZATION_FEE_BPS must be 0–10000.', 503);
  const country = (env.MONETIZATION_COUNTRY || 'US').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError('Country must be a two-letter code.', 503);
  const port = Number(env.PORT || 4243);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError('PORT must be 1–65535.', 503);
  return { key, baseUrl: origin(env.MONETIZATION_URL), supabaseUrl: supabaseUrl.origin, publicKey, admins, databaseUrl: database.href, databaseCa: env.MONETIZATION_DATABASE_CA || '', bps, country, port, host: env.HOST || '127.0.0.1', payouts: env.MONETIZATION_TEST_PAYOUTS === 'true', premium: env.MONETIZATION_PREMIUM_ENABLED === 'true', premiumPrice: env.MONETIZATION_PREMIUM_PRICE_ID || '', webhookSecret: env.MONETIZATION_WEBHOOK_SECRET || '', connectSecret: env.MONETIZATION_CONNECT_WEBHOOK_SECRET || '', partnerSecret: env.MONETIZATION_PARTNER_HMAC_SECRET || '', partnerApproved: env.MONETIZATION_PARTNER_APPROVED === 'true', affiliateLinks: affiliateLinks(env.MONETIZATION_AFFILIATE_LINKS || '[]') };
}
export function text(value, name, max = 120, optional = false) {
  if (optional && (value == null || value === '')) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
export function uuid(value) { if (!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value || '')) throw new HttpError('A UUID v4 requestId is required.'); return value; }
export function money(value) {
  // USD/EUR/GBP only: integer parsing, not floating-point dollar multiplication.
  if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(value)) throw new HttpError('Price must be a decimal string, e.g. 19.99.');
  const [major, fraction = ''] = value.split('.'); const amount = Number(major) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount < 50 || amount > 99999999) throw new HttpError('Price must be 0.50–999999.99.'); return amount;
}
export function accountParams(userId, name, country) {
  return { country, business_profile: { name },
    // ONLY controller properties for account classification; NEVER top-level type.
    controller: { fees: { payer: 'application' }, losses: { payments: 'application' }, stripe_dashboard: { type: 'express' } },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    // Manual schedule makes test payout controls unambiguous; do not silently
    // alter an existing seller account's payout schedule during deployment.
    settings: { payouts: { schedule: { interval: 'manual' } } },
    metadata: { verified_monetization_user: userId, storefront_name: name } };
}
export function status(a) {
  // Caller always retrieves account from Stripe; never persist these statuses.
  return { id: a.id, name: a.business_profile?.name || a.metadata?.storefront_name || `Seller ${a.id.slice(-6)}`, detailsSubmitted: !!a.details_submitted, chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, transfersActive: a.capabilities?.transfers === 'active', currentlyDue: a.requirements?.currently_due || [], pendingVerification: a.requirements?.pending_verification || [], disabledReason: a.requirements?.disabled_reason || null,
    canSell: !!(a.details_submitted && a.charges_enabled && a.payouts_enabled && a.capabilities?.transfers === 'active' && !a.requirements?.disabled_reason) };
}
export function checkoutParams(product, price, account, body, c) {
  const n = body.quantity;
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new HttpError('Quantity must be an integer 1–10.');
  if (!product.active || product.deleted || !price || !price.active || price.deleted || price.type !== 'one_time' || !Number.isSafeInteger(price.unit_amount) || price.unit_amount < 50 || !['usd', 'eur', 'gbp'].includes(price.currency)) throw new HttpError('An active supported one-time platform price is required.');
  if (product.metadata?.connected_account_id !== account.id || !status(account).canSell) throw new HttpError('Seller mapping is missing or seller is not ready.', 409);
  const total = n * price.unit_amount; if (!Number.isSafeInteger(total) || total > 99999999) throw new HttpError('Order exceeds demo total limit.');
  const fee = Math.floor(total * c.bps / 10000);
  return { mode: 'payment', payment_method_types: ['card'], line_items: [{ price: price.id, quantity: n }],
    payment_intent_data: { application_fee_amount: fee, transfer_data: { destination: account.id } },
    metadata: { integration: 'verified_v1', product_id: product.id, connected_account_id: account.id, fee_minor: String(fee) },
    success_url: `${c.baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${c.baseUrl}/storefront?canceled=1` };
}
export async function allPages(list, params = {}) {
  const items = []; let cursor;
  while (true) { const page = await list({ ...params, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }); items.push(...page.data); if (!page.has_more) return items; if (!page.data.length || page.data.at(-1).id === cursor) throw new HttpError('Invalid provider pagination.', 502); cursor = page.data.at(-1).id; }
}
export const PROVIDERS = Object.freeze([
  { id: 'stripe_connect', name: 'Stripe Connect', capability: 'test_checkout_and_seller_payouts' },
  { id: 'stripe_billing', name: 'Stripe Billing', capability: 'optional_platform_subscriptions' },
  { id: 'impact', name: 'impact.com', capability: 'approved_affiliate_links_only' },
  { id: 'awin', name: 'Awin', capability: 'approved_affiliate_links_only' },
  { id: 'cj', name: 'CJ Affiliate', capability: 'approved_affiliate_links_only' },
  { id: 'partnerstack', name: 'PartnerStack', capability: 'approved_affiliate_links_only' },
  { id: 'amazon', name: 'Amazon Associates', capability: 'approved_affiliate_links_only' },
  { id: 'sovrn', name: 'Sovrn Commerce', capability: 'approved_affiliate_links_only' },
  { id: 'partner_hmac', name: 'Direct sponsor/partner', capability: 'signed_pending_conversion_receipts' },
  { id: 'adsense', name: 'Google AdSense', capability: 'not_implemented_provider_approval_and_policy_review_required' },
  { id: 'propellerads', name: 'PropellerAds', capability: 'not_implemented_provider_approval_and_policy_review_required' },
  { id: 'offertoro', name: 'OfferToro', capability: 'not_implemented_provider_specific_signature_adapter_required' }
]);
export function affiliateLinks(raw) {
  let links; try { links = JSON.parse(raw); } catch { throw new HttpError('MONETIZATION_AFFILIATE_LINKS must be a JSON array.', 503); }
  if (!Array.isArray(links) || links.length > 100) throw new HttpError('Affiliate links must be an array of at most 100 approved placements.', 503);
  return links.map(l => {
    const p = PROVIDERS.find(p => p.id === l.provider && p.capability === 'approved_affiliate_links_only');
    let u; try { u = new URL(l.url); } catch { throw new HttpError('Affiliate URL must be absolute HTTPS.', 503); }
    if (!p || l.approved !== true || u.protocol !== 'https:' || u.username || u.password || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) throw new HttpError('Affiliate placement requires provider approval and a public HTTPS URL.', 503);
    return { provider: p.id, name: text(l.name, 'Offer name'), url: u.href, disclosure: 'Affiliate link: the platform may earn a commission. Provider terms apply.' };
  });
}
export function verifyPartner(raw, signature, timestamp, secret, now = Date.now()) {
  // This is a documented FIRST-PARTY HMAC contract, NOT a claim that arbitrary
  // affiliate/offerwall networks use this signature format. Those need adapters.
  required(secret, 'MONETIZATION_PARTNER_HMAC_SECRET');
  const t = Number(timestamp); if (!Number.isInteger(t) || Math.abs(now / 1000 - t) > 300 || !/^[a-f\d]{64}$/i.test(signature || '')) throw new HttpError('Invalid or expired partner signature.', 401);
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new HttpError('Invalid partner signature.', 401);
}
