// Batch 16 — Subblog access, newsletter, lifecycle, discovery, dashboard, wallet-auth.
const { subblogAccessMatrix, newsletterMatrix, expiredShareMatrix, draftPublishMatrix, uploadCancelMatrix, searchDiscoveryMatrix, dashboardMatrix, walletAuthMatrix } = require('./matrix-generators.js');

const checks = [
  ...subblogAccessMatrix(),
  ...newsletterMatrix(),
  ...expiredShareMatrix(),
  ...draftPublishMatrix(),
  ...uploadCancelMatrix(),
  ...searchDiscoveryMatrix(),
  ...dashboardMatrix(),
  ...walletAuthMatrix(),
];

module.exports = { name: 'batch16-more-surface', checks };