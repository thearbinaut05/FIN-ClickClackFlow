// Pure UI rules shared by the browser and offline tests.
export function disabled({busy=false,unavailable=false,requiresAuth=false,signedIn=false,enabled=true}={}) {return busy || unavailable || !enabled || (requiresAuth && !signedIn);}
export function priceLabel(amount,currency) {
 if (!Number.isSafeInteger(amount) || !['usd','eur','gbp'].includes(currency)) return 'Price not supported in this demo';
 return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(amount/100);
}
export function stripeUrl(url,kind) {
 const u=new URL(url),host=kind==='onboarding'?'connect.stripe.com':kind==='portal'?'billing.stripe.com':'checkout.stripe.com';
 if (u.protocol!=='https:'||u.hostname!==host||u.username||u.password) throw new Error('Unexpected provider redirect blocked.');return u.href;
}
