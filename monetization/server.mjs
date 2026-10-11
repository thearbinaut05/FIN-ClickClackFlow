import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import Stripe from 'stripe';
import pg from 'pg';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { API_VERSION, HttpError, config, required, text, uuid, money, accountParams, status, checkoutParams, allPages, PROVIDERS, verifyPartner } from './rules.mjs';
import { payoutState, checkoutReceipt } from './lifecycle.mjs';

// Injected provider/database dependencies allow offline HTTP tests; imports never
// start a server, touch a database, or move funds.
export function makeApp(c,stripe,pool,request=fetch) {
 const app=express();app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'",c.supabaseUrl],formAction:["'self'"],frameAncestors:["'none'"]}}}));
 app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}));
 const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 const tx=async fn=>{const db=await pool.connect();try{await db.query('BEGIN');const r=await fn(db);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}};
 const user=async req=>{
  const token=/^Bearer (\S+)$/i.exec(req.headers.authorization||'')?.[1];if(!token)throw new HttpError('Sign in first.',401);
  const r=await request(`${c.supabaseUrl}/auth/v1/user`,{headers:{apikey:c.publicKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new HttpError('Sign-in session expired or invalid.',401);
  const u=await r.json();if(!/^[a-f\d-]{36}$/i.test(u.id||''))throw new HttpError('Invalid authenticated user.',401);return u;
 };
 const admin=async req=>{const u=await user(req);if(!c.admins.includes(u.id))throw new HttpError('Administrator access required.',403);return u;};
 const mapping=async id=>(await pool.query('SELECT * FROM monetization_users WHERE user_id=$1',[id])).rows[0];
 const owned=async req=>{const u=await user(req),m=await mapping(u.id);if(!m?.account_id)throw new HttpError('Create a connected seller account first.',409);return{u,m};};

 // Verify untouched RAW webhook bytes before JSON middleware. The success page
 // never fulfills orders or proves payout settlement.
 const webhook=connect=>route(async(req,res)=>{
  const secret=required(connect?c.connectSecret:c.webhookSecret,connect?'MONETIZATION_CONNECT_WEBHOOK_SECRET':'MONETIZATION_WEBHOOK_SECRET');
  let e;try{e=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],secret);}catch{throw new HttpError('Invalid Stripe signature.');}
  if(e.livemode)throw new HttpError('Live events are blocked in this release.');
  if(!!e.account!==connect)throw new HttpError('Wrong platform/Connect webhook endpoint.');
  const o=e.data.object;let receipt,subscription;
  // Re-fetch payout status to prevent a late pending event reverting paid status.
  const payout=connect?await payoutState(stripe,e):null;
  if(!connect&&['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type)&&o.metadata?.integration==='verified_v1'&&o.mode==='payment'&&o.payment_status==='paid'){
   const pi=await stripe.paymentIntents.retrieve(typeof o.payment_intent==='string'?o.payment_intent:o.payment_intent.id,{expand:['latest_charge.balance_transaction']});
   receipt=checkoutReceipt(o,pi);
  }
  if(!connect&&['invoice.paid','customer.subscription.updated','customer.subscription.deleted'].includes(e.type)){
   const sid=e.type==='invoice.paid'?o.parent?.subscription_details?.subscription:o.id;
   if(sid){const sub=await stripe.subscriptions.retrieve(typeof sid==='string'?sid:sid.id);
    if(sub.metadata?.integration==='verified_premium_v1'){
     subscription={id:sub.id,userId:sub.metadata.user_id,status:sub.status,end:sub.items.data[0]?.current_period_end||null};
     if(e.type==='invoice.paid')receipt=[o.id,null,'premium',null,subscription.userId,o.amount_paid,o.currency,o.amount_paid,null,0,false];
    }
   }
  }
  // Event ID and all accounting writes commit together; failed writes roll back
  // the deduplication marker so Stripe can retry. Session ID also deduplicates.
  await tx(async db=>{
   const r=await db.query('INSERT INTO monetization_events(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id',[e.id]);if(!r.rowCount)return;
   if(receipt)await db.query('INSERT INTO monetization_receipts(receipt_id,payment_intent_id,kind,account_id,user_id,gross_minor,currency,commission_minor,processing_fee_minor,refunded_minor,needs_review) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING',receipt);
   if(subscription)await db.query('INSERT INTO monetization_subscriptions(subscription_id,user_id,status,paid_through) VALUES($1,$2,$3,to_timestamp($4)) ON CONFLICT(subscription_id) DO UPDATE SET status=$3,paid_through=to_timestamp($4),updated_at=now()',[subscription.id,subscription.userId,subscription.status,subscription.end]);
   if(!connect&&['charge.refunded','charge.dispute.created'].includes(e.type)){
    const pi=e.type==='charge.refunded'?o.payment_intent:(await stripe.charges.retrieve(typeof o.charge==='string'?o.charge:o.charge.id)).payment_intent;
    await db.query('UPDATE monetization_receipts SET needs_review=true,refunded_minor=GREATEST(refunded_minor,$2) WHERE payment_intent_id=$1',[pi,e.type==='charge.refunded'?o.amount_refunded:0]);
    // Transfer reversals/application-fee refunds require explicit operational
    // reconciliation. Never silently label post-refund income as net profit.
   }
   // Request metadata lets an early webhook find the reserved row before the
   // HTTP payout response has written payout_id. Also enforce account ownership.
   if(payout)await db.query('UPDATE monetization_withdrawals SET payout_id=$1,status=$3,updated_at=now() WHERE account_id=$2 AND (payout_id=$1 OR request_id::text=$4)',[payout.id,payout.account,payout.status,payout.requestId]);
  });res.json({received:true});
 });
 app.post('/webhooks/stripe',express.raw({type:'application/json',limit:'1mb'}),webhook(false));
 app.post('/webhooks/connect',express.raw({type:'application/json',limit:'1mb'}),webhook(true));
 app.post('/webhooks/partner',express.raw({type:'application/json',limit:'16kb'}),route(async(req,res)=>{
  if(!c.partnerApproved)throw new HttpError('Partner adapter is disabled pending approval.',503);
  if(c.partnerSecret.length<32)throw new HttpError('Partner HMAC secret needs at least 32 random characters.',503);
  verifyPartner(req.body,req.headers['x-partner-signature'],req.headers['x-partner-timestamp'],c.partnerSecret);
  let b;try{b=JSON.parse(req.body.toString());}catch{throw new HttpError('Invalid partner JSON.');}
  if(!b||typeof b!=='object'||Array.isArray(b))throw new HttpError('Partner payload must be an object.');
  const eventId=text(b.eventId,'Event ID'),conversionId=text(b.conversionId,'Conversion ID');
  if(!Number.isSafeInteger(b.amountMinor)||b.amountMinor<1||b.amountMinor>99999999||!['usd','eur','gbp'].includes(b.currency))throw new HttpError('Invalid conversion amount/currency.');
  await tx(async db=>{
   // Serialize conversion IDs before checking duplicates, including simultaneous
   // callbacks. Provider-signed conversion evidence is NOT settlement evidence.
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[conversionId]);
   const old=await db.query('SELECT * FROM monetization_partner_receipts WHERE event_id=$1 OR conversion_id=$2 FOR UPDATE',[eventId,conversionId]);
   if(old.rowCount){const r=old.rows[0];if(r.event_id!==eventId||r.conversion_id!==conversionId||Number(r.amount_minor)!==b.amountMinor||r.currency!==b.currency)throw new HttpError('Conflicting duplicate conversion.',409);return;}
   await db.query('INSERT INTO monetization_partner_receipts(event_id,conversion_id,amount_minor,currency) VALUES($1,$2,$3,$4)',[eventId,conversionId,b.amountMinor,b.currency]);
  });res.json({received:true,status:'pending_external_settlement',withdrawable:false});
 }));
 app.use(express.json({limit:'16kb'}));
 app.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==c.baseUrl)return next(new HttpError('Origin not allowed.',403));next();});
 app.get('/health',(req,res)=>res.json({status:'ok',mode:'test_only',version:API_VERSION}));
 app.get('/api/config',(req,res)=>res.json({supabaseUrl:c.supabaseUrl,publicKey:c.publicKey,premium:c.premium,payouts:c.payouts,feeBps:c.bps}));
 app.get('/api/connectors',(req,res)=>res.json({connectors:PROVIDERS.map(p=>({...p,status:p.id==='stripe_connect'?'test_mode':p.id==='stripe_billing'?c.premium?'test_mode':'disabled':p.id==='partner_hmac'?c.partnerApproved&&c.partnerSecret?'configured_pending_receipts_only':'disabled':c.affiliateLinks.some(l=>l.provider===p.id)?'approved_links_only':'not_configured'})),offers:c.affiliateLinks}));
 app.get('/api/catalog',route(async(req,res)=>{
  const[accounts,products]=await Promise.all([allPages(p=>stripe.accounts.list(p)),allPages(p=>stripe.products.list(p),{active:true,expand:['data.default_price']})]);
  const sellers=[];for(let i=0;i<accounts.length;i+=5)sellers.push(...await Promise.all(accounts.slice(i,i+5).map(async a=>status(await stripe.accounts.retrieve(a.id)))));
  res.json({accounts:sellers.map(({id,name,canSell})=>({id,name,canSell})),products:products.map(p=>{const price=typeof p.default_price==='object'?p.default_price:null;return{id:p.id,name:p.name,description:p.description,accountId:p.metadata.connected_account_id||null,amount:price?.unit_amount??null,currency:price?.currency||null,canBuy:!!(price?.active&&price.type==='one_time'&&price.unit_amount>=50&&['usd','eur','gbp'].includes(price.currency)&&sellers.some(a=>a.id===p.metadata.connected_account_id&&a.canSell))};})});
 }));
 app.get('/api/me',route(async(req,res)=>{
  const u=await user(req),m=await mapping(u.id),a=m?.account_id?await stripe.accounts.retrieve(m.account_id):null;
  const balance=a?await stripe.balance.retrieve({}, {stripeAccount:a.id}):null;
  const subs=await pool.query('SELECT status,paid_through FROM monetization_subscriptions WHERE user_id=$1',[u.id]);
  const payouts=await pool.query('SELECT request_id,amount_minor,currency,status,payout_id FROM monetization_withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',[u.id]);
  res.json({account:a?status(a):null,available:balance?.available||[],pending:balance?.pending||[],subscriptions:subs.rows,payouts:payouts.rows,gameCoinsWithdrawable:false});
 }));
 app.post('/api/seller/account',route(async(req,res)=>{
  const u=await user(req),name=text(req.body?.storeName,'Store name');
  const id=await tx(async db=>{
   // Lock the authenticated user; request user/account IDs are NEVER trusted.
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[u.id]);
   await db.query('INSERT INTO monetization_users(user_id,store_name) VALUES($1,$2) ON CONFLICT DO NOTHING',[u.id,name]);
   const m=(await db.query('SELECT * FROM monetization_users WHERE user_id=$1',[u.id])).rows[0];if(m.account_id)return m.account_id;
   const accounts=await allPages(p=>stripe.accounts.list(p));
   const a=accounts.find(a=>a.metadata?.verified_monetization_user===u.id)||await stripe.accounts.create(accountParams(u.id,m.store_name,c.country),{idempotencyKey:`verified-account-${u.id}`});
   await db.query('UPDATE monetization_users SET account_id=$2 WHERE user_id=$1',[u.id,a.id]);return a.id;
  });res.json({account:status(await stripe.accounts.retrieve(id))});
 }));
 app.post('/api/seller/onboarding',route(async(req,res)=>{
  const{m}=await owned(req);const link=await stripe.accountLinks.create({account:m.account_id,type:'account_onboarding',refresh_url:`${c.baseUrl}/connect?refresh=1`,return_url:`${c.baseUrl}/connect?returned=1`});res.json({url:link.url});
 }));
 app.post('/api/seller/products',route(async(req,res)=>{
  const{u,m}=await owned(req),b=req.body||{},currency=String(b.currency||'').toLowerCase();if(!['usd','eur','gbp'].includes(currency))throw new HttpError('USD/EUR/GBP only.');
  // No stripeAccount option: product/default price are PLATFORM objects.
  const p=await stripe.products.create({name:text(b.name,'Product name'),description:text(b.description,'Description',1000,true),default_price_data:{unit_amount:money(b.price),currency},metadata:{connected_account_id:m.account_id,verified_monetization_user:u.id}},{idempotencyKey:`verified-product-${u.id}-${uuid(b.requestId)}`});res.status(201).json({productId:p.id});
 }));
 app.post('/api/checkout',route(async(req,res)=>{
  const b=req.body||{},p=await stripe.products.retrieve(text(b.productId,'Product ID'),{expand:['default_price']});if(!p.metadata.connected_account_id)throw new HttpError('No seller mapped.');
  const a=await stripe.accounts.retrieve(p.metadata.connected_account_id);
  const s=await stripe.checkout.sessions.create(checkoutParams(p,typeof p.default_price==='object'?p.default_price:null,a,b,c),{idempotencyKey:`verified-checkout-${uuid(b.requestId)}`});if(!s.url)throw new HttpError('Hosted Checkout URL missing.',502);res.json({url:s.url});
 }));
 app.get('/api/checkout-status',route(async(req,res)=>{
  if(!/^cs_test_[A-Za-z0-9]+$/.test(req.query.session_id||''))throw new HttpError('Test Checkout Session ID required.');
  const s=await stripe.checkout.sessions.retrieve(req.query.session_id);if(!['verified_v1','verified_premium_v1'].includes(s.metadata?.integration))throw new HttpError('Unknown session.',404);res.json({paymentStatus:s.payment_status});
 }));
 app.post('/api/subscriptions',route(async(req,res)=>{
  if(!c.premium)throw new HttpError('Premium billing disabled until real benefits exist.',409);required(c.premiumPrice,'MONETIZATION_PREMIUM_PRICE_ID');const u=await user(req);
  const active=await pool.query("SELECT subscription_id FROM monetization_subscriptions WHERE user_id=$1 AND status IN ('active','trialing','past_due','incomplete')",[u.id]);if(active.rowCount)throw new HttpError('Existing subscription: use billing management.',409);
  const price=await stripe.prices.retrieve(c.premiumPrice);if(!price.active||price.type!=='recurring'||price.livemode)throw new HttpError('Active TEST recurring price required.',503);
  const s=await stripe.checkout.sessions.create({mode:'subscription',line_items:[{price:price.id,quantity:1}],payment_method_types:['card'],client_reference_id:u.id,metadata:{integration:'verified_premium_v1',user_id:u.id},subscription_data:{metadata:{integration:'verified_premium_v1',user_id:u.id}},success_url:`${c.baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${c.baseUrl}/connect`},{idempotencyKey:`verified-premium-${u.id}`});res.json({url:s.url});
 }));
 app.post('/api/billing-portal',route(async(req,res)=>{
  const u=await user(req),r=await pool.query('SELECT subscription_id FROM monetization_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1',[u.id]);if(!r.rowCount)throw new HttpError('No recorded subscription.',404);
  const sub=await stripe.subscriptions.retrieve(r.rows[0].subscription_id);if(sub.metadata.user_id!==u.id)throw new HttpError('Subscription ownership mismatch.',403);
  const p=await stripe.billingPortal.sessions.create({customer:typeof sub.customer==='string'?sub.customer:sub.customer.id,return_url:`${c.baseUrl}/connect`});res.json({url:p.url});
 }));
 app.post('/api/withdrawals',route(async(req,res)=>{
  if(!c.payouts)throw new HttpError('Payout execution disabled. Enable TEST payouts only after reconciliation/webhook tests.',409);
  const{u,m}=await owned(req),b=req.body||{},id=uuid(b.requestId),amount=money(b.amount),currency=String(b.currency||'');if(!['usd','eur','gbp'].includes(currency))throw new HttpError('Invalid payout currency.');
  const a=await stripe.accounts.retrieve(m.account_id);if(!a.payouts_enabled||a.requirements?.disabled_reason)throw new HttpError('Seller not eligible for payouts.',409);
  const row=await tx(async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[u.id]);const old=(await db.query('SELECT * FROM monetization_withdrawals WHERE request_id=$1',[id])).rows[0];
   if(old){if(old.user_id!==u.id||Number(old.amount_minor)!==amount||old.currency!==currency||old.account_id!==m.account_id)throw new HttpError('Conflicting idempotency token.',409);return old;}
   const balance=await stripe.balance.retrieve({}, {stripeAccount:m.account_id}),available=balance.available.filter(x=>x.currency===currency).reduce((s,x)=>s+x.amount,0);
   const reserved=await db.query("SELECT COALESCE(sum(amount_minor),0) AS amount FROM monetization_withdrawals WHERE user_id=$1 AND currency=$2 AND status IN ('reserved','submitted_unknown')",[u.id,currency]);
   if(available-Number(reserved.rows[0].amount)<amount)throw new HttpError('Insufficient provider-confirmed seller funds.',409);
   return(await db.query('INSERT INTO monetization_withdrawals(request_id,user_id,account_id,amount_minor,currency) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,u.id,m.account_id,amount,currency])).rows[0];
  });
  if(row.payout_id||!['reserved','submitted_unknown'].includes(row.status))return res.json({payoutId:row.payout_id,status:row.status});
  if(Date.now()-new Date(row.created_at).getTime()>23*3600000)throw new HttpError('Unresolved request too old to retry safely. Admin reconciliation required.',409);
  try{
   // Destination-charge proceeds already belong to seller. Never transfer from
   // platform AGAIN. Only draw this authenticated seller's own available balance.
   const p=await stripe.payouts.create({amount,currency,method:'standard',metadata:{withdrawal_request_id:id}},{stripeAccount:m.account_id,idempotencyKey:`verified-payout-${id}`});
   // A paid/failed webhook may already have arrived; do not downgrade it to pending.
   const r=await pool.query("UPDATE monetization_withdrawals SET payout_id=$2,status=CASE WHEN status IN ('paid','failed','canceled') THEN status ELSE $3 END,updated_at=now() WHERE request_id=$1 RETURNING status",[id,p.id,p.status]);res.json({payoutId:p.id,status:r.rows[0]?.status||p.status});
  }catch(e){const definitive=['StripeInvalidRequestError','StripePermissionError','StripeAuthenticationError'].includes(e.type);await pool.query('UPDATE monetization_withdrawals SET status=$2,updated_at=now() WHERE request_id=$1 AND payout_id IS NULL',[id,definitive?'failed':'submitted_unknown']);throw e;}
 }));
 app.get('/api/admin/revenue',route(async(req,res)=>{
  await admin(req);const ledger=await pool.query('SELECT kind,currency,count(*) AS receipts,sum(gross_minor) AS gross_minor,sum(commission_minor) AS commission_minor,sum(processing_fee_minor) AS known_processing_fee_minor,count(*) FILTER(WHERE processing_fee_minor IS NULL) AS missing_fee_receipts,sum(refunded_minor) AS refunded_minor,count(*) FILTER(WHERE needs_review) AS review_required FROM monetization_receipts GROUP BY kind,currency');
  const pending=await pool.query('SELECT currency,count(*) AS conversions,sum(amount_minor) AS amount_minor FROM monetization_partner_receipts GROUP BY currency'),balance=await stripe.balance.retrieve();
  res.json({ledger:ledger.rows,pendingPartnerConversions:pending.rows,platformAvailable:balance.available,platformPending:balance.pending,warning:'Gross receipts and pending conversions are NOT withdrawable profit. Platform balance can include seller liabilities, reserves, taxes and unrelated funds. No owner sweep implemented.'});
 }));
 const directory=fileURLToPath(new URL('./public/',import.meta.url));app.use(express.static(directory,{index:'index.html',etag:false}));for(const path of['/connect','/storefront','/success'])app.get(path,(req,res)=>res.sendFile(`${directory}/index.html`));
 app.use((req,res)=>res.status(404).json({error:'Not found.'}));app.use((e,req,res,next)=>{
  if(e instanceof HttpError)return res.status(e.status).json({error:e.message});if(e.type==='entity.too.large')return res.status(413).json({error:'Request body too large.'});if(e instanceof SyntaxError)return res.status(400).json({error:'Invalid JSON.'});
  console.error('Monetization request failed:',e.type||e.name||'server_error');res.status(503).json({error:'Provider/database failed. Check configuration, migration and eligibility; no demo success substituted.'});
 });return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{
 const c=config(process.env),stripe=new Stripe(c.key,{apiVersion:API_VERSION,maxNetworkRetries:2,timeout:20000});
 const pool=new pg.Pool({connectionString:c.databaseUrl,max:5,connectionTimeoutMillis:10000,ssl:{rejectUnauthorized:true,...(c.databaseCa?{ca:c.databaseCa}:{})}});pool.on('error',()=>console.error('Monetization database unavailable.'));
 const server=makeApp(c,stripe,pool).listen(c.port,c.host,()=>console.log(`TEST-ONLY monetization on ${c.host}:${c.port}; no automatic payouts.`));process.once('SIGTERM',()=>server.close(()=>pool.end()));
}catch(e){console.error(e.message);process.exitCode=1;}}
