import {expect,it} from 'vitest';
import {citedTipCandidates} from './tip-candidates.js';
it('only allows high-trust external sources cited in the report body',()=>{
  const citations=[{url:'https://creator.example/a',trust:0.9},{url:'https://creator.example/b',trust:0.3},{url:'/private/source',trust:1},{url:'https://unused.example',trust:1}];
  const out=citedTipCandidates({markdown:'Evidence [1, 2] and [3].\n## References\n[4] Unused',citations});
  expect(out.map(s=>s.url)).toEqual(['https://creator.example/a']);
});
