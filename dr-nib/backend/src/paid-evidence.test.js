import { expect, it } from 'vitest';
import { paidEvidenceText } from './paid-evidence.js';

it('uses bought article content without forwarding payment proof into research evidence', () => {
  const text = paidEvidenceText({ content: 'Read aloud and cut ruthlessly.', payment: { paymentId: 'signed-proof' }, resource: { title: 'Edit Like a Pro' } });
  expect(text).toBe('Read aloud and cut ruthlessly.');
  expect(text).not.toContain('signed-proof');
});

it('keeps structured API facts while dropping embedded payment credentials', () => {
  const text = paidEvidenceText({ results: [{ value: 42 }], paymentId: 'signed-proof', authorization: 'Bearer secret' });
  expect(text).toContain('42');
  expect(text).not.toContain('signed-proof');
  expect(text).not.toContain('Bearer secret');
});
