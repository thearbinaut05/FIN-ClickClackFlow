/**
 * ClickClack Flow tokenomics — like crypto tap-to-earn, funded by sponsors.
 * Coins are off-chain points convertible to USD (100 coins = $1).
 * Issuance rule: coins credited to users <= 80% of funded sponsor/offer revenue.
 */
export const COINS_PER_USD = 100;

export const TOKENOMICS = {
  tap: {
    baseCoinsPerTap: 1,
    energyCostPerTap: 0.5,
    maxEnergy: 100,
    energyRegenSecondsPerPoint: 3,
    levelUpEveryTaps: 50,
  },
  sponsorPpc: {
    baseCpcUsd: 0.12,
    userShare: 0.8,
    ownerShare: 0.2,
  },
  ogadsGpt: {
    siteName: 'ClickClack Flow',
    status: 'Draft',
    marginPercent: 20,
    userSharePercent: 80,
    currency: 'USD',
    minCashoutUsd: 5,
    minCashoutCoins: 500,
    paymentTerms: 'Net 7',
    referralTrigger: 'first_completed_offer',
    theme: 'Arcade',
    toolUrl: 'https://members.ogads.com/tools/gpt-sites',
    courseUrl: 'https://learn.ogads.com/course/33-gpt-builder/watch',
  },
  cashout: {
    coinsPerUsd: COINS_PER_USD,
    minCoins: 500,
  },
} as const;

export function getOgadsGptSiteUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (
    env.VITE_OGADS_GPT_SITE_URL ||
    env.VITE_SPONSOR_PPC_URL ||
    TOKENOMICS.ogadsGpt.toolUrl
  );
}

export function coinsForUsd(usd: number, share = 1): number {
  return Math.floor(usd * COINS_PER_USD * share);
}

export function usdForCoins(coins: number): number {
  return coins / COINS_PER_USD;
}
