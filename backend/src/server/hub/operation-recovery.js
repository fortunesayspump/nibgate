export function isRecoverableRefundPreparationFailure(operation) {
  if (!operation || operation.operation !== 'refund' || operation.state !== 'reconciliation-required' || operation.transactionHash) return false;
  const details = String(operation.details || '');
  return details.startsWith('Holding refund could not be prepared:')
    || (/\b(?:401|unauthorized)\b/i.test(details) && /\b(?:predict|factory prediction)\b/i.test(details));
}

export function recoveredRefundOperationDetails(operation) {
  return JSON.stringify({
    recoveredFrom: 'pre-submission-factory-prediction-failure',
    previousUpdatedAt: operation?.updatedAt ? new Date(operation.updatedAt).toISOString() : null,
  });
}
