import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers },
    );
  }

  return new Response(
    JSON.stringify({
      ok: false,
      code: "LIVE_PROVIDER_NOT_CONFIGURED",
      message: "No verified affiliate-network credentials or signed conversion postback are configured. Synthetic offers, estimated payouts, and simulated revenue writes are disabled.",
      offers_scraped: 0,
      earnings_credited: 0,
      payouts_enabled: false,
    }),
    { status: 503, headers },
  );
});
