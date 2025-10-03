# Real Payment Integration Setup Guide

## Overview

Click Clack Cash Flow now supports **real payment processing** using Stripe Connect via the cashout server. The system automatically falls back to demo mode if the cashout server is unavailable.

## Features

✅ **Real Stripe Payments** - Process actual USD transactions  
✅ **Automatic Fallback** - Gracefully degrades to demo mode if server unavailable  
✅ **USD Verification** - Every transaction verified (100 coins = $1)  
✅ **Transaction Logging** - Comprehensive audit trail of all payments  
✅ **Multiple Payout Methods** - Email, instant card, and bank transfers  
✅ **Test Mode Support** - Safe testing with Stripe test keys  

## Quick Start

### 1. Configure Environment Variables

Create or update your `.env` file:

```bash
# Enable real payment processing
VITE_USE_REAL_PAYMENTS=true

# Cashout server URL (default: http://localhost:4000)
VITE_CASHOUT_SERVER_URL=http://localhost:4000

# Stripe configuration (for cashout server)
STRIPE_SECRET_KEY=sk_test_your_stripe_test_key_here
CONNECTED_ACCOUNT_ID=acct_your_connected_account_id

# Server port
PORT=4000
```

**Important:** 
- Use `sk_test_` keys for testing (no real money charged)
- Use `sk_live_` keys for production (real money transactions)

### 2. Start Both Servers

**Terminal 1 - Frontend:**
```bash
npm run dev  # Starts on http://localhost:8080
```

**Terminal 2 - Cashout Server:**
```bash
chmod +x start-cashout-server.sh
./start-cashout-server.sh  # Starts on http://localhost:4000
```

Or on Windows:
```bash
start-cashout-server.bat
```

### 3. Test the Integration

**Option A - Use the Test Button:**
1. Open http://localhost:8080
2. Click "Test Cashout" button in the Cash Out dialog
3. Look for "💰 Real Payment Server" or "Demo Mode" indicator

**Option B - Run Test Script:**
```bash
node /tmp/test-real-payment.js
```

## Payment Modes

### Real Payment Mode (Production)

When `VITE_USE_REAL_PAYMENTS=true` and cashout server is running:

- ✅ Processes real Stripe transactions
- ✅ USD verified (100 coins = $1)
- ✅ Full transaction logging
- ✅ Toast shows: "💰 REAL PAYMENT PROCESSED"

### Demo Mode (Fallback)

When cashout server is unavailable or `VITE_USE_REAL_PAYMENTS=false`:

- 📦 Uses localStorage for simulation
- 📦 No real money processed
- 📦 Toast shows: "(Demo Mode - Processed locally)"

## Payout Methods

The system supports three payout methods:

### 1. Email Payout (Recommended for Testing)
```typescript
payoutType: 'email'
```
- Creates Stripe PaymentIntent
- Receipt sent to email
- Safest for testing

### 2. Instant Card Payout
```typescript
payoutType: 'instant_card'
```
- Instant transfer to debit card
- Requires connected account setup
- Higher fees but immediate

### 3. Bank Account Payout
```typescript
payoutType: 'bank_account'
```
- Standard ACH transfer
- 1-2 business days
- Lower fees

## Stripe Connect Setup

### For Testing

1. **Create Stripe Account:**
   - Sign up at https://stripe.com
   - Get your test API keys from dashboard

2. **Get Test Keys:**
   ```
   STRIPE_SECRET_KEY=sk_test_51...
   ```

3. **Create Connected Account:**
   ```bash
   curl -X POST https://api.stripe.com/v1/accounts \
     -u sk_test_51...: \
     -d type=express \
     -d country=US \
     -d email=test@example.com
   ```

4. **Use the Account ID:**
   ```
   CONNECTED_ACCOUNT_ID=acct_1...
   ```

### For Production

⚠️ **Production Setup Required:**

1. Complete Stripe account verification
2. Set up connected accounts properly
3. Configure webhook endpoints
4. Use live API keys (`sk_live_...`)
5. Test thoroughly in test mode first

## Monitoring & Verification

### Transaction Logs

All transactions are logged to:
- `logs/cashout-server.log` - Server activity
- `logs/transactions.log` - Transaction details
- `logs/transactions.json` - Structured transaction data

### USD Verification

Every transaction includes verification:
```json
{
  "usd_verification": {
    "coins": 100,
    "expectedUSD": 1.00,
    "calculatedUSD": 1.00,
    "discrepancy": 0,
    "isValid": true
  }
}
```

### Health Check

Check server status:
```bash
curl http://localhost:4000/health
```

Response:
```json
{
  "status": "ok",
  "stripeConfigured": true,
  "connectedAccountConfigured": true,
  "coins_to_usd_rate": 100
}
```

## Troubleshooting

### "Payment Queued for Processing"

**Cause:** Cashout server not running or unreachable  
**Solution:** 
1. Start cashout server: `./start-cashout-server.sh`
2. Check server is running: `curl http://localhost:4000/health`
3. Verify `VITE_CASHOUT_SERVER_URL` in `.env`

### "Demo Mode - Processed locally"

**Cause:** Real payments disabled or server unavailable  
**Solution:**
1. Set `VITE_USE_REAL_PAYMENTS=true` in `.env`
2. Restart frontend: `npm run dev`
3. Ensure cashout server is running

### Stripe API Errors

**Cause:** Invalid or missing Stripe keys  
**Solution:**
1. Verify `STRIPE_SECRET_KEY` in `.env`
2. Check key starts with `sk_test_` or `sk_live_`
3. Ensure connected account exists and is active

### "Connected account ID required"

**Cause:** Missing `CONNECTED_ACCOUNT_ID`  
**Solution:**
1. Create a Stripe connected account
2. Add account ID to `.env`
3. Restart cashout server

## Security Best Practices

🔒 **Never commit `.env` file** - Contains sensitive keys  
🔒 **Use test keys for development** - Avoid accidental charges  
🔒 **Rotate keys regularly** - Update in production  
🔒 **Monitor transaction logs** - Check for suspicious activity  
🔒 **Rate limit requests** - Prevent abuse (already implemented)  
🔒 **Validate all inputs** - Server validates every request  

## API Reference

### POST /cashout

Process a cashout request:

```bash
curl -X POST http://localhost:4000/cashout \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_123",
    "coins": 100,
    "payoutType": "email",
    "email": "user@example.com",
    "metadata": {
      "testRun": false
    }
  }'
```

Response:
```json
{
  "success": true,
  "userId": "user_123",
  "amountUSD": 1,
  "payoutMethod": "email",
  "details": {
    "paymentIntentId": "pi_...",
    "status": "succeeded"
  }
}
```

### GET /health

Check server health:

```bash
curl http://localhost:4000/health
```

### GET /transactions

Get transaction history (admin only):

```bash
curl http://localhost:4000/transactions
```

## Support

For issues or questions:
1. Check logs in `logs/` directory
2. Review this documentation
3. Test with Stripe test mode first
4. Contact repository maintainer

## License

This integration is part of Click Clack Cash Flow.
See main repository LICENSE for details.
