/** Legacy compatibility facade. No verified provider-backed ledger is wired here.
 * Fail closed: browser storage and fabricated IDs are never money or payouts.
 */
interface RevenueTransaction {
  id: string; amount: number; status: 'pending' | 'completed' | 'failed';
  user_id: string; created_at: string; metadata?: Record<string, unknown>;
}
interface PaymentIntentRequest {
  amount: number; currency: string; user_id: string; email?: string;
  metadata?: Record<string, unknown>;
}
interface PaymentIntentResponse {
  id: string; amount: number; status: string; client_secret?: string; error?: string;
}
const UNVERIFIED = 'Payment integration unavailable: no authenticated, provider-verified ledger is configured.';
export class LovableCloudService {
  private static instance: LovableCloudService;
  static getInstance(): LovableCloudService {
    if (!this.instance) this.instance = new LovableCloudService();
    return this.instance;
  }
  async getRevenueBalance(_userId: string): Promise<number> {
    throw new Error(UNVERIFIED);
  }
  async createPaymentIntent(_request: PaymentIntentRequest): Promise<PaymentIntentResponse> {
    throw new Error(UNVERIFIED);
  }
  async processCashout(_userId: string, _amount: number, _email: string): Promise<{
    success: boolean; transaction_id?: string; error?: string;
  }> {
    return { success: false, error: UNVERIFIED };
  }
  async getRevenueTransactions(_userId: string, _limit = 50): Promise<RevenueTransaction[]> {
    throw new Error(UNVERIFIED);
  }
  async healthCheck(): Promise<boolean> { return false; }
}
export default LovableCloudService;
