import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../llm/provider.js', () => ({ chat: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

import { chat } from '../llm/provider.js';
import { annotateHex, extractChecklist, itemKeywords, coverage } from './stops.js';

describe('stops helpers', () => {
  it('annotates short hex with decimals', () => {
    expect(annotateHex('fee 0x4a817c800 ok')).toBe('fee 0x4a817c800 (20000000000) ok');
    expect(annotateHex('block 0x3ea1919')).toBe('block 0x3ea1919 (65673497)');
  });

  it('keeps hashes and addresses raw', () => {
    const hash = `0x${'ab'.repeat(32)}`;
    expect(annotateHex(`h ${hash}`)).toBe(`h ${hash}`);
  });

  it('collapses long blobs to placeholders', () => {
    const bloom = `0x${'ff'.repeat(512)}`;
    expect(annotateHex(`logs ${bloom}`)).toBe('logs <hex data 1024 chars>');
  });

  it('passes through text without hex', () => {
    expect(annotateHex('plain text 123')).toBe('plain text 123');
  });

  it('extractChecklist returns null items when the model fails', async () => {
    vi.mocked(chat).mockRejectedValue(new Error('down'));
    expect((await extractChecklist('anything')).items).toBeNull();
  });

  it('extractChecklist parses bare measurable lines', async () => {
    vi.mocked(chat).mockResolvedValue({ text: 'base fee gwei\nlatest block number\n- block time seconds\n', usage: null });
    expect((await extractChecklist('measure things')).items).toEqual(['base fee gwei', 'latest block number', 'block time seconds']);
  });

  it('annotated RPC output covers a bare-phrase checklist', () => {
    const obs = annotateHex('{"result":"0x4a817c800"} baseFeePerGas latest block 0x3ea1919 timestamp 1791155723');
    const cov = coverage(['base fee gwei', 'latest block number'], [obs]);
    expect(cov.missing).toEqual([]);
    expect(itemKeywords('base fee gwei')).toContain('gwei');
  });
});
