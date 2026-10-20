import test from 'node:test';
import assert from 'node:assert/strict';
import {withPrivateLlmPort} from '../dr-nib/backend/src/llm/provider.js';
import {generateIntakeBatch} from '../dr-nib/backend/src/llm/generate.js';

test('accepting an explicit empty intake is opt-in; ordinary intake retains its fallback',async()=>{
 const port={privateVerifiedTransport:'phala-aci-v1',chat:async()=>({text:'{"questions":[]}',model:'synthetic',usage:null,raw:{}})};
 const ordinary=await withPrivateLlmPort(port,()=>generateIntakeBatch({topic:'synthetic fully specified brief'}));
 assert.equal(ordinary.source,'fallback');
 const confidential=await withPrivateLlmPort(port,()=>generateIntakeBatch({topic:'synthetic fully specified brief',allowEmpty:true}));
 assert.equal(confidential.source,'llm');assert.deepEqual(confidential.questions,[]);
});
