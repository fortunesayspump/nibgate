// Build-time trust selection; no remote service, wallet or hardware required.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-private-verifier.ts',import.meta.url),'utf8');
let serial=0;
async function load(overrides={}){
 const values={VERIFIER_URL:'https://verify-drnib-canary.nibgate.xyz/verify',APP_ID:'a'.repeat(40),INSTANCE_ID:'b'.repeat(40),COMPOSE_HASH:'c'.repeat(64),OS_HASH:'d'.repeat(64),KMS_ID:'aabb',RELEASE_CONTROLS:JSON.stringify({sshDisabled:true,debugDisabled:true,plaintextLogsDisabled:true,imagesDigestPinned:true,productionOsImage:true}),...overrides};
 let code=source.replace(/^import .*?;\n/s,'const equalHex=(a,b)=>a===b; const expectedReportData=async()=>"fixture-report";\n');
 code=code.replace(/process\.env\.NEXT_PUBLIC_DRNIB_PRIVATE_([A-Z_]+)/g,(_,key)=>values[key]===undefined?'undefined':JSON.stringify(values[key]));
 code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(code+'\n//'+serial++).toString('base64'));
}
test('Nibgate-hosted endpoint needs deliberate operator-hosted build selection',async()=>{
 assert.equal((await load()).configuredPrivatePolicy(),null);
 const p=(await load({VERIFIER_TRUST_MODE:'operator-hosted'})).configuredPrivatePolicy();
 assert.equal(p.verifierTrustMode,'operator-hosted');assert.equal(p.verifierUrl,'https://verify-drnib-canary.nibgate.xyz/verify');
 assert.equal((await load({VERIFIER_TRUST_MODE:'automatic'})).configuredPrivatePolicy(),null);
 const independent=(await load({VERIFIER_URL:'https://attest.independent.net/verify'})).configuredPrivatePolicy();assert.equal(independent.verifierTrustMode,'independent');
});
test('operator-hosted mode retains HTTPS path, release pins and hardened controls',async()=>{
 for(const overrides of [{VERIFIER_URL:'http://verify.nibgate.xyz/verify'},{VERIFIER_URL:'https://verify.nibgate.xyz/verify?proxy=1'},{VERIFIER_URL:'https://user:secret@verify.nibgate.xyz/verify'},{VERIFIER_URL:'https://verify.nibgate.xyz/health'},{COMPOSE_HASH:''},{OS_HASH:'bad'},{KMS_ID:''},{RELEASE_CONTROLS:'{}'}])assert.equal((await load({VERIFIER_TRUST_MODE:'operator-hosted',...overrides})).configuredPrivatePolicy(),null);
});
test('operator-hosted verification rejects quote-only, incomplete, stale and mismatched verdicts',async()=>{
 const m=await load({VERIFIER_TRUST_MODE:'operator-hosted'}),policy=m.configuredPrivatePolicy();
 const verdict={is_valid:true,details:{quote_verified:true,event_log_verified:true,os_image_hash_verified:true,acpi_tables_verified:true,os_image_is_dev:false,tee_variant:'dstack-tdx',tcb_status:'UpToDate',advisory_ids:[],app_info:{app_id:policy.appId,instance_id:policy.instanceId,compose_hash:policy.composeHash,os_image_hash:policy.osHash},key_provider:{name:'kms',id:policy.kmsId},report_data:'fixture-report'}};
 const original=globalThis.fetch;let response=verdict;
 globalThis.fetch=async(_url,init)=>{assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.mode,'cors');return Response.json(response)};
 const invoke=()=>m.verifyGuestEvidence({session:{sessionId:'fixture',evidence:{attestation:'aa'}},nonce:new Uint8Array(32),publicKey:new Uint8Array(65),policy});
 try{
  await invoke();
  for(const mutate of [x=>delete x.details.os_image_hash_verified,x=>x.details.report_data='old-session',x=>x.details.app_info.compose_hash='wrong',x=>x.details.tcb_status='OutOfDate',x=>x.details.advisory_ids=['advisory'],x=>x.is_valid=false]){response=structuredClone(verdict);mutate(response);await assert.rejects(invoke(),/approved private release/);}
  response={quote:{verified:true}};await assert.rejects(invoke(),/approved private release/);
 }finally{globalThis.fetch=original;}
});
