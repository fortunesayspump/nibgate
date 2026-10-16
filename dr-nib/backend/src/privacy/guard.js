/**
 * First integration gate for the existing Dr. Nib worker.
 * This is a denial guard, not a confidential execution implementation.
 * Remove it only when every private path is replaced and independently tested.
 */
export function isLegacyRun(run) {
  const metadata = run?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  // Existing pre-mode rows have a JSON object but no privacyMode. Accept that
  // historical representation only for compatibility, not as an attestation.
  if (!Object.prototype.hasOwnProperty.call(metadata, 'privacyMode')) return true;
  return metadata.privacyMode === 'legacy';
}

export function isConfidentialRun(run) {
  return run?.metadata && typeof run.metadata === 'object' &&
    !Array.isArray(run.metadata) && run.metadata.privacyMode === 'confidential';
}

export function assertConventionalPath(run) {
  if (!isLegacyRun(run)) {
    const error = new Error('Confidential processing is unavailable on this deployment.');
    error.code = 'CONFIDENTIAL_BOUNDARY_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
}
