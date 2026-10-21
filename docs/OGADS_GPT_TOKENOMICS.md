# OGAds GPT + Sponsored PPC Tokenomics

Course: OGAds GPT Builder (Course 33) — Creating a Site / Customization With Claude
Tool: https://members.ogads.com/tools/gpt-sites
Monday REQUEST: https://thearbinaut05s-team.monday.com/boards/18435783282/pulses/13342067840
Monday RETURN: https://thearbinaut05s-team.monday.com/boards/18435782728/pulses/13342084299

## OGAds GPT site (created)
- Name: ClickClack Flow
- Status at creation: Draft
- Domain: Not set (next OGAds step: set domain / publish, then update VITE_OGADS_GPT_SITE_URL)
- Currency: USD, Margin: 20% (user 80%), Minimum cashout: $5, Payment terms: Net 7, Theme: Arcade
- Total users at creation: 0, Lifetime earnings at creation: 0.00 USD

## How it is connected
User taps in ClickClackFlow -> GameContext records ad impression/PPC every 10 taps ->
SponsoredPPCPanel sponsored interaction -> SponsoredPPCService.recordSponsoredClick()
-> AdMonetizationService.recordClick() (~$0.12 PPC) -> 80% user coins / 20% reserve ->
coins accumulate -> sinks (upgrades, NFT boosters, shop) burn coins ->
cashout burns 500+ coins -> cashout-server.js -> Stripe Connect ($5 minimum).
OGAds GPT offers fund larger earnings at 20% site margin.
Monday receives the returns: GPT URL/status, total users, lifetime earnings,
sponsor revenue, coins issued/cashed out.

## Tokenomics (src/config/tokenomics.ts)
- 1 tap = 1 base coin x clickPower/multiplier; energy 100, 0.5/tap, regen 1 per 3s
- Sponsored PPC: $0.12/click, 80% user (= ~9 coins), 20% owner/reserve
- Issuance rule: coins credited <= 80% of funded sponsor/offer revenue (100 coins = $1)
- Referral (OGAds): pay referrer on first completed offer, not on signup
- Payment terms Net 7 = pending -> available vesting / anti-fraud hold

## Env
Set VITE_OGADS_GPT_SITE_URL to the live GPT site URL once OGAds assigns a domain, then redeploy.
Without it, the panel falls back to the OGAds GPT Sites tool URL.

## Known follow-ups
1. OGAds: set domain/publish the Draft site, add payout method + FAQ + branding text, then return the live URL to Monday.
2. Replace AdMonetizationService local PPC calculation with a real sponsor network postback before treating PPC as settled revenue. Never pay users specifically to click third-party ads — use sponsored offers/placements.
3. Merge sponsored coins (localStorage in SponsoredPPCPanel) into the GameContext balance for unified cashout, and replace the legacy exponential tap mint (2^tapCount in GameContext) with the funded 1-coin base rate above.
4. Supabase: add an active `ogads` row to ad_network_config (revenue_share 80) if using RealAdNetworkService; it currently expects recordAdEarnings on the cashout service.
