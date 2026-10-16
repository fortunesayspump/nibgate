import { expect, it } from 'vitest';
import { bestDocumentsByUrl, reportEvidence } from './report-evidence.js';

const url = 'https://creator.example/api/writing/article';
const paid = { url, title: 'Paid: article', text: 'The purchased article explains three specific editing exercises.', acquisition: 'paid' };
const quote = { url, title: 'article quote', text: 'HTTP 402 payment challenge. Quoted price: 0.5 USDC on this Arc network.', acquisition: 'quote' };
const unreadable = { url, title: 'article quote', text: 'HTTP 402 payment challenge. The price could not be read.', acquisition: 'quote' };

it('keeps purchased evidence when a later round sees another 402 for the same URL', () => {
  const source = { id: 'source-1', url, title: paid.title, domain: 'creator.example', relevance: 0.5, trust: 0.8 };
  const evidence = reportEvidence([source], [{ output: { documents: [unreadable] } }, { output: { documents: [quote, paid] } }]);
  expect(evidence[0].excerpt).toBe(paid.text);
});

it('keeps the observed price preview alongside the purchased article for reporting', () => {
  const source = { id: 'source-1', url, title: paid.title, domain: 'creator.example', relevance: 0.5, trust: 0.8 };
  const evidence = reportEvidence([source], [
    { output: { documents: [paid], calls: [{ tool: 'pay_x402', url, ok: true, amount: 0.5 }] } },
    { output: { documents: [quote] } },
  ]);
  expect(evidence[0].excerpt).toContain('Run price preview: HTTP 402 payment challenge. Quoted price: 0.5 USDC');
  expect(evidence[0].excerpt).toContain(paid.text);
});

it('keeps a readable quote over a later unreadable challenge when no purchase occurred', () => {
  expect(bestDocumentsByUrl([unreadable, quote])[0].text).toContain('0.5 USDC');
});

it('scores a bought body once instead of also scoring its preview as a second source', () => {
  expect(bestDocumentsByUrl([quote, paid])).toEqual([paid]);
});

it('gives the writer the actual purchase record before the article body', () => {
  const source = { id: 'source-1', url, title: paid.title, domain: 'creator.example', relevance: 0.5, trust: 0.8 };
  const evidence = reportEvidence([source], [{ output: { documents: [paid], calls: [{ tool: 'unlock_content', url, ok: true, amount: 0.5 }] } }]);
  expect(evidence[0].excerpt).toContain('0.5 USDC paid');
  expect(evidence[0].excerpt).toContain(paid.text);
  expect(evidence[0].excerpt.indexOf('Run acquisition record')).toBeLessThan(evidence[0].excerpt.indexOf(paid.text));
});
