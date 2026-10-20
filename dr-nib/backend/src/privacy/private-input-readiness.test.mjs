import test from 'node:test';import assert from 'node:assert/strict';
import {privateSourceSetDigest,requirePrivateFundingInputs} from './private-input-readiness.js';
test('money preparation accepts only the measured plan and its exact current source set',async()=>{
 let sources=[{id:'synthetic-a',digest:'a'.repeat(64)}],manifest={digest:'b'.repeat(64)};
 const tx={privateClientObject:{findFirst:async()=>manifest,findMany:async()=>sources}};
 const run={id:'synthetic-run',metadata:{privateFundingInputs:{version:1,webApproved:false,sourceCount:1,sourceSetDigest:privateSourceSetDigest(sources),manifestDigest:manifest.digest}}};
 await requirePrivateFundingInputs(tx,run);
 sources=[{...sources[0],digest:'c'.repeat(64)}];await assert.rejects(requirePrivateFundingInputs(tx,run));
 sources=[];await assert.rejects(requirePrivateFundingInputs(tx,run));
 sources=[{id:'synthetic-a',digest:'a'.repeat(64)}];manifest={digest:'d'.repeat(64)};await assert.rejects(requirePrivateFundingInputs(tx,run));
 await assert.rejects(requirePrivateFundingInputs(tx,{id:run.id,metadata:{}}));
});
