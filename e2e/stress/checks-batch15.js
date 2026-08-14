// Batch 15 — Lifecycle, security, speed, and human-weird combo checks.
const { lifecycleMatrix, securityMatrix, apiSecurityMatrix, speedMatrix, humanWeirdMatrix } = require('./matrix-generators.js');

const checks = [
  ...lifecycleMatrix(),
  ...securityMatrix(),
  ...apiSecurityMatrix(),
  ...speedMatrix(),
  ...humanWeirdMatrix(),
];

module.exports = { name: 'batch15-lifecycle-security-speed', checks };