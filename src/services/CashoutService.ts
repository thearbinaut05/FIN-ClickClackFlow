/**
 * Cashout Service with Real Payment Integration
 * Handles cashout requests using real Stripe payments via cashout-server.js
 * Fail-closed: never reports a payout without provider confirmation
 */

import { LovableCloudService } from './LovableCloudService';

interface CashoutRequest {
  userId: string;
  coins: number;
  payoutType: string;
  email: string;
  metadata?: Record<string, unknown>;
}

interface CashoutResponse {
  success: boolean;
  error?: string;
  details?: Record<string, unknown>;
  message?: string;
  isReal?: boolean;
  autonomous_revenue_balance?: number;
  source?: 'cashout_server' | 'lovable_cloud' | 'demo_mode' | 'fallback';
  transaction_id?: string;
}

export class CashoutService {
  private static instance: CashoutService;
  private lovableCloud: LovableCloudService;

  constructor() {
    this.lovableCloud = LovableCloudService.getInstance();
  }

  static getInstance(): CashoutService {
    if (!CashoutService.instance) {
      CashoutService.instance = new CashoutService();
    }
    return CashoutService.instance;
  }

  /**
   * Process cashout using real payment server or fallback to demo mode
   */
  async processCashout(request: CashoutRequest): Promise<CashoutResponse> {
    console.warn('Cashout blocked: no provider-settled earnings ledger is configured.', {
      userId: request.userId,
      coinCount: request.coins,
    });
    return {
      success: false,
      isReal: false,
      source: 'fallback',
      error: 'PAYOUTS_DISABLED_UNVERIFIED_LEDGER: no provider-settled earnings ledger and authenticated payout route are configured. No money was sent.',
    };
  }

  /**
   * Get revenue balance for user
   */
  async getRevenueBalance(userId: string): Promise<number> {
    try {
      return await this.lovableCloud.getRevenueBalance(userId);
    } catch (error) {
      console.error('Failed to get revenue balance:', error);
      return 0;
    }
  }

  /**
   * Get revenue transactions for user
   */
  async getRevenueTransactions(userId: string, limit: number = 50) {
    try {
      return await this.lovableCloud.getRevenueTransactions(userId, limit);
    } catch (error) {
      console.error('Failed to get revenue transactions:', error);
      return [];
    }
  }

  /**
   * Check Lovable Cloud service health
   */
  async checkServiceHealth(): Promise<boolean> {
    return await this.lovableCloud.healthCheck();
  }

  /**
   * Test the cashout service. This is intentionally fail-closed and never sends money.
   */
  async testCashout(email: string = 'test@example.com', coins: number = 100): Promise<CashoutResponse> {
    return this.processCashout({
      userId: 'test',
      coins: Math.max(100, coins),
      payoutType: 'email',
      email,
      metadata: { testRun: true, coinCount: coins },
    });
  }

  /**
   * Failed-transfer retries remain disabled until every request is reconciled
   * against provider-confirmed transactions and available funds.
   */
  async recoverFailedTransactions(): Promise<any> {
    return {
      success: false,
      error: 'RECOVERY_DISABLED_UNVERIFIED_TRANSACTIONS: no retry or transfer was attempted.',
      recoveredAmount: 0,
      failedAmount: 0,
    };
  }

}

export default CashoutService;