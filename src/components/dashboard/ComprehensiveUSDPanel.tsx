import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Wallet, ShieldCheck, Clock } from "lucide-react";

const formatUSD = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded";

export const ComprehensiveUSDPanel = () => {
  const balanceQuery = useQuery({
    queryKey: ["provider-verified-stripe-balance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usd_balance_real_time")
        .select("balance_type, amount_usd, source_system, verification_status, last_verification")
        .eq("source_system", "stripe")
        .eq("verification_status", "verified")
        .order("last_verification", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ["provider-reconciled-stripe-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_stripe_transactions")
        .select("amount, net_amount, currency, status, reconciled, created_at")
        .eq("reconciled", true)
        .eq("status", "succeeded")
        .eq("currency", "usd")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data ?? [];
    },
  });

  const balances = balanceQuery.data ?? [];
  const latestVerification = balances.reduce<string | null>((latest, row) => {
    if (!row.last_verification) return latest;
    if (!latest || new Date(row.last_verification).getTime() > new Date(latest).getTime()) {
      return row.last_verification;
    }
    return latest;
  }, null);
  const fresh = Boolean(
    latestVerification && Date.now() - new Date(latestVerification).getTime() < 24 * 60 * 60 * 1000,
  );
  const available = balances.find((row) => row.balance_type === "available");
  const pending = balances.find((row) => row.balance_type === "pending");
  const payments = paymentsQuery.data ?? [];
  const netReceipts = payments.reduce(
    (sum, payment) => sum + Number(payment.net_amount ?? payment.amount ?? 0),
    0,
  );

  const balanceText = (row?: (typeof balances)[number]) => {
    if (balanceQuery.isError) return "Unavailable";
    if (!fresh || !row) return "Not currently verified";
    return formatUSD(Number(row.amount_usd));
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-border">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Verified USD Position
          </CardTitle>
          <Badge variant={fresh ? "default" : "outline"}>
            {fresh ? "Current Stripe check" : "Verification stale"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Stripe available</p>
            <p className="mt-1 text-xl font-bold">{balanceText(available)}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Stripe pending</p>
            <p className="mt-1 text-xl font-bold">{balanceText(pending)}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Reconciled net receipts
            </p>
            <p className="mt-1 text-xl font-bold">
              {paymentsQuery.isError ? "Unavailable" : formatUSD(netReceipts)}
            </p>
            <p className="text-xs text-muted-foreground">
              {paymentsQuery.isError ? "Ledger unavailable" : `${payments.length} verified payments`}
            </p>
          </div>
        </div>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {balanceQuery.isLoading
            ? "Checking Stripe balance…"
            : balanceQuery.isError
              ? "Stripe balance verification could not be read."
              : `Last Stripe balance verification: ${formatDate(latestVerification)}`}
        </p>
        <p className="text-xs text-muted-foreground">
          Historical application balances, modeled revenue metrics, and internal transfer logs are excluded
          from spendable cash. A database transfer row is not proof of a Stripe payout.
        </p>
      </CardContent>
    </Card>
  );
};
