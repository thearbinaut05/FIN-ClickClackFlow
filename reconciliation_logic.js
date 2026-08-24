/**
 * Financial reconciliation helpers for local transaction logs.
 * Used by cashout-server and analytics scripts.
 */

/**
 * @param {Array<{status: string, amountUSD?: number}>} transactions
 * @returns {{ gross: number, net: number, count: number, failed: number }}
 */
function calculateNetRevenue(transactions = []) {
  const successful = transactions.filter((t) => t.status === 'success');
  const failed = transactions.filter((t) => t.status === 'failed' || t.status === 'error');
  const gross = successful.reduce((sum, t) => sum + (Number(t.amountUSD) || 0), 0);
  // Simple fee model: 2.9% + $0.30 style estimate for card rails (optional)
  const estimatedFees = successful.length * 0.3 + gross * 0.029;
  const net = Math.max(0, gross - estimatedFees);
  return {
    gross: Number(gross.toFixed(2)),
    net: Number(net.toFixed(2)),
    count: successful.length,
    failed: failed.length,
    estimatedFees: Number(estimatedFees.toFixed(2)),
  };
}

/**
 * Detect USD calculation mismatches (coins / 100 vs amountUSD).
 * @param {Array<{coins?: number, amountUSD?: number, transactionId?: string}>} transactions
 * @param {number} coinsPerUsd
 */
function findDiscrepancies(transactions = [], coinsPerUsd = 100) {
  const issues = [];
  for (const t of transactions) {
    if (t.coins == null || t.amountUSD == null) continue;
    const expected = t.coins / coinsPerUsd;
    const diff = Math.abs(expected - t.amountUSD);
    if (diff > 0.01) {
      issues.push({
        transactionId: t.transactionId,
        coins: t.coins,
        amountUSD: t.amountUSD,
        expectedUSD: Number(expected.toFixed(2)),
        discrepancy: Number(diff.toFixed(2)),
      });
    }
  }
  return issues;
}

module.exports = { calculateNetRevenue, findDiscrepancies };
