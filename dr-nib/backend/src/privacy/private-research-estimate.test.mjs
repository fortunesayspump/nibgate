import test from 'node:test';import assert from 'node:assert/strict';
import {privateResearchEstimate} from './private-research-estimate.js';
test('forecast separates likely usage from refundable per-call funding headroom',()=>{
 const args={words:500,sections:2,depth:'quick',inputPricePerMillion:200000,outputPricePerMillion:2500000,hostedJev:true};
 const small=privateResearchEstimate(args),large=privateResearchEstimate({...args,words:4000,sections:6});
 assert.equal(small.kind,'forecast');assert.ok(small.estimate<0.04);assert.ok(small.minimumFunding>=0.123);assert.ok(small.minimumFunding<0.15);
 assert.ok(large.estimate>small.estimate);assert.equal(large.minimumFunding,small.minimumFunding);
});
