import { describe, it, expect } from 'vitest';
import { selectSources } from './source-selection.js';
import { evidenceWindow } from './tools/evidence.js';

describe('research evidence selection', () => {
  it('preserves selected primary documents and rejects fabricated, repeated indices', async () => {
    const candidates = [{url:'https://example.org/commentary'}, {url:'https://docs.base.org/fees'}, {url:'https://docs.arc.io/fees'}];
    let prompt;
    const result = await selectSources({ brief: {topic:'Official Arc and Base docs only'}, candidates, limit: 3, complete: async args => {
      prompt = args.messages[1].content;
      return {data:{indices:[1,2,1,99,'0'],why:'Primary sources for both networks'},usage:{costUsd:0.002}};
    }});
    expect(result.candidates).toEqual([candidates[1],candidates[2]]);
    expect(result.costUsd).toBe(0.002);
    expect(prompt).toContain('Enforce the user');
    expect(prompt).toContain('Cover each named entity');
  });
  it('does not substitute noncompliant sources when the selector finds none', async () => {
    const result = await selectSources({brief:{},candidates:[{url:'https://example.org'}],limit:6,complete:async()=>({data:{indices:[]}})});
    expect(result.candidates).toEqual([]);
  });
  it('finds supporting passages deep in a document rather than its navigation', () => {
    const text = 'Arc navigation '.repeat(120) + 'Native USDC uses eighteen decimals for gas accounting. ERC20 transfers use six decimals.';
    expect(evidenceWindow(text, 'Native USDC gas accounting eighteen decimals and ERC20 six decimals')).toContain('ERC20 transfers use six decimals');
  });
});
