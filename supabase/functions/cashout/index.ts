// Feature-branch safety gate: no authentication-free legacy coin redemption.
Deno.serve(() => new Response(JSON.stringify({success:false,error:'Legacy cashout retired. Use the authenticated verified monetization service; browser game points are not funds.'}),{status:410,headers:{'Content-Type':'application/json'}}));
