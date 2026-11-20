import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Activity, Clock } from "lucide-react";

const formatUSD = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "None recorded";

export const RevenueMetricsPanel = () => {
  const paymentsQuery = useQuery({
    queryKey: ["reconciled-stripe-payments"],
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

  const payments = paymentsQuery.data ?? [];
  const netRevenue = payments.reduce(
    (sum, payment) => sum + Number(payment.net_amount ?? payment.amount ?? 0),
    0,
  );
  const latestPayment = payments[0]?.created_at ?? null;

  return (
    <Card className="bg-card/50 backdrop-blur border-border">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Verified Revenue
          </CardTitle>
          <Badge variant="outline">Provider-reconciled only</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" /> Net Stripe receipts
            </p>
            <p className="mt-1 text-2xl font-bold">
              {paymentsQuery.isError ? "Unavailable" : formatUSD(netRevenue)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">Reconciled payments</p>
            <p className="mt-1 text-2xl font-bold">
              {paymentsQuery.isError ? "—" : payments.length}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> Latest payment
            </p>
            <p className="mt-1 text-sm font-semibold">
              {paymentsQuery.isError ? "Unavailable" : formatDate(latestPayment)}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {paymentsQuery.isLoading
            ? "Checking the reconciled payment ledger…"
            : paymentsQuery.isError
              ? "The provider-reconciled ledger could not be read. No revenue estimate is shown."
              : payments.length === 0
                ? "No reconciled Stripe payments are recorded. Projected, simulated, and internal application-balance figures are excluded."
                : "Only successful, reconciled Stripe payment records are counted."}
        </p>
      </CardContent>
    </Card>
  );
};
