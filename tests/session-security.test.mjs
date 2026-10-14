import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('financial app is gated by a server-validated non-anonymous identity', () => {
  const gate = read('src/components/auth/AuthGate.tsx');
  assert.match(read('src/App.tsx'), /<AuthGate>[\s\S]*<Routes>/);
  assert.match(gate, /supabase\.auth\.getUser\(\)/);
  assert.match(gate, /!data\.user\.is_anonymous/);
  assert.match(gate, /subscription\.unsubscribe\(\)/);
  assert.match(gate, /if \(!user\) return/);
});
for (const name of ['cashout', 'autopilot-cashout']) test(name + ' fails closed without touching funds', () => {
  const source = read('supabase/functions/' + name + '/index.ts');
  assert.match(source, /auth\.auth\.getUser\(token\)/);
  assert.match(source, /data\.user\.is_anonymous/);
  assert.match(source, /IDENTITY_MISMATCH/);
  assert.match(source, /UNVERIFIED_PAYOUT_PATH_DISABLED/);
  assert.doesNotMatch(source, /SERVICE_ROLE_KEY|stripe\.|\.from\(|success: true/);
});
