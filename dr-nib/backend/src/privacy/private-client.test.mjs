import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrivateClient} from './private-client.js';
import {createGuestSessionManager} from './guest-session.js';
import {createPrivateDemoRunner,createCiphertextReportSink} from './private-demo.js';
import {phalaSessionReportData} from './phala-verifier.js';

const canary='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
const run={id:randomUUID(),userId:'tenant_fixture',status:'draft',metadata:{privacyMode:'confidential'}};
const policy={expectedComposeHash:'11'.repeat(32),expectedOsHash:'22'.repeat(32),expectedAppId:'44'.repeat(20),expectedKeyProvider:{name:'kms',id:'33'.repeat(32)},reviewedReleaseControls:{sshDisabled:true,debugDisabled:true,plaintextLogsDisabled:true,imagesDigestPinned:true,productionOsImage:true}};
function fixture({badQuote=false,badProof=false}={}) {
  const writes=[],sent=[],trace=[];
  const sink=createCiphertextReportSink({researchReport:{create:async args=>{writes.push(args);return args.data}}});
  const runner=createPrivateDemoRunner({aiPort:{infer:async input=>{sent.push(input);return {choices:[{message:{content:`## Finding\n\n${canary} [1].`}}]}}},reportSink:sink});
  const guest=createGuestSessionManager({getRun:async()=>run,runner,model:'fixture/model',quoteProvider:async()=>({attestation:'aabb'})});
  let opened;
  const transport={
    open:async args=>{trace.push('open');opened=await guest.open(args);return opened},
    prove:async args=>{trace.push('prove');const out=await guest.prove(args);return badProof?{...out,challengeDigest:'0'.repeat(64)}:out},
    execute:async args=>{trace.push('execute');return guest.execute(args)},
    getReport:async({reportId})=>{trace.push('getReport');const item=writes.find(x=>x.data.id===reportId);return JSON.parse(item.data.markdown).envelope},
  };
  const verifyEvidence=async()=>{
    trace.push('verify');
    const report=Buffer.concat([phalaSessionReportData({clientNonce:Buffer.from(opened.clientNonce,'hex'),sessionId:opened.sessionId,recipientPublicKey:Buffer.from(opened.recipientPublicKey,'base64')}),Buffer.alloc(32)]).toString('hex');
    return {is_valid:true,details:{quote_verified:!badQuote,event_log_verified:true,os_image_hash_verified:true,acpi_tables_verified:true,os_image_is_dev:false,tee_variant:'dstack-tdx',tcb_status:'UpToDate',advisory_ids:[],report_data:report,key_provider:policy.expectedKeyProvider,app_info:{compose_hash:policy.expectedComposeHash,os_image_hash:policy.expectedOsHash,app_id:policy.expectedAppId}}};
  };
  return {client:createPrivateClient({transport,verifyEvidence,policy}),writes,sent,trace};
}
test('client verifies quote and actual challenge before sending ciphertext; decrypts report',async()=>{
  const f=fixture();
  const out=await f.client.run({tenantId:run.userId,runId:run.id,question:'What does the note say?',title:'Synthetic note',sourceText:canary});
  assert.ok(out.markdown.includes(canary));
  assert.deepEqual(f.trace,['open','verify','prove','execute','getReport']);
  assert.equal(f.sent.length,1);assert.equal(f.writes.length,1);
  assert.ok(!JSON.stringify(f.writes).includes(canary));
});
test('bad quote or falsified possession digest never sends source to model or database',async()=>{
  for(const opts of [{badQuote:true},{badProof:true}]){
    const f=fixture(opts);
    await assert.rejects(f.client.run({tenantId:run.userId,runId:run.id,question:'What does the note say?',title:'Synthetic note',sourceText:canary}),{code:'PRIVATE_CLIENT_UNAVAILABLE'});
    assert.equal(f.sent.length,0);assert.equal(f.writes.length,0);assert.ok(!f.trace.includes('execute'));
  }
});
