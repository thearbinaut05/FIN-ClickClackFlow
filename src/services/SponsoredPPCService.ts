import AdMonetizationService from './AdMonetizationService';
import { COINS_PER_USD, TOKENOMICS, getOgadsGptSiteUrl } from '@/config/tokenomics';

export interface SponsoredClickResult {
  grossUsd: number;
  userEarningsUsd: number;
  ownerMarginUsd: number;
  coinsCredited: number;
  sponsorUrl: string;
}

/**
 * Sponsored PPC funding layer.
 * A sponsored interaction is valued at the configured PPC rate
 * (AD_NETWORKS.ppc via AdMonetizationService, ~$0.12/click).
 * 80% is credited to the user as coins, 20% is retained as
 * owner margin / cashout reserve. This is what funds click-to-earn:
 * coins are only credited against recorded sponsor value, not minted free.
 *
 * NOTE: AdMonetizationService currently calculates PPC locally.
 * Replace its rate with a real network postback (PropellerAds / OGAds)
 * before treating these numbers as settled sponsor payouts.
 */
class SponsoredPPCService {
  private static instance: SponsoredPPCService;

  static getInstance(): SponsoredPPCService {
    if (!SponsoredPPCService.instance) {
      SponsoredPPCService.instance = new SponsoredPPCService();
    }
    return SponsoredPPCService.instance;
  }

  getSponsorUrl(): string {
    return getOgadsGptSiteUrl();
  }

  async recordSponsoredClick(
    category = 'sponsored-ppc',
  ): Promise<SponsoredClickResult> {
    const grossUsd =
      await AdMonetizationService.getInstance().recordClick(category);
    const userEarningsUsd = grossUsd * TOKENOMICS.sponsorPpc.userShare;
    return {
      grossUsd,
      userEarningsUsd,
      ownerMarginUsd: grossUsd - userEarningsUsd,
      coinsCredited: Math.floor(userEarningsUsd * COINS_PER_USD),
      sponsorUrl: this.getSponsorUrl(),
    };
  }
}

export default SponsoredPPCService;
