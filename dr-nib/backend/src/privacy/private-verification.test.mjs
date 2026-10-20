import test from 'node:test';import assert from 'node:assert/strict';import{validatePrivateClaims,verifyAndRepairPrivateReport,verifyPrivateReportClaims,verifyPrivateReportPassages,privateVerificationCanRecover}from'./private-verification.js';
const docs=[{text:'The recorded total was 126 litres over four weeks.'}],claim={text:'Water total was 126 litres.',verdict:'supported',sourceIds:[1],quote:'The recorded total was 126 litres'};
test('a supported sampled claim needs an actual literal passage and numeric citation index',()=>{
 assert.equal(validatePrivateClaims({claims:[claim]},docs)[0].quote,claim.quote);
 for(const sourceIds of [['1'],[0],[2],['PRIVATE_CANARY']])assert.throws(()=>validatePrivateClaims({claims:[{...claim,sourceIds}]},docs),{message:'PRIVATE_VERIFICATION_SOURCE_INVALID'});
 for(const quote of ['The recorded total...four weeks','The total was 98 litres','PRIVATE_CANARY',''])assert.throws(()=>validatePrivateClaims({claims:[{...claim,quote}]},docs),{message:'PRIVATE_VERIFICATION_QUOTE_INVALID'});
});
test('invalid judgments, unsupported claims and wholly unknown checks cannot approve a private report',()=>{
 for(const claims of [[],Array(9).fill(claim),[{...claim,verdict:'probably'}],[{...claim,text:''}]])assert.throws(()=>validatePrivateClaims({claims},docs),{message:'PRIVATE_VERIFICATION_SCHEMA_INVALID'});
 assert.throws(()=>validatePrivateClaims({claims:[{...claim,verdict:'unsupported'}]},docs),{message:'PRIVATE_UNSUPPORTED_REPORT'});
 assert.throws(()=>validatePrivateClaims({claims:[{...claim,verdict:'unknown',sourceIds:[],quote:''}]},docs),{message:'PRIVATE_VERIFICATION_INSUFFICIENT'});
});

test('only validator-created failures carry bounded encrypted claim diagnostics',async()=>{
 const {privateActionFailure}=await import('./private-action-failure.js');
 let failure;try{validatePrivateClaims({claims:[{...claim,verdict:'unsupported'}]},docs)}catch(e){failure=e}
 assert.deepEqual(privateActionFailure(failure),{error:'PRIVATE_UNSUPPORTED_REPORT',verification:{rejectedClaims:[{text:claim.text,sourceIds:[1]}]}});
 const forged=Object.assign(Error('PRIVATE_UNSUPPORTED_REPORT'),{verification:{rejectedClaims:[{text:'SECRET'}]}});
 assert.deepEqual(privateActionFailure(forged),{error:'PRIVATE_UNSUPPORTED_REPORT'});
});

test('one content repair is reverified; a second rejection or an unknown inference never retries',async()=>{
 let verifies=0,repairs=0;const unsupported=()=>validatePrivateClaims({claims:[{...claim,verdict:'unsupported'}]},docs);
 const result=await verifyAndRepairPrivateReport({markdown:'draft',verify:async draft=>{verifies++;if(draft==='draft')unsupported();return validatePrivateClaims({claims:[claim]},docs)},repair:async(draft,rejected)=>{repairs++;assert.equal(rejected[0].text,claim.text);return 'corrected'},validateRevision:()=>{}});
 assert.equal(result.markdown,'corrected');assert.equal(verifies,2);assert.equal(repairs,1);
 verifies=0;repairs=0;
 await assert.rejects(verifyAndRepairPrivateReport({markdown:'draft',verify:async()=>{verifies++;unsupported()},repair:async()=>{repairs++;return 'still unsupported'},validateRevision:()=>{}}),{message:'PRIVATE_UNSUPPORTED_REPORT'});
 assert.equal(verifies,2);assert.equal(repairs,1);
 await assert.rejects(verifyAndRepairPrivateReport({markdown:'draft',verify:async()=>{throw Error('PHALA_PRIVATE_AI_UNAVAILABLE')},repair:async()=>{assert.fail('Unknown inference must never replay')},validateRevision:()=>{}}),{message:'PHALA_PRIVATE_AI_UNAVAILABLE'});
});

