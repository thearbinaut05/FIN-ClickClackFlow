// Tokens exist only in memory; no localStorage, query strings or cookies. Page
// reload requires sign-in again. We never persist a password or finance report.
let token = ''; let config; let expiry = 0;
const message = text => { document.querySelector('#message').textContent = text; };
const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
function logout() { token = ''; expiry = 0; document.querySelector('#dashboard').hidden = true; document.querySelector('#signin').hidden = false; document.querySelector('#provider').replaceChildren(); document.querySelector('#ledger').replaceChildren(); document.querySelector('#checked').textContent = ''; }
async function refresh() {
  if (!token || Date.now() >= expiry) { logout(); throw new Error('Session expired. Please sign in again.'); }
  const response = await fetch('/api/reconciliation', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) { if (response.status === 403) logout(); throw new Error(data.error || 'Evidence refresh failed.'); }
  message(data.warning); document.querySelector('#checked').textContent = `Read at ${data.checkedAt}; ledger blocks are separate reads, not one atomic snapshot.`;
  const provider = document.querySelector('#provider'); provider.replaceChildren();
  if (data.stripe.status === 'provider_confirmed') {
    provider.append(node('p', `Account: ${data.stripe.accountId} · ${data.stripe.livemode ? 'LIVE' : 'TEST — not real money'} mode`),
      node('p', `Available USD: ${data.stripe.availableUsd} · Pending USD: ${data.stripe.pendingUsd}`), node('p', data.stripe.scope));
  } else provider.append(node('p', `UNAVAILABLE: ${data.stripe.message || 'No provider evidence. This does not mean zero.'}`));
  const ledger = document.querySelector('#ledger'); ledger.replaceChildren();
  if (data.ledger.status === 'unavailable') { ledger.append(node('p', data.ledger.error)); return; }
  for (const [name, block] of Object.entries(data.ledger)) {
    const section = node('section'); section.append(node('h3', name), node('p', `Status: ${block.status}`));
    if (block.status === 'unavailable') section.append(node('p', block.error));
    else if (!block.rows.length) section.append(node('p', 'No rows returned. This does not explain historical data loss.'));
    else {
      // Stripe/database strings are always rendered as text, never innerHTML.
      const columns = Object.keys(block.rows[0]); const table = node('table'); const head = node('thead'); const headings = node('tr');
      for (const key of columns) headings.append(node('th', key)); head.append(headings); table.append(head);
      const body = node('tbody'); for (const row of block.rows) { const tr = node('tr'); for (const key of columns) tr.append(node('td', row[key] === null ? 'Not recorded' : String(row[key]))); body.append(tr); }
      table.append(body); const wrapper = node('div'); wrapper.className = 'table-scroll'; wrapper.append(table); section.append(wrapper);
    }
    ledger.append(section);
  }
}
async function busy(button, action) { button.disabled = true; try { await action(); } catch (error) { message(error.message); } finally { button.disabled = false; } }
document.querySelector('#login').addEventListener('submit', event => {
  event.preventDefault(); busy(document.querySelector('#sign-in'), async () => {
    const password = document.querySelector('#password').value; document.querySelector('#password').value = '';
    // Password is sent over HTTPS directly to Supabase Auth, not this server.
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.querySelector('#email').value, password }),
    });
    if (!response.ok) throw new Error('Sign-in failed. Check your Supabase credentials and account status.');
    const session = await response.json(); token = session.access_token; expiry = Date.now() + Number(session.expires_in) * 1000;
    await refresh(); document.querySelector('#signin').hidden = true; document.querySelector('#dashboard').hidden = false;
  });
});
document.querySelector('#refresh').addEventListener('click', event => busy(event.target, refresh));
document.querySelector('#signout').addEventListener('click', () => { logout(); message('Local session cleared. Other Supabase sessions are unchanged.'); });
try { const response = await fetch('/api/config'); if (!response.ok) throw new Error(); config = await response.json(); }
catch { document.querySelector('#sign-in').disabled = true; message('Dashboard configuration unavailable. Contact the application administrator.'); }
