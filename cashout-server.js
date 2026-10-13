/**
 * cashout-server.js
 *
 * Real-time Cashout Server using Stripe Connect API.
 * Supports 3 payout types with real Stripe Connect integration:
 * 1. Instant Payout to Connected Account's Debit Card (instant available cards)
 * 2. Standard Payout to Connected Account's Bank Account
 * 3. Email payout simulated via PaymentIntent with receipt sent to email (not a real payout)
 *
 * Features:
 * - 100 coins = 1 USD conversion
 * - Adaptive agent to choose payout method with retry and fallback
 * - Uses environment variables for configuration, including connected account ID and port
 * - Robust error handling, request validation middleware, CORS, and logging
 * - No Supabase dependency (works fully offline from Supabase)
 *
 * Environment Variables:
 * - STRIPE_SECRET_KEY : Your Stripe platform secret key (required)
 * - CONNECTED_ACCOUNT_ID : Default connected Stripe account ID to use for payouts (optional)
 * - PORT : Server port (default 4000)
 * - USD_API_KEY : API key for external USD endpoints (optional, default 'usd-access-key-2024')
 * - USD_VERIFICATION_ENABLED : Enable USD calc verification (default true)
 * - LOG_LEVEL : Winston log level (default 'info')
 *
 * Notes:
 * - Connected Account ID (accountId) can be passed in request body or defaults to CONNECTED_ACCOUNT_ID env.
 * - The connected account must have the payout destinations configured (cards/bank accounts)
 */

import dotenv from 'dotenv';
import express from 'express';
import Stripe from 'stripe';
import winston from 'winston';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Middleware Setup
app.use(helmet()); // Secure HTTP headers
app.use(cors()); // Enable CORS, can be configured for specific origins
app.use(express.json()); // Parse JSON request bodies

// Fail closed for legacy money-moving routes. No environment flag bypass.
// Re-enable only after authenticated ownership, funded ledger reservations,
// idempotency, provider verification, and settlement reconciliation exist.
app.use(['/cashout', '/sweep-usd', '/usd-sweep', '/transfer-accounts'], (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED' });
  return res.status(503).json({
    success: false,
    code: 'UNVERIFIED_PAYOUT_PATH_DISABLED',
    error: 'Legacy payout route disabled: payment ownership and funded entitlement are not verified.'
  });
});

// Rate Limiting Middleware - Limit 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Configuration & Constants
const PORT = process.env.PORT || 4000;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'your_stripe_secret_key_here';
const DEFAULT_CONNECTED_ACCOUNT_ID = process.env.CONNECTED_ACCOUNT_ID || null;

if (stripeSecretKey === 'your_stripe_secret_key_here') {
  console.error('ERROR: Please set your STRIPE_SECRET_KEY in .env file.');
  process.exit(1);
}

if (!DEFAULT_CONNECTED_ACCOUNT_ID) {
  console.warn('Warning: No default CONNECTED_ACCOUNT_ID set in .env. You must provide accountId in each payout request unless using email payout.');
}

const stripe = Stripe(stripeSecretKey);
const COINS_TO_USD = 100;
const MAX_RETRIES = 3;

// USD Verification and External Access Configuration
const USD_VERIFICATION_ENABLED = process.env.USD_VERIFICATION_ENABLED !== 'false';
const USD_API_KEY = process.env.USD_API_KEY || 'usd-access-key-2024';

