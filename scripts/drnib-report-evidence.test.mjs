import assert from 'node:assert/strict';
import test from 'node:test';
import { reportEvidence, sectionEvidence, reportSources } from '../dr-nib/backend/src/report-evidence.js';
import { sectionMessages, thinkingMessages } from '../dr-nib/backend/src/llm/prompts.js';

test('retains earlier-round passages and selects the newest valid version', () => {
  const sources = [{ id: 'a', url: 'https://a.test' }, { id: 'b', url: 'https://b.test' }];
  const evidence = reportEvidence(sources, [
    { output: { documents: [{ url: 'https://b.test', text: 'Newest B' }] } },
    { output: { documents: [{ url: 'https://a.test', text: 'Earlier A' }, { url: 'https://b.test', text: 'Old B' }] } },
  ]);
  assert.equal(evidence[0].excerpt, 'Earlier A');
  assert.equal(evidence[1].excerpt, 'Newest B');
  const selected = sectionEvidence([{ url: 'https://b.test', excerpt: 'Relevant B' }], evidence);
  const prompt = sectionMessages({ brief: {}, section: 'B', sources: selected })[1].content;
  assert.match(prompt, /\[2\]/);
  assert.doesNotMatch(prompt, /\[1\]/);
});

test('report citations remain attached to the saved version when rankings change', () => {
  const saved = [{ url: 'https://a.test' }, { url: 'https://b.test' }];
  assert.deepEqual(reportSources({ citations: saved }, [...saved].reverse()), saved);
});

test('intake summaries retain the original research context', () => {
  const prompt = thinkingMessages({ brief: { topic: 'Compare Arc and Base' }, question: { prompt: 'Audience?' }, answer: 'Engineers' })[1].content;
  assert.match(prompt, /Compare Arc and Base/);
  assert.match(prompt, /already present in the brief/);
});
