// Batch 10 — Type × Access gate matrix: parametrized across all 5 content types
// × access modes × wallet states (anon / whitelisted buyer / banned).
const { gateAnonMatrix, gateWhitelistedMatrix, gateBannedMatrix } = require('./matrix-generators.js');

const checks = [
  ...gateAnonMatrix(),
  ...gateWhitelistedMatrix(),
  ...gateBannedMatrix(),
];

module.exports = { name: 'batch10-types-gate', checks };