// Feature-branch safety gate: old unprotected transfer/test-card automation is
// retired. Read-only auditing remains available in reconciliation/server.mjs.
Deno.serve(() => new Response(JSON.stringify({success:false,error:'Legacy financial automation disabled. Use read-only reconciliation and the authenticated TEST-only monetization service.'}),{status:410,headers:{'Content-Type':'application/json'}}));
