// Signed Stripe events may arrive before an HTTP response or out of order.
export async function payoutState(stripe, event) {
 if (!event.account || !['payout.created','payout.updated','payout.paid','payout.failed','payout.canceled'].includes(event.type)) return null;
 const p=await stripe.payouts.retrieve(event.data.object.id,{}, {stripeAccount:event.account});
 return {id:p.id,account:event.account,status:p.status,requestId:p.metadata?.withdrawal_request_id || ''};
}
export function checkoutReceipt(session,intent) {
 const charge=typeof intent.latest_charge==='object'?intent.latest_charge:null;
 const balance=typeof charge?.balance_transaction==='object'?charge.balance_transaction:null;
 // Fresh charge state catches a refund/dispute that preceded receipt insertion.
 // Unknown processing fees remain NULL, never a fabricated zero.
 return [session.id,intent.id,'marketplace',session.metadata.connected_account_id,null,session.amount_total,session.currency,intent.application_fee_amount||0,balance?.fee??null,charge?.amount_refunded||0,!!(charge?.disputed||charge?.amount_refunded)];
}
