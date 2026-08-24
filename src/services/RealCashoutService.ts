/**
 * RealCashoutService — prefers local cashout-server (no Supabase required).
 * Falls back to Supabase edge function only if VITE_USE_SUPABASE_CASHOUT=true.
 */

const CASHOUT_SERVER = import.meta.env.VITE_CASHOUT_SERVER_URL || 'http://localhost:4000';
const USE_SUPABASE = import.meta.env.VITE_USE_SUPABASE_CASHOUT === 'true';

export interface CashoutRequest {
  userId: string;
  coins: number;
  amountUSD: number;
  payoutType?: 'instant_card' | 'bank_account' | 'email';
  email?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

export interface CashoutResponse {
  success: boolean;
  transactionId?: string;
  stripeTransferId?: string;
  message?: string;
  error?: string;
  details?: unknown;
}

async function cashoutViaLocalServer(request: CashoutRequest): Promise<CashoutResponse> {
  const res = await fetch(`${CASHOUT_SERVER}/cashout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: request.userId,
      coins: request.coins,
      payoutType: request.payoutType || 'email',
      email: request.email,
      accountId: request.accountId,
      metadata: request.metadata,
    }),
  });

  const data = await res.json();

  if (!res.ok || !data.success) {
    return {
      success: false,
      error: data.error || `HTTP ${res.status}`,
    };
  }

  return {
    success: true,
    transactionId:
      data.details?.payoutId ||
      data.details?.transferId ||
      data.details?.paymentIntentId ||
      `local_${Date.now()}`,
    stripeTransferId: data.details?.transferId || data.details?.payoutId,
    message: data.details?.message || `Successfully cashed out $${request.amountUSD.toFixed(2)}`,
    details: data.details,
  };
}

async function cashoutViaSupabase(request: CashoutRequest): Promise<CashoutResponse> {
  // Dynamic import so the app still builds if Supabase client is misconfigured
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.functions.invoke('cashout', {
    body: {
      userId: request.userId,
      coins: request.coins,
      payoutType: request.payoutType,
      email: request.email,
      metadata: request.metadata,
    },
  });

  if (error) {
    return { success: false, error: error.message || 'Cashout failed' };
  }

  return {
    success: true,
    transactionId: data.transaction_id,
    stripeTransferId: data.stripe_transfer_id || data.stripe_payment_intent_id,
    message: `Successfully cashed out $${request.amountUSD.toFixed(2)}`,
  };
}

export async function processRealCashout(request: CashoutRequest): Promise<CashoutResponse> {
  console.log('🚀 PROCESSING REAL CASHOUT:', request);

  try {
    if (USE_SUPABASE) {
      console.log('Using Supabase edge function for cashout');
      return await cashoutViaSupabase(request);
    }

    console.log('Using local cashout-server at', CASHOUT_SERVER);
    return await cashoutViaLocalServer(request);
  } catch (error) {
    console.error('❌ Real cashout service error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default { processRealCashout };
