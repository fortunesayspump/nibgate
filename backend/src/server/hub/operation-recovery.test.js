import { describe, expect, it } from 'vitest';
import { isRecoverableRefundPreparationFailure, recoveredRefundOperationDetails } from './operation-recovery.js';

describe('held-tip operation recovery', () => {
  it('reclaims only a proved pre-submission refund preparation failure', () => {
    const base = { operation: 'refund', state: 'reconciliation-required', transactionHash: null };
    expect(isRecoverableRefundPreparationFailure({ ...base, details: 'Holding refund could not be prepared: factory prediction failed.' })).toBe(true);
    expect(isRecoverableRefundPreparationFailure({ ...base, details: 'Holding refund could not be prepared: Transaction creation failed.' })).toBe(true);
    expect(isRecoverableRefundPreparationFailure({ ...base, details: 'HTTP 401 unauthorized\nfunction: predict(bytes32)' })).toBe(true);
    expect(isRecoverableRefundPreparationFailure({ ...base, transactionHash: `0x${'ab'.repeat(32)}`, details: 'factory prediction failed' })).toBe(false);
    expect(isRecoverableRefundPreparationFailure({ ...base, details: 'receipt could not be confirmed' })).toBe(false);
    expect(isRecoverableRefundPreparationFailure({ ...base, operation: 'claim', details: 'HTTP 401 function: predict' })).toBe(false);
  });

  it('replaces credential-bearing diagnostics with bounded audit metadata', () => {
    const updatedAt = new Date('2026-10-24T11:00:00.000Z');
    const details = recoveredRefundOperationDetails({ updatedAt, details: 'https://rpc.invalid/secret' });
    expect(JSON.parse(details)).toEqual({
      recoveredFrom: 'pre-submission-factory-prediction-failure',
      previousUpdatedAt: updatedAt.toISOString(),
    });
    expect(details).not.toContain('secret');
  });
});
