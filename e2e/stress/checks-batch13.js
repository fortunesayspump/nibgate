// Batch 13 — Reader render matrix: free content renders per type.
const { readerMediaMatrix } = require('./matrix-generators.js');

const checks = [
  ...readerMediaMatrix(),
];

module.exports = { name: 'batch13-reader', checks };