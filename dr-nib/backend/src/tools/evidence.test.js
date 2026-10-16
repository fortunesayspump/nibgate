import { expect, it, vi } from 'vitest';

const url = 'https://creator.example/api/writing/article';
const findSources = vi.fn(async () => [{ id: 'source-1', url, title: 'Paid article', domain: 'creator.example', relevance: 0.8, trust: 0.7 }]);
const findSteps = vi.fn(async () => [
  { output: { documents: [{ url, title: 'price check', text: 'HTTP 402 payment challenge. The price could not be read.', acquisition: 'quote' }] } },
  { output: { documents: [{ url, title: 'Paid article', text: 'Read the draft aloud to catch awkward phrasing.', acquisition: 'paid' }], calls: [{ tool: 'unlock_content', url, ok: true, amount: 0.5 }] } },
]);

vi.mock('../db.js', () => ({ db: { researchSource: { findMany: findSources }, researchStep: { findMany: findSteps } } }));

it('verifies a claim against purchased text and its acquisition record, not a later 402', async () => {
  const { searchEvidence } = await import('./evidence.js');
  const found = await searchEvidence('run-1', { query: 'Did the paid article say to read a draft aloud?' });
  expect(found.matches).toHaveLength(1);
  expect(found.matches[0].excerpt).toContain('Read the draft aloud');
  expect(found.matches[0].excerpt).toContain('0.5 USDC paid');
  expect(found.matches[0].excerpt).not.toContain('HTTP 402');
});
