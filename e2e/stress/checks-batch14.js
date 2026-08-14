// Batch 14 — Subblog content-type reader matrix + ratings widget.
const { subblogReaderMatrix, ratingsMatrix } = require('./matrix-generators.js');

const checks = [
  ...subblogReaderMatrix(),
  ...ratingsMatrix(),
];

module.exports = { name: 'batch14-subblog-reader', checks };