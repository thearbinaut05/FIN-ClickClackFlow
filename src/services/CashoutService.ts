/* Legacy game cashouts are intentionally retired: browser-managed coins and
   simulated revenue must never authorize withdrawals or report payment success. */
interface CashoutRequest { userId: string; coins: number; payoutType: string; email: string; metadata?: Record<string, unknown> }
interface CashoutResponse { success: boolean; error?: string; details?: Record<string, unknown>; message?: string; isReal?: boolean; autonomous_revenue_balance?: number; source?: 'cashout_server'|'lovable_cloud'|'demo_mode'|'fallback'; transaction_id?: string }
export class CashoutService {
 private static instance: CashoutService;
 static getInstance(){ return CashoutService.instance ||= new CashoutService(); }
 async processCashout(_request: CashoutRequest): Promise<CashoutResponse>{ return {success:false,isReal:false,error:'Game coins and estimated ad revenue cannot be redeemed as cash. Use verified seller earnings and authenticated payouts in /revenue.'}; }
 async testCashout(_email?:string,_coins?:number){return this.processCashout({userId:'',coins:0,payoutType:'',email:''});}
 async getRevenueBalance(_userId:string){throw new Error('Legacy balance is not verified cash. Open /revenue for provider-confirmed seller funds.');}
 async getRevenueTransactions(_userId:string,_limit?:number){throw new Error('Use the private verified revenue ledger, not demo transactions.');}
 async checkServiceHealth(){return false;}
 async recoverFailedTransactions(){return{success:false,error:'Automatic legacy recovery is disabled. Reconcile provider IDs before retrying money movement.',recoveredAmount:0,failedAmount:0};}
}
export default CashoutService;
