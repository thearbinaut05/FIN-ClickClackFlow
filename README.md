# FIN-ClickClackFlow

Click-to-earn game + real Stripe Connect cashouts.

## Status
**Production-ready core** — cashout server runs **without Supabase**. Frontend can use local Node server or optional Supabase edge functions.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Set at least: STRIPE_SECRET_KEY=sk_test_...

# 3. Run cashout API
npm run cashout
# → http://localhost:4000

# 4. Run frontend (another terminal)
npm run dev
# → http://localhost:8080 (or Vite's port)

# Or both:
npm run start:all
```

## Cashout API

`POST /cashout`

```json
{
  "userId": "user_123",
  "coins": 1000,
  "payoutType": "email",
  "email": "you@example.com"
}
```

- **100 coins = $1 USD**
- `payoutType`: `instant_card` | `bank_account` | `email`
- Card/bank need `accountId` (or `CONNECTED_ACCOUNT_ID` in `.env`)

Health: `GET /health`

## Architecture

| Piece | Role | Requires Supabase? |
|-------|------|--------------------|
| `cashout-server.js` | Stripe Connect payouts, logging | **No** |
| Vite React app | Game UI + dashboards | Optional |
| `supabase/functions/*` | Edge alternatives | Only if you deploy them |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend |
| `npm run cashout` | Stripe cashout server |
| `npm run start:all` | Both via deploy script |
| `npm run analytics` | CLI analytics |
| `npm run build` | Production build |

## Security notes

- Never commit `.env`
- Use Stripe **test** keys until ready for live
- A malicious `nodes.js` npm package was removed from dependencies — run a fresh `npm install`

## Support This Project

If FIN-ClickClackFlow is useful to you, please consider supporting its development:

- ⭐ Star this repository to help others discover it
- 💖 Sponsor via the **Sponsor** button on this repo, or at [github.com/sponsors/thearbinaut05](https://github.com/sponsors/thearbinaut05)
- 🐛 Report bugs and request features in [Issues](https://github.com/thearbinaut05/FIN-ClickClackFlow/issues)

Sponsorship helps fund hosting, Stripe testing, and continued development. Thank you!

## Related repos

- `FIN-StripeDashboard` — Stripe/lead dashboards
- `FIN-ClickClackReloaded` — Cashflow UI variant
- `AI-Hivemind` — Revenue automation UI
- `submarine-arbitrage-engine` — DeFi arbitrage (separate stack)
