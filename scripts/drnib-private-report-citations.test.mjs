import test from 'node:test';import assert from 'node:assert/strict';import {cleanPrivateReportCitations as clean} from '../packages/internal/src/private-report-citations.js';
test('a valid adjacent reference survives removal of an unresolvable extra marker',()=>{
 for(const value of ['Claim [1] [3].','Claim [1][3].','Claim [1, 3].'])assert.deepEqual(clean(value,2),{markdown:'Claim [1].',invalid:[]});
 assert.deepEqual(clean('Claim [2], [1], [3].',2),{markdown:'Claim [2, 1].',invalid:[]});
});
test('standalone invalid references remain detectable, never mapped to another source',()=>assert.deepEqual(clean('Claim [3].',2),{markdown:'Claim [3].',invalid:[3]}));
test('code, valid references and numeric link labels remain intact',()=>{
 const text='Use `matrix[1][3]`.\n```python\na[1][3]\n```\nClaim [1] [2]. [3](https://example.com) [1] [3](https://example.com)';assert.deepEqual(clean(text,2),{markdown:text,invalid:[]});
});