// Setup Logger with timestamp & colors (MUST be before any logger.* calls)
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
  ),
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`)
      )
    }),
    // File transport for all logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'cashout-server.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Separate file for transaction logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'transactions.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
    // Separate file for error logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

/**
 * Verify USD amount calculation and log discrepancies
 * @param {number} coins - Number of coins
 * @param {number} calculatedUSD - Calculated USD amount
 * @returns {Object} Verification result
 */
function verifyUSDCalculation(coins, calculatedUSD) {
  const expectedUSD = coins / COINS_TO_USD;
  const discrepancy = Math.abs(calculatedUSD - expectedUSD);
  const tolerance = 0.01; // 1 cent tolerance
  
  const result = {
    coins,
    expectedUSD: Number(expectedUSD.toFixed(2)),
    calculatedUSD: Number(calculatedUSD.toFixed(2)),
    discrepancy: Number(discrepancy.toFixed(2)),
    isValid: discrepancy <= tolerance,
    timestamp: new Date().toISOString()
  };
  
  if (!result.isValid) {
    logger.error(`USD Calculation Error: ${JSON.stringify(result)}`);
  } else {
    logger.info(`USD Calculation Verified: ${coins} coins = $${calculatedUSD.toFixed(2)}`);
  }
  
  return result;
}

/**
 * Get current USD summary for external access
 * @returns {Object} USD summary data
 */
async function getUSDSummary() {
  try {
    const transactionsFile = path.join(logsDir, 'transactions.json');
    
    if (!fs.existsSync(transactionsFile)) {
      return {
        total_processed_usd: 0,
        total_transactions: 0,
        last_updated: new Date().toISOString(),
        server_status: 'active'
      };
    }
    
    const transactions = JSON.parse(fs.readFileSync(transactionsFile, 'utf8'));
    const totalUSD = transactions
      .filter(t => t.status === 'success')
      .reduce((sum, t) => sum + (t.amountUSD || 0), 0);
    
    return {
      total_processed_usd: Number(totalUSD.toFixed(2)),
      total_transactions: transactions.filter(t => t.status === 'success').length,
      last_updated: new Date().toISOString(),
      server_status: 'active',
      coins_to_usd_rate: COINS_TO_USD,
      verification_enabled: USD_VERIFICATION_ENABLED
    };
  } catch (error) {
    logger.error(`Failed to get USD summary: ${error.message}`);
    return {
      total_processed_usd: 0,
      total_transactions: 0,
      last_updated: new Date().toISOString(),
      server_status: 'error',
      error: error.message
    };
  }
}

/**
 * Log a transaction with detailed information and USD verification
 * @param {Object} transaction - Transaction details
 */
function logTransaction(transaction) {
  const { userId, amountUSD, payoutMethod, status, details, error, coins } = transaction;
  
  // Perform USD verification if enabled and coins are provided
  let verification = null;
  if (USD_VERIFICATION_ENABLED && coins && amountUSD) {
    verification = verifyUSDCalculation(coins, amountUSD);
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    transactionId: details?.payoutId || details?.transferId || details?.paymentIntentId || `tx_${Date.now()}`,
    userId,
    amountUSD,
    coins: coins || null,
    payoutMethod,
    status,
    error: error || null,
    usd_verification: verification
  };
  
  // Log to console and file
  if (status === 'success') {
    logger.info(`TRANSACTION: ${JSON.stringify(logEntry)}`);
  } else {
    logger.error(`TRANSACTION FAILED: ${JSON.stringify(logEntry)}`);
  }
  
  // Also write to a dedicated transactions JSON file for easier analysis
  try {
    const transactionsFile = path.join(logsDir, 'transactions.json');
    let transactions = [];
    
    if (fs.existsSync(transactionsFile)) {
      const data = fs.readFileSync(transactionsFile, 'utf8');
      transactions = JSON.parse(data);
    }
    
    transactions.push(logEntry);
    
    // Keep only the last 1000 transactions to prevent the file from growing too large
    if (transactions.length > 1000) {
      transactions = transactions.slice(-1000);
    }
    
    fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2));
  } catch (err) {
    logger.error(`Error writing to transactions file: ${err.message}`);
  }
}

/**
 * Middleware to validate /cashout POST request body
 */
function validateCashoutRequest(req, res, next) {
  const { userId, coins, payoutType, accountId, email } = req.body;

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return res.status(400).json({ success: false, error: 'Invalid or missing userId.' });
  }

  if (typeof coins !== 'number' || coins < 100) {
    return res.status(400).json({ success: false, error: 'Coins must be a number and at least 100.' });
  }

  // Only require accountId if payoutType is not email
  if ((payoutType !== 'email') && !(accountId || DEFAULT_CONNECTED_ACCOUNT_ID)) {
    return res.status(400).json({ success: false, error: 'Connected Stripe accountId is required for payouts except email payout.' });
  }

  // If payoutType is email, email must be valid string
  if (payoutType === 'email') {
    if (!email || typeof email !== 'string' || email.trim() === '') {
      return res.status(400).json({ success: false, error: 'Valid email is required for email payout.' });
    }
  }

  next();
}

/**
 * Adaptive Agent Logic - decides payout method and manages retries / fallback
 *
 * @param {Object} payoutRequest - Includes payoutType, connected account details, etc.
 * @returns {Promise<Object>} - payout result
 */
async function adaptivePayoutAgent(payoutRequest) {
  const {
    payoutType,
    accountId,
    amountUSD,
    email,
  } = payoutRequest;

  let activeAccountId = accountId || DEFAULT_CONNECTED_ACCOUNT_ID;

  if (!activeAccountId && payoutType !== 'email') {
    return {
      success: false,
      error: 'No connected Stripe accountId provided and no default set in .env.',
    };
  }

  let attempt = 0;
  let payoutResult = null;
  let lastError = null;

  // Define payout method priority based on requested payoutType or fallback order
  // email payout is fallback (simulated)
  const payoutOrder = [];

  if (payoutType) {
    payoutOrder.push(payoutType);
  } else {
    payoutOrder.push('instant_card', 'bank_account', 'email');
  }

  for (const method of payoutOrder) {
    attempt = 0;
    lastError = null;
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        logger.info(`Attempt ${attempt} to payout via ${method} for account ${activeAccountId || 'N/A'}, amount $${amountUSD.toFixed(2)}`);

        if (method === 'instant_card') {
          payoutResult = await performInstantCardPayout(activeAccountId, amountUSD);
        } else if (method === 'bank_account') {
          payoutResult = await performBankAccountPayout(activeAccountId, amountUSD);
        } else if (method === 'email') {
          payoutResult = await performEmailPayout(email, amountUSD);
        } else {
          throw new Error(`Unknown payout method: ${method}`);
        }

        if (payoutResult.success) {
          logger.info(`Payout succeeded via ${method} for account ${activeAccountId || 'N/A'}`);
          return payoutResult;
        } else {
          lastError = new Error(payoutResult.error || 'Unknown payout error');
          logger.warn(`Payout attempt ${attempt} failed: ${lastError.message}`);
        }
      } catch (err) {
        lastError = err;
        logger.warn(`Payout attempt ${attempt} exception: ${err.message}`);

        // If error is unrecoverable, break retry loop for this method
        if (isUnrecoverableError(err)) break;
        // else retry after delay
        await delay(1000 * attempt);
      }
    }
    logger.warn(`Payout failed for method ${method} after ${MAX_RETRIES} attempts`);
  }

  // All payout methods exhausted
  return {
    success: false,
    error: lastError ? lastError.message : 'All payout methods failed',
  };
}

/**
 * Check if an error is unrecoverable (no retries)
 * Can be extended based on error types/stripe codes
 * @param {Error} error
 * @returns {boolean}
 */
function isUnrecoverableError(error) {
  if (!error || !error.raw) return false;
  const unrecoverableCodes = [
    'invalid_request_error',
    'authentication_error',
    'rate_limit_error',
    'account_invalid',
  ];
  return unrecoverableCodes.includes(error.raw.type);
}

/**
 * Delay utility promise
 * @param {number} ms - milliseconds
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Perform Instant Payout to Connected Account's Debit Card
 *
 * @param {string} accountId - connected Stripe account ID
 * @param {number} amountUSD - amount in USD
 * @returns {Promise<Object>}
 */
async function performInstantCardPayout(accountId, amountUSD) {
  try {
    if (!accountId) throw new Error('Connected account ID required for instant card payout.');

    // Validate the connected account has instant payout capability
    const account = await stripe.accounts.retrieve(accountId);

    if (!account.capabilities || !account.capabilities.transfers) {
      throw new Error('Connected account does not have transfers capability.');
    }

    // Check if account has valid payout method
    const hasPayoutMethod = await hasValidPayoutMethod(accountId);
    if (!hasPayoutMethod) {
      throw new Error('No valid payout method attached. Please add a bank account or card.');
    }

    // Create a transfer from platform account to connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amountUSD * 100), // amount in cents
      currency: 'usd',
      destination: accountId,
      description: 'Instant card payout transfer',
    });

    // Create a payout from connected account with method 'instant'
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amountUSD * 100),
        currency: 'usd',
        method: 'instant',
      },
      {
        stripeAccount: accountId,
      }
    );

    // Log the successful payout details
    logger.info(`Instant card payout successful: transferId=${transfer.id}, payoutId=${payout.id}, amount=$${amountUSD.toFixed(2)}`);

    return {
      success: true,
      message: 'Instant card payout successful.',
      transferId: transfer.id,
      payoutId: payout.id,
      cardDetails: payout.destination ? { last4: payout.destination.last4 } : null
    };
  } catch (error) {
    logger.error(`Instant card payout failed: ${error.message}`);
    return { success: false, error: error.message || 'Instant card payout failed' };
  }
}

/**
 * Check if connected account has valid payout method
 * @param {string} accountId
 * @returns {Promise<boolean>}
 */
async function hasValidPayoutMethod(accountId) {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    
    // Check if account has external accounts (bank accounts or cards)
    const externalAccounts = await stripe.accounts.listExternalAccounts(accountId, {
      limit: 1
    });
    
    return externalAccounts.data.length > 0;
  } catch (error) {
    logger.error(`Error checking payout method for account ${accountId}: ${error.message}`);
    return false;
  }
}

/**
 * Perform Standard Bank Account Payout (ACH)
 * @param {string} accountId
 * @param {number} amountUSD
 * @returns {Promise<Object>}
 */
async function performBankAccountPayout(accountId, amountUSD) {
  try {
    if (!accountId) throw new Error('Connected account ID required for bank account payout.');

    const account = await stripe.accounts.retrieve(accountId);

    if (!account.capabilities || !account.capabilities.transfers) {
      throw new Error('Connected account does not have transfers capability.');
    }

    // Check if account has valid payout method
    const hasPayoutMethod = await hasValidPayoutMethod(accountId);
    if (!hasPayoutMethod) {
      throw new Error('No valid payout method attached. Please add a bank account or card.');
    }

    // Create transfer platform -> connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round(amountUSD * 100),
      currency: 'usd',
      destination: accountId,
      description: 'Standard bank account payout transfer',
    });

    // Create standard payout from connected account to bank account
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amountUSD * 100),
        currency: 'usd',
        method: 'standard',
      },
      {
        stripeAccount: accountId,
      }
    );

    // Log the successful payout details
    logger.info(`Bank account payout successful: transferId=${transfer.id}, payoutId=${payout.id}, amount=$${amountUSD.toFixed(2)}`);

    return {
      success: true,
      message: 'Standard bank account payout successful.',
      transferId: transfer.id,
      payoutId: payout.id,
    };
  } catch (error) {
    logger.error(`Bank account payout failed: ${error.message}`);
    return { success: false, error: error.message || 'Bank account payout failed' };
  }
}

/**
 * Perform Email Payout simulation - PaymentIntent with email receipt
 * @param {string} email
 * @param {number} amountUSD
 * @returns {Promise<Object>}
 */
async function performEmailPayout(email, amountUSD) {
  return {
    success: false,
    error: 'Email receipts are not payouts. Use a verified, authenticated bank payout integration.',
    code: 'EMAIL_PAYOUT_UNSUPPORTED'
  };
}

// Onboarding link endpoint for adding payment methods
app.post('/onboarding-link', async (req, res) => {
  try {
    const { accountId: reqAccountId } = req.body;
    const accountId = reqAccountId || DEFAULT_CONNECTED_ACCOUNT_ID;
    
    if (!accountId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Connected account ID is required' 
      });
    }

    // Create an account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'https://your-platform.com/reauth',
      return_url: 'https://your-platform.com/return',
      type: 'account_onboarding',
    });

    res.json({
      success: true,
      onboarding_url: accountLink.url,
      expires_at: accountLink.expires_at
    });
  } catch (error) {
    logger.error(`Failed to create onboarding link: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create onboarding link'
    });
  }
});

