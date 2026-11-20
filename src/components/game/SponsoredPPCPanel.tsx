import React from 'react';

const SponsoredPPCPanel: React.FC = () => (
  <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
    <div className="flex flex-wrap items-center gap-3">
      <span className="rounded-full bg-red-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-200">
        Disabled
      </span>
      <h2 className="text-2xl font-bold">Sponsored PPC</h2>
    </div>
    <p className="mt-3 text-sm text-white/70">
      No verified affiliate network or signed conversion postback is connected.
      Opening an offer cannot generate revenue, and no coins are credited for clicks or conversions.
    </p>
    <p className="mt-3 text-xs text-white/50">
      This feature stays disabled until a real provider confirms conversions and its settlement records
      reconcile to the revenue ledger. The existing sponsor checkout is not promoted here because its
      post-payment destination is behind the app's sign-in protection.
    </p>
  </section>
);

export default SponsoredPPCPanel;
