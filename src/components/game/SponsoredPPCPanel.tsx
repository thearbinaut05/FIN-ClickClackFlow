import React, { useEffect, useState } from 'react';
import { TOKENOMICS, getOgadsGptSiteUrl, getStripeSponsorPaymentLinkUrl, usdForCoins } from '@/config/tokenomics';
import SponsoredPPCService from '@/services/SponsoredPPCService';

const COINS_KEY = 'clickclack_sponsored_coins';
const GROSS_KEY = 'clickclack_sponsored_gross_usd';
const CLICKS_KEY = 'clickclack_sponsored_clicks';

function readNumber(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

const SponsoredPPCPanel: React.FC = () => {
  const sponsorUrl = getOgadsGptSiteUrl();
  const sponsorBuyUrl = getStripeSponsorPaymentLinkUrl();
  const [sponsoredCoins, setSponsoredCoins] = useState(0);
  const [grossUsd, setGrossUsd] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [lastCoins, setLastCoins] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSponsoredCoins(Math.floor(readNumber(COINS_KEY)));
    setGrossUsd(readNumber(GROSS_KEY));
    setClicks(Math.floor(readNumber(CLICKS_KEY)));
  }, []);

  const handleSponsoredClick = async () => {
    window.open(sponsorUrl, '_blank', 'noopener,noreferrer');
    setBusy(true);
    try {
      const result = await SponsoredPPCService.getInstance().recordSponsoredClick();
      const nextCoins = sponsoredCoins + result.coinsCredited;
      const nextGross = grossUsd + result.grossUsd;
      const nextClicks = clicks + 1;
      setSponsoredCoins(nextCoins);
      setGrossUsd(nextGross);
      setClicks(nextClicks);
      setLastCoins(result.coinsCredited);
      try {
        localStorage.setItem(COINS_KEY, String(nextCoins));
        localStorage.setItem(GROSS_KEY, String(nextGross));
        localStorage.setItem(CLICKS_KEY, String(nextClicks));
      } catch {}
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-yellow-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-yellow-200">Sponsored</span>
        <h2 className="text-2xl font-bold">Sponsored PPC — Earn Coins</h2>
      </div>
      <p className="mt-3 text-sm text-white/70">
        Sponsors fund the tap-to-earn pool. Open a sponsored offer, the interaction is recorded at ${TOKENOMICS.sponsorPpc.baseCpcUsd.toFixed(2)} per click, you keep {(TOKENOMICS.sponsorPpc.userShare * 100).toFixed(0)}% as coins and {(TOKENOMICS.sponsorPpc.ownerShare * 100).toFixed(0)}% is held for cashout reserve. Complete bigger offers on the ClickClack Flow GPT site — you keep {TOKENOMICS.ogadsGpt.userSharePercent}%, the site keeps {TOKENOMICS.ogadsGpt.marginPercent}% margin.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs uppercase text-white/50">Sponsor clicks</p><p className="mt-1 text-xl font-bold">{clicks}</p></div>
        <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs uppercase text-white/50">Sponsor value</p><p className="mt-1 text-xl font-bold">${grossUsd.toFixed(2)}</p></div>
        <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs uppercase text-white/50">Sponsored coins</p><p className="mt-1 text-xl font-bold">{sponsoredCoins}</p></div>
        <div className="rounded-2xl bg-black/30 p-4"><p className="text-xs uppercase text-white/50">Coin value</p><p className="mt-1 text-xl font-bold">${usdForCoins(sponsoredCoins).toFixed(2)}</p></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={handleSponsoredClick} disabled={busy} className="rounded-full bg-yellow-400 px-5 py-2.5 font-bold text-black disabled:opacity-50">{busy ? 'Recording...' : 'Open sponsored offers & earn'}</button>
        <a href={sponsorUrl} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/20 px-5 py-2.5 font-semibold text-white">Visit ClickClack Flow GPT site</a>
        <a href={sponsorBuyUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-5 py-2.5 font-bold text-black">Become a sponsor — ${TOKENOMICS.sponsorStripe.starterUsd} starter</a>
      </div>
      {lastCoins !== null && (<p className="mt-3 text-sm text-green-300">+{lastCoins} sponsored coins credited from the last sponsored interaction.</p>)}
      <p className="mt-3 text-xs text-white/50">Cashout at {TOKENOMICS.cashout.minCoins} coins (${TOKENOMICS.ogadsGpt.minCashoutUsd}) after sponsored coins are merged with your game balance. Sponsored earnings are calculated from configured PPC rates until a live sponsor network postback is connected — do not rely on them as settled payouts yet. Sponsor placement is sold via Stripe; a sale is only revenue after a completed Stripe payment.</p>
    </section>
  );
};

export default SponsoredPPCPanel;