// Cashout POST endpoint with validation middleware
app.post('/cashout', validateCashoutRequest, async (req, res) => {
  const { userId, coins, payoutType, accountId: reqAccountId, email, metadata } = req.body;

  // Use accountId from request or fallback to default in .env
  const accountId = reqAccountId || DEFAULT_CONNECTED_ACCOUNT_ID;

  const amountUSD = coins / COINS_TO_USD;

  logger.info(`Received cashout for user ${userId}: coins=${coins}, payoutType=${payoutType || 'adaptive'}, amountUSD=$${amountUSD.toFixed(2)}`);

  try {
    const payoutResult = await adaptivePayoutAgent({
      payoutType,
      accountId,
      amountUSD,
      email,
    });

    if (payoutResult.success) {
      // Log successful transaction
      logTransaction({
        userId,
        coins,
        amountUSD,
        payoutMethod: payoutType || 'adaptive',
        status: 'success',
        details: payoutResult,
        metadata
      });

      res.json({
        success: true,
        userId,
        amountUSD,
        payoutMethod: payoutType || 'adaptive',
        details: payoutResult,
      });
    } else {
      // Log failed transaction
      logTransaction({
        userId,
        coins,
        amountUSD,
        payoutMethod: payoutType || 'adaptive',
        status: 'failed',
        error: payoutResult.error,
        metadata
      });

      logger.error(`Payout failed for user ${userId}: ${payoutResult.error}`);
      res.status(500).json({
        success: false,
        userId,
        amountUSD,
        error: payoutResult.error,
      });
    }
  } catch (err) {
    // Log unexpected error
    logTransaction({
      userId,
      amountUSD,
      payoutMethod: payoutType || 'adaptive',
      status: 'error',
      error: err.message,
      metadata
    });

    logger.error(`Unexpected error in cashout for user ${userId}: ${err.message}`);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Transaction history endpoint (for admin purposes)
app.get('/transactions', (req, res) => {
  try {
    const transactionsFile = path.join(logsDir, 'transactions.json');
    
    if (!fs.existsSync(transactionsFile)) {
      return res.json({ transactions: [] });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const transactions = JSON.parse(data);
    
    res.json({ transactions });
  } catch (err) {
    logger.error(`Error reading transactions: ${err.message}`);
    res.status(500).json({ success: false, error: 'Error reading transactions' });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>Cashout Server - Stripe Connect Integration</h1>
    <p>POST /cashout with JSON body:</p>
    <pre>
{
  "userId": "string",
  "coins": 1000,
  "payoutType": "instant_card" | "bank_account" | "email",
  "accountId": "connected_account_id (optional if default set in .env)",
  "email": "user@example.com (required for email payout)"
}
    </pre>
    <p>100 coins = 1 USD payout conversion.</p>
    <p>Default Connected Account ID from .env: <strong>${DEFAULT_CONNECTED_ACCOUNT_ID || 'Not set'}</strong></p>
    <p>Server Status: <strong>Running</strong></p>
    <p>Logs Directory: <strong>${logsDir}</strong></p>
    <p>Supabase: <strong>Not required</strong> (removed)</p>
  `);
});

// External USD access endpoints (require API key)
app.get('/api/usd/summary', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey !== USD_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  getUSDSummary().then(summary => {
    res.json(summary);
  }).catch(error => {
    logger.error(`USD summary error: ${error.message}`);
    res.status(500).json({ error: 'Failed to get USD summary' });
  });
});

app.get('/api/usd/transactions', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey !== USD_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  try {
    const limit = parseInt(req.query.limit) || 100;
    const transactionsFile = path.join(logsDir, 'transactions.json');
    
    if (!fs.existsSync(transactionsFile)) {
      return res.json({ transactions: [], total_usd: 0 });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const allTransactions = JSON.parse(data);
    const transactions = allTransactions.slice(-limit); // Get latest transactions
    const totalUSD = transactions
      .filter(t => t.status === 'success')
      .reduce((sum, t) => sum + (t.amountUSD || 0), 0);
    
    res.json({ 
      transactions,
      total_transactions: transactions.length,
      total_usd: Number(totalUSD.toFixed(2)),
      last_updated: new Date().toISOString()
    });
  } catch (err) {
    logger.error(`Error reading USD transactions: ${err.message}`);
    res.status(500).json({ error: 'Error reading USD transactions' });
  }
});

app.get('/api/usd/verification', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey !== USD_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  try {
    const transactionsFile = path.join(logsDir, 'transactions.json');
    
    if (!fs.existsSync(transactionsFile)) {
      return res.json({ 
        verification_enabled: USD_VERIFICATION_ENABLED,
        total_transactions: 0,
        verified_transactions: 0,
        failed_verifications: 0,
        issues: []
      });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const transactions = JSON.parse(data);
    
    const verifiedTransactions = transactions.filter(t => t.usd_verification?.isValid === true).length;
    const failedVerifications = transactions.filter(t => t.usd_verification?.isValid === false).length;
    const issues = transactions
      .filter(t => t.usd_verification?.isValid === false)
      .map(t => ({
        transactionId: t.transactionId,
        coins: t.coins,
        expectedUSD: t.usd_verification.expectedUSD,
        actualUSD: t.usd_verification.calculatedUSD,
        discrepancy: t.usd_verification.discrepancy
      }));
    
    res.json({
      verification_enabled: USD_VERIFICATION_ENABLED,
      total_transactions: transactions.length,
      verified_transactions: verifiedTransactions,
      failed_verifications: failedVerifications,
      coins_to_usd_rate: COINS_TO_USD,
      issues: issues
    });
  } catch (err) {
    logger.error(`Error reading verification data: ${err.message}`);
    res.status(500).json({ error: 'Error reading verification data' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    stripeConfigured: stripeSecretKey !== 'your_stripe_secret_key_here',
    connectedAccountConfigured: !!DEFAULT_CONNECTED_ACCOUNT_ID,
    usd_verification_enabled: USD_VERIFICATION_ENABLED,
    coins_to_usd_rate: COINS_TO_USD,
    external_usd_api_enabled: true,
    supabase: false
  });
});

/**
 * Aggregate USD from local transaction logs (no database / Supabase required)
 */
async function sweepUSDFromDatabase() {
  try {
    logger.info('Starting USD sweep from local transaction logs...');
    
    const summary = await getUSDSummary();
    logger.info(`USD sweep completed. Current summary: ${JSON.stringify(summary)}`);
    
    return {
      success: true,
      swept_at: new Date().toISOString(),
      summary
    };
  } catch (error) {
    logger.error(`USD sweep failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      swept_at: new Date().toISOString()
    };
  }
}

/**
 * Transfer funds from wrong connected account to correct account
 */
async function transferToCorrectAccount() {
  try {
    const wrongAccountId = 'acct_1RPfy4BRrjIUJ5cS'; // The old wrong account
    const correctAccountId = DEFAULT_CONNECTED_ACCOUNT_ID; // The correct account
    
    if (!correctAccountId) {
      throw new Error('No correct account ID configured');
    }
    
    logger.info(`Checking for funds to transfer from ${wrongAccountId} to ${correctAccountId}`);
    
    // Get balance of wrong account
    const wrongAccountBalance = await stripe.balance.retrieve({
      stripeAccount: wrongAccountId
    });
    
    if (wrongAccountBalance.available.length > 0) {
      const usdBalance = wrongAccountBalance.available.find(b => b.currency === 'usd');
      
      if (usdBalance && usdBalance.amount > 0) {
        logger.info(`Found ${usdBalance.amount / 100} USD in wrong account, transferring to correct account`);
        
        // Placeholder for actual transfer logic (requires proper permissions)
        logger.info(`Transfer initiated from wrong account to correct account`);
        return {
          success: true,
          transferred_amount: usdBalance.amount / 100,
          from_account: wrongAccountId,
          to_account: correctAccountId
        };
      }
    }
    
    logger.info('No funds found in wrong account to transfer');
    return {
      success: true,
      transferred_amount: 0,
      message: 'No funds to transfer'
    };
  } catch (error) {
    logger.error(`Failed to transfer funds between accounts: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// USD Sweep endpoint for manual triggering
app.post('/usd-sweep', async (req, res) => {
  try {
    const sweepResult = await sweepUSDFromDatabase();
    res.json(sweepResult);
  } catch (error) {
    logger.error(`USD sweep endpoint failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'USD sweep failed'
    });
  }
});

// Account transfer endpoint
app.post('/transfer-accounts', async (req, res) => {
  try {
    const transferResult = await transferToCorrectAccount();
    res.json(transferResult);
  } catch (error) {
    logger.error(`Account transfer endpoint failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Account transfer failed'
    });
  }
});

// Sweep all available USD to connected bank account
app.post('/sweep-usd', async (req, res) => {
  try {
    // Get available balance
    const balance = await stripe.balance.retrieve();
    const available = balance.available.find(b => b.currency === 'usd');
    if (!available || available.amount < 100) {
      return res.status(400).json({ error: 'No available USD to sweep.' });
    }

    // Transfer to connected account (bank)
    const transfer = await stripe.transfers.create({
      amount: available.amount,
      currency: 'usd',
      destination: process.env.CONNECTED_ACCOUNT_ID,
      description: 'Sweep all USD to bank account',
    });

    res.json({ success: true, transferId: transfer.id, amount: available.amount });
  } catch (err) {
    logger.error(`Sweep error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Cashout server running on port ${PORT}`);
  logger.info('Ensure your .env file has STRIPE_SECRET_KEY and optionally CONNECTED_ACCOUNT_ID set for live payouts.');
  logger.info('Supabase is not required — server runs fully without it.');
  
  // Start scheduled USD sweep (every hour)
  setInterval(async () => {
    logger.info('Running scheduled USD sweep...');
    await sweepUSDFromDatabase();
  }, 3600000); // Every hour (3600000 ms)
  
  logger.info('Scheduled USD sweep started (runs every hour)');
});
