/**
 * Cashout Service with Real Payment Integration
 * Handles cashout requests using real Stripe payments via cashout-server.js
 * Falls back to local demo mode if server unavailable
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
  private cashoutServerUrl: string;
  private useRealPayments: boolean;

  constructor() {
    this.lovableCloud = LovableCloudService.getInstance();
    // Get cashout server URL from environment or default to localhost:4000
    this.cashoutServerUrl = import.meta.env.VITE_CASHOUT_SERVER_URL || 'http://localhost:4000';
    // Enable real payments by default (can be disabled via env var)
    this.useRealPayments = import.meta.env.VITE_USE_REAL_PAYMENTS !== 'false';
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
    console.log('CashoutService: Processing cashout', { 
      useRealPayments: this.useRealPayments,
      cashoutServerUrl: this.cashoutServerUrl,
      request 
    });

    // Try real payment server first if enabled
    if (this.useRealPayments) {
      try {
        const realPaymentResult = await this.processRealPayment(request);
        if (realPaymentResult.success) {
          return realPaymentResult;
        }
        console.warn('Real payment failed, falling back to demo mode:', realPaymentResult.error);
      } catch (error) {
        console.warn('Cashout server unavailable, falling back to demo mode:', error);
      }
    }

    // Fallback to demo mode
    return this.processDemoPayment(request);
  }

  /**
   * Process real payment via cashout server
   */
  private async processRealPayment(request: CashoutRequest): Promise<CashoutResponse> {
    console.log('CashoutService: Attempting real payment via cashout server');

    try {
      const cashValue = Math.max(1, request.coins / 100);
      
      const response = await fetch(`${this.cashoutServerUrl}/cashout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: request.userId,
          coins: request.coins,
          payoutType: request.payoutType,
          email: request.email,
          metadata: request.metadata
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('CashoutService: Real payment successful', result);
        return {
          success: true,
          source: 'cashout_server',
          isReal: true,
          transaction_id: result.details?.payoutId || result.details?.transferId || result.details?.paymentIntentId,
          message: `Successfully processed REAL $${cashValue.toFixed(2)} payment to ${request.email}`,
          details: {
            ...result.details,
            amount: Math.round(cashValue * 100),
            currency: 'usd',
            status: 'completed',
            payment_method: request.payoutType,
            real_payment: true
          }
        };
      }

      throw new Error(result.error || 'Real payment processing failed');
    } catch (error) {
      console.error('CashoutService: Real payment failed', error);
      throw error;
    }
  }

  /**
   * Process demo payment using local storage (fallback)
   */
  private async processDemoPayment(request: CashoutRequest): Promise<CashoutResponse> {
    console.log('CashoutService: Processing demo payment locally');

    try {
      const cashValue = Math.max(1, request.coins / 100);
      const revenueBalance = await this.lovableCloud.getRevenueBalance(request.userId);
      
      if (revenueBalance < cashValue) {
        return {
          success: false,
          error: `Insufficient balance. Available: $${revenueBalance.toFixed(2)}, Requested: $${cashValue.toFixed(2)}`,
          source: 'demo_mode'
        };
      }

      const result = await this.lovableCloud.processCashout(
        request.userId,
        cashValue,
        request.email
      );

      if (result.success) {
        return {
          success: true,
          source: 'demo_mode',
          isReal: false,
          transaction_id: result.transaction_id,
          autonomous_revenue_balance: Math.max(0, revenueBalance - cashValue),
          message: `Successfully processed DEMO $${cashValue.toFixed(2)} cashout to ${request.email}`,
          details: {
            id: result.transaction_id,
            amount: Math.round(cashValue * 100),
            currency: 'usd',
            status: 'completed',
            payment_method: request.payoutType,
            demo_mode: true
          }
        };
      }

      throw new Error(result.error || 'Cashout failed');
    } catch (error) {
      console.error('CashoutService: Demo payment failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cashout processing failed',
        source: 'demo_mode'
      };
    }
  }

  /**
   * Create demo success response when Lovable Cloud is unavailable
   */
  private createDemoSuccessResponse(request: CashoutRequest): CashoutResponse {
    const cashValue = Math.max(1, request.coins / 100);
    
    return {
      success: true,
      source: 'demo_mode',
      isReal: false,
      message: `DEMO: $${cashValue.toFixed(2)} cashout to ${request.email} (${request.payoutType})`,
      details: {
        id: `demo_${Date.now()}`,
        amount: Math.round(cashValue * 100),
        currency: 'usd',
        status: 'demo_success',
        demo_note: 'This is a demo transaction. Lovable Cloud service is temporarily unavailable.'
      }
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
   * Test the cashout service with a small test request
   * Will use REAL MONEY if cashout server is available and configured
   */
  async testCashout(email: string = 'test@example.com', coins: number = 100): Promise<CashoutResponse> {
    console.log('CashoutService: Running test cashout', {
      useRealPayments: this.useRealPayments,
      cashoutServerUrl: this.cashoutServerUrl
    });
    
    return this.processCashout({
      userId: `test_${Date.now()}`,
      coins: Math.max(100, coins),
      payoutType: 'email', // Use email payout for testing (safest)
      email,
      metadata: {
        gameSession: Date.now(),
        coinCount: coins,
        testRun: true,
        realMoney: this.useRealPayments
      }
    });
  }

  /**
   * Force recovery of all failed transactions
   */
  async recoverFailedTransactions(): Promise<any> {
    try {
      const { FailedTransactionRecovery } = await import('./FailedTransactionRecovery');
      const recovery = FailedTransactionRecovery.getInstance();
      return await recovery.recoverAllFailedTransactions();
    } catch (error) {
      console.error('Error during transaction recovery:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Recovery failed',
        recoveredAmount: 0,
        failedAmount: 0
      };
    }
  }
}

export default CashoutService;