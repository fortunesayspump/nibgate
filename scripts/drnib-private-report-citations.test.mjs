import test from 'node:test';import assert from 'node:assert/strict';import {cleanPrivateReportCitations as clean} from '../packages/internal/src/private-report-citations.js';
import {cleanPrivateModelOutput} from '../packages/internal/src/private-report-citations.js';
test('explicit and implicit reasoning prefixes are excluded from the report and citation checks',()=>{
 for(const prefix of ['<think>Draft notes [99].</think>','Draft notes [99]. </think>','## Draft notes\nHidden prefix.\n</think>']){
  assert.equal(cleanPrivateModelOutput(prefix+'\n# Final report\nClaim [1].'),'# Final report\nClaim [1].');
  assert.deepEqual(clean(prefix+'\n# Final report\nClaim [1].',1),{markdown:'# Final report\nClaim [1].',invalid:[]});
 }
});
test('reasoning-only and unclosed reasoning responses cannot become user-facing prose',()=>{
 for(const s of ['<think>Draft notes','Draft notes.</think>','<think>First</think><think>Unfinished'])assert.throws(()=>cleanPrivateModelOutput(s),/PRIVATE_MODEL_OUTPUT_INVALID/);
});
test('ordinary prose, structured strings, and fenced or inline control-token examples remain unchanged',()=>{
 for(const s of ['# Report\nEvidence [1].','{"example":"</think>"}','Use `</think>` literally.','```text\n<think>example</think>\n```\n# Report'])assert.equal(cleanPrivateModelOutput(s),s);
});
test('a valid adjacent reference survives removal of an unresolvable extra marker',()=>{
 for(const value of ['Claim [1] [3].','Claim [1][3].','Claim [1, 3].'])assert.deepEqual(clean(value,2),{markdown:'Claim [1].',invalid:[]});
 assert.deepEqual(clean('Claim [2], [1], [3].',2),{markdown:'Claim [2, 1].',invalid:[]});
});
test('standalone invalid references remain detectable, never mapped to another source',()=>assert.deepEqual(clean('Claim [3].',2),{markdown:'Claim [3].',invalid:[3]}));
test('code, valid references and numeric link labels remain intact',()=>{
 const text='Use `matrix[1][3]`.\n```python\na[1][3]\n```\nClaim [1] [2]. [3](https://example.com) [1] [3](https://example.com)';assert.deepEqual(clean(text,2),{markdown:text,invalid:[]});
});
