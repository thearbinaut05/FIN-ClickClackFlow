import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
const headers = {
  'Access-Control-Allow-Origin': 'https://click-clack-cash-flow.onrender.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  const respond = (status: number, code: string) => new Response(JSON.stringify({ success: false, code }), { status, headers });
  if (req.method !== 'POST') return respond(405, 'METHOD_NOT_ALLOWED');
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return respond(401, 'AUTHENTICATION_REQUIRED');
  try {
    const auth = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return respond(401, 'AUTHENTICATION_REQUIRED');
    const body = await req.json();
    if (!body || typeof body !== 'object') return respond(400, 'INVALID_REQUEST');
    if ((body.userId && body.userId !== data.user.id) || (body.user_id && body.user_id !== data.user.id) || (body.config?.userId && body.config.userId !== data.user.id)) return respond(403, 'IDENTITY_MISMATCH');
    // Autopilot cannot schedule or execute payouts until reviewed.
    return respond(503, 'UNVERIFIED_PAYOUT_PATH_DISABLED');
  } catch { return respond(503, 'UNVERIFIED_PAYOUT_PATH_DISABLED'); }
});
