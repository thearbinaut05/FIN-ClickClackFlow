import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Never mount financial dashboards until Auth has validated the identity.
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let generation = 0;
    const verify = async () => {
      const current = ++generation;
      if (active) { setUser(null); setChecking(true); }
      try {
        const { data, error } = await supabase.auth.getUser();
        if (active && current === generation) {
          setUser(!error && data.user && !data.user.is_anonymous ? data.user : null);
        }
      } catch {
        if (active && current === generation) setUser(null);
      } finally {
        if (active && current === generation) setChecking(false);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Do not call asynchronous Supabase APIs inside its auth callback.
      generation += 1;
      setUser(null);
      setChecking(true);
      setTimeout(() => { if (active) void verify(); }, 0);
    });
    const focus = () => { void verify(); };
    const visibility = () => { if (document.visibilityState === 'visible') void verify(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => { void verify(); }, 60000);
    void verify();
    return () => {
      active = false;
      generation += 1;
      subscription.unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      setPassword('');
    } catch { setMessage('Authentication unavailable. Please try again later.'); }
    finally { setBusy(false); }
  };
  if (checking) return <main aria-live="polite">Validating your session…</main>;
  if (!user) return <main className="mx-auto max-w-md p-8">
    <h1 className="text-2xl font-bold">Sign in</h1>
    <p>A verified, non-anonymous account is required. Financial actions remain restricted.</p>
    <form onSubmit={login} className="flex flex-col gap-4 mt-4">
      <label>Email<input className="block border p-2 w-full" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input className="block border p-2 w-full" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p role="alert">{message}</p>
    </form>
  </main>;
  return <div key={user.id}>
    <header className="p-2 flex justify-between"><span>{user.email ?? 'Authenticated account'}</span><button onClick={async () => { setUser(null); await supabase.auth.signOut({ scope: 'local' }); }}>Sign out</button></header>
    {children}
  </div>;
}
