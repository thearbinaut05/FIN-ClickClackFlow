// Retired unsafe alternate path. Fail closed rather than claiming a mock payout.
export interface CashoutRequest { userId:string; coins:number; amountUSD:number; payoutType?:'instant_card'|'bank_account'|'email'; email?:string; accountId?:string; metadata?:Record<string,unknown> }
export interface CashoutResponse { success:boolean; transactionId?:string; stripeTransferId?:string; message?:string; error?:string; details?:unknown }
export async function processRealCashout(_request:CashoutRequest):Promise<CashoutResponse>{return{success:false,error:'Legacy cashout is disabled. Use authenticated provider-funded seller payouts via /revenue; game coins are not cash.'};}
export default {processRealCashout};
