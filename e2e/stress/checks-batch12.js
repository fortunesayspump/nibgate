// Batch 12 — Mobile viewport + wallet-state transition checks.
const { mobileMatrix, walletStateMatrix } = require('./matrix-generators.js');

const checks = [
  ...mobileMatrix(),
  ...walletStateMatrix(),
];

module.exports = { name: 'batch12-mobile-wallet', checks };