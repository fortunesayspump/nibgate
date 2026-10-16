/** No production attestation verifier or independently governed key policy exists yet. */
export async function verifyRecipientForPrivateSource(_request) {
  const error = new Error('Confidential processing is unavailable on this deployment.');
  error.code = 'CONFIDENTIAL_BOUNDARY_UNAVAILABLE';
  error.status = 503;
  throw error;
}
