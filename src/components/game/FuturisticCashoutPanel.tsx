import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Banknote, Mail, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const CASHOUT_SERVER = import.meta.env.VITE_CASHOUT_SERVER_URL || 'http://localhost:4000';
const COINS_PER_USD = 100;

type PayoutType = 'instant_card' | 'bank_account' | 'email';

interface CashoutResult {
  success: boolean;
  amountUSD?: number;
  payoutMethod?: string;
  details?: Record<string, unknown>;
  error?: string;
}

export default function FuturisticCashoutPanel() {
  const [coins, setCoins] = useState(1000);
  const [payoutType, setPayoutType] = useState<PayoutType>('email');
  const [email, setEmail] = useState('');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CashoutResult | null>(null);

  const amountUSD = coins / COINS_PER_USD;

  const handleCashout = async () => {
    if (coins < 100) {
      toast.error('Minimum 100 coins required');
      return;
    }
    if (payoutType === 'email' && !email.trim()) {
      toast.error('Email is required for email payout');
      return;
    }
    if (payoutType !== 'email' && !accountId.trim()) {
      toast.error('Connected account ID is required for card/bank payouts');
      return;
    }

    setLoading(true);
    setLastResult(null);

    try {
      const res = await fetch(`${CASHOUT_SERVER}/cashout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: `user_${Date.now()}`,
          coins,
          payoutType,
          email: payoutType === 'email' ? email : undefined,
          accountId: payoutType !== 'email' ? accountId : undefined,
        }),
      });

      const data = await res.json();
      setLastResult(data);

      if (data.success) {
        toast.success(`Cashed out $${(data.amountUSD ?? amountUSD).toFixed(2)} via ${data.payoutMethod}`);
      } else {
        toast.error(data.error || 'Cashout failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setLastResult({ success: false, error: msg });
      toast.error(`Cannot reach cashout server: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-cyan-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 shadow-lg shadow-cyan-500/10">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-cyan-300 flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Futuristic Cashout
            </CardTitle>
            <CardDescription className="text-slate-400">
              Direct Stripe Connect payouts — no Supabase required
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-300">
            {COINS_PER_USD} coins = $1
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="coins">Coins to cash out</Label>
          <Input
            id="coins"
            type="number"
            min={100}
            step={100}
            value={coins}
            onChange={(e) => setCoins(Number(e.target.value) || 0)}
            className="bg-slate-900 border-slate-700"
          />
          <p className="text-sm text-cyan-400/80">≈ ${amountUSD.toFixed(2)} USD</p>
        </div>

        <div className="space-y-2">
          <Label>Payout method</Label>
          <Select value={payoutType} onValueChange={(v) => setPayoutType(v as PayoutType)}>
            <SelectTrigger className="bg-slate-900 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instant_card">
                <span className="flex items-center gap-2"><Zap className="h-4 w-4" /> Instant card</span>
              </SelectItem>
              <SelectItem value="bank_account">
                <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> Bank account</span>
              </SelectItem>
              <SelectItem value="email">
                <span className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email (simulated)</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {payoutType === 'email' ? (
          <div className="space-y-2">
            <Label htmlFor="email">Receipt email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-900 border-slate-700"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="accountId">Stripe connected account ID</Label>
            <Input
              id="accountId"
              placeholder="acct_..."
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="bg-slate-900 border-slate-700"
            />
          </div>
        )}

        <Button
          onClick={handleCashout}
          disabled={loading}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
          ) : (
            <>Cash out ${amountUSD.toFixed(2)}</>
          )}
        </Button>

        {lastResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              lastResult.success
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                : 'border-red-500/40 bg-red-950/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {lastResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {lastResult.success ? 'Success' : 'Failed'}
            </div>
            {lastResult.error && <p className="mt-1 opacity-90">{lastResult.error}</p>}
            {lastResult.success && lastResult.details && (
              <pre className="mt-2 overflow-x-auto text-xs opacity-80">
                {JSON.stringify(lastResult.details, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
