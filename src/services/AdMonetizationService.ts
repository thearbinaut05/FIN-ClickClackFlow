
import { AFFILIATE_API_ENDPOINTS } from '@/utils/constants';

export interface AdPerformanceMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
  ecpm: number;
  earnings: number;
  category: string;
  timestamp: Date;
}

export interface OptimizationResult {
  recommendedCategory: string;
  projectedImprovement: number;
  confidence: number;
  suggestedActions: string[];
}

export interface OfferData {
  id: string;
  name: string;
  description: string;
  category: string;
  payout: number;
  payoutType: 'cpa' | 'ppc' | 'revshare';
  network: string;
  requirements: string[];
  countries: string[];
  conversionRate: number;
  epc: number; // earnings per click
}

class AdMonetizationService {
  private static instance: AdMonetizationService;
  private metrics: AdPerformanceMetrics[] = [];
  private currentOffers: OfferData[] = [];
  
  private constructor() {
    // Initialize with some default offers if API is not available
    this.loadInitialOffers();
  }
  
  static getInstance(): AdMonetizationService {
    if (!AdMonetizationService.instance) {
      AdMonetizationService.instance = new AdMonetizationService();
    }
    return AdMonetizationService.instance;
  }
  
  private async loadInitialOffers(): Promise<void> {
    this.currentOffers = await this.fetchOffers();
  }

  async fetchOffers(): Promise<OfferData[]> {
    try {
      const response = await fetch(AFFILIATE_API_ENDPOINTS.offers, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) return [];
      const offers = await response.json();
      return Array.isArray(offers) ? offers : [];
    } catch (error) {
      console.warn('No verified affiliate provider response; no offers loaded.', error);
      return [];
    }
  }

  async recordImpression(_category: string = 'general'): Promise<void> {
    // Impressions are not proof of payable traffic or settled revenue.
    return;
  }

  async recordClick(_category: string = 'general'): Promise<number> {
    // No click is credited until a signed provider postback is verified.
    return 0;
  }

  async recordConversion(_category: string = 'general'): Promise<number> {
    // No conversion is credited until a provider confirms and settles it.
    return 0;
  }

  getCurrentMetrics(): AdPerformanceMetrics {
    const latest = this.metrics[this.metrics.length - 1];
    
    if (latest) {
      return { ...latest };
    }
    
    // Default initial metrics
    return {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cvr: 0,
      ecpm: 0,
      earnings: 0,
      category: 'general',
      timestamp: new Date()
    };
  }
  
  async optimizeAdStrategy(): Promise<OptimizationResult> {
    return {
      recommendedCategory: 'general',
      projectedImprovement: 0,
      confidence: 0,
      suggestedActions: ['Connect a verified affiliate provider and reconcile settled conversion events before optimization.'],
    };
  }

  getCurrentOffers(): OfferData[] {
    return this.currentOffers;
  }
  
  getRecommendedOffer(): OfferData | null {
    if (this.currentOffers.length === 0) {
      return null;
    }
    
    // Sort by expected value (payout * conversion rate)
    const sortedOffers = [...this.currentOffers]
      .sort((a, b) => (b.payout * b.conversionRate) - (a.payout * a.conversionRate));
      
    return sortedOffers[0];
  }
  
  getTotalEarnings(): number {
    const latest = this.getCurrentMetrics();
    return latest.earnings;
  }
  
  getEarningsBreakdown(): { ppc: number; cpa: number } {
    return { ppc: 0, cpa: 0 };
  }

}

export default AdMonetizationService;
