// Batch 11 — Form-create matrix: UI-publish every content type × access mode.
const { formCreateMatrix, formValidationMatrix, shareAdminFieldMatrix } = require('./matrix-generators.js');

const checks = [
  ...formCreateMatrix(),
  ...formValidationMatrix(),
  ...shareAdminFieldMatrix(),
];

module.exports = { name: 'batch11-types-form', checks };