test('a completed invalid quote gets one bounded correction with strict source matching',async()=>{
 let calls=0,repairs=0;
 const result=await verifyPrivateReportClaims({docs,parse:JSON.parse,onRepair:async()=>{repairs++},request:async previousFailure=>{
  calls++;assert.equal(previousFailure,calls===1?undefined:'PRIVATE_VERIFICATION_QUOTE_INVALID');
  return JSON.stringify({claims:[{...claim,quote:calls===1?'The recorded total was 126  litres':claim.quote}]});
 }});
 assert.equal(calls,2);assert.equal(repairs,1);assert.equal(result.claims[0].quote,claim.quote);
});

test('exhausted completed-output repair is recoverable but fabricated and transport failures never retry',async()=>{
 let calls=0;
 await assert.rejects(verifyPrivateReportClaims({docs,parse:JSON.parse,request:async()=>{calls++;return JSON.stringify({claims:[{...claim,quote:'unsupported wording'}]})}}),error=>error.message==='PRIVATE_VERIFICATION_QUOTE_INVALID'&&privateVerificationCanRecover(error));
 assert.equal(calls,2);
 for(const message of ['PHALA_PRIVATE_AI_RECEIPT_FAILED','PRIVATE_VERIFICATION_QUOTE_INVALID','PRIVATE_MODEL_JSON_INVALID']){
  calls=0;const failure=Error(message);
  await assert.rejects(verifyPrivateReportClaims({docs,parse:JSON.parse,request:async()=>{calls++;throw failure}}),error=>error===failure&&!privateVerificationCanRecover(error));
  assert.equal(calls,1);
 }
});

test('completed malformed JSON can be corrected while unknown or contradicted claims are never promoted',async()=>{
 let calls=0;
 const parse=value=>{try{return JSON.parse(value)}catch{throw Error('PRIVATE_MODEL_JSON_INVALID')}};
 await verifyPrivateReportClaims({docs,parse,request:async()=>++calls===1?'broken':JSON.stringify({claims:[claim]})});assert.equal(calls,2);
 for(const verdict of ['unknown','unsupported']){
  calls=0;await assert.rejects(verifyPrivateReportClaims({docs,parse,request:async()=>{calls++;return JSON.stringify({claims:[{...claim,verdict,sourceIds:[],quote:''}]})}}),error=>privateVerificationCanRecover(error));
  assert.equal(calls,1);
 }
});

test('passage selection attaches literal source bytes and derives the citation instead of trusting model quotes',async()=>{
 const excerpt='The recorded total was 126 litres over four weeks.';
 const result=await verifyPrivateReportPassages({docs,excerpts:[{title:'Synthetic observations',citationIndex:1,excerpt}],parse:JSON.parse,request:async passages=>{
  assert.deepEqual(passages,[{id:'p0',sourceId:1,title:'Synthetic observations',text:excerpt}]);
  return JSON.stringify({claims:[{text:claim.text,verdict:'supported',passageId:'p0',quote:'forged words',sourceIds:[99]}]});
 }});
 assert.deepEqual(result.claims,[{text:claim.text,verdict:'supported',sourceIds:[1],quote:excerpt}]);
});

test('fabricated passage IDs, unsupported claims and unknown transport cannot approve or retry a report',async()=>{
 const input={docs,excerpts:[{title:'Evidence',citationIndex:1,excerpt:docs[0].text}],parse:JSON.parse};let calls=0;
 for(const [verdict,passageId,code] of [['supported','p999','PRIVATE_VERIFICATION_SOURCE_INVALID'],['unsupported','p0','PRIVATE_UNSUPPORTED_REPORT'],['unknown',null,'PRIVATE_VERIFICATION_INSUFFICIENT']]){
  calls=0;await assert.rejects(verifyPrivateReportPassages({...input,request:async()=>{calls++;return JSON.stringify({claims:[{text:claim.text,verdict,passageId}]})}}),error=>error.message===code&&privateVerificationCanRecover(error));assert.equal(calls,1);
 }
 calls=0;const unknown=Error('PHALA_PRIVATE_AI_RECEIPT_FAILED');await assert.rejects(verifyPrivateReportPassages({...input,request:async()=>{calls++;throw unknown}}),error=>error===unknown);assert.equal(calls,1);
 await assert.rejects(verifyPrivateReportPassages({...input,excerpts:[{citationIndex:1,excerpt:'fabricated source bytes'}],request:()=>assert.fail('Invalid evidence must not dispatch')}),/PRIVATE_VERIFICATION_SOURCE_INVALID/);
});
