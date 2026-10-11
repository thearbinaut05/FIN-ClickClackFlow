/* Safety gate on the feature branch only. The old server accepted browser coin
   amounts, arbitrary destinations and simulated-success fallbacks. It must not
   start or sweep funds. New isolated implementation: monetization/server.mjs. */
console.error('Legacy cashout server disabled. Review monetization/README.md and use the TEST-only authenticated service. No funds were moved.');
process.exitCode = 1;
