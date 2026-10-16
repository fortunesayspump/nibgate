import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPrivateDemoRunner,createCiphertextReportSink,createCiphertextReportReader} from './private-demo.js';
import {generateFixtureRecipient,sealHpkeSource,openHpkeReport} from './source-hpke.js';

const canary='HARMLESS_SYNTHETIC_PRIVATE_CANARY';
async function fixture() {
  const guest=await generateFixtureRecipient(),browser=await generateFixtureRecipient();
  const run={id:randomUUID(),userId:'tenant_fixture',metadata:{privacyMode:'confidential'}};
  const context={tenantId:run.userId,runId:run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:guest.recipientId};
  const sourceEnvelope=await sealHpkeSource({recipientPublicKey:guest.publicKey,context,plaintext:Buffer.from(JSON.stringify({question:'What does the source establish?',title:'Synthetic note',sourceText:canary,browserPublicKey:Buffer.from(browser.publicKey).toString('base64')}))});
  const writes=[],calls=[];
  const db={researchReport:{create:async args=>{writes.push(args);return args.data}}};
  const aiPort={infer:async input=>{calls.push(input);return {choices:[{message:{content:`## Finding\n\n${canary} [1].`}}]}}};
  const runner=createPrivateDemoRunner({aiPort,reportSink:createCiphertextReportSink(db)});
  return {guest,browser,run,sourceEnvelope,writes,calls,runner};
}
test('single-source Dr. Nib prompt executes only inside runner, DB receives HPKE report ciphertext',async()=>{
  const f=await fixture();
  const out=await f.runner.execute({run:f.run,sourceEnvelope:f.sourceEnvelope,guestPrivateKey:f.guest.privateKey,guestPublicKey:f.guest.publicKey,model:'fixture/model'});
  assert.equal(out.encrypted,true);
  assert.equal(f.calls.length,1);
  assert.ok(JSON.stringify(f.calls[0]).includes(canary)); // guest-side only
  assert.equal(f.writes.length,1);
  assert.ok(!JSON.stringify(f.writes).includes(canary));
  const stored=JSON.parse(f.writes[0].data.markdown);
  const bytes=await openHpkeReport({recipientPrivateKey:f.browser.privateKey,expectedContext:stored.envelope.context,envelope:stored.envelope});
  assert.ok(JSON.parse(new TextDecoder().decode(bytes)).markdown.includes(canary));
});
test('wrong guest key, tenant, or provider error fails closed before report DB write',async()=>{
  const f=await fixture();
  const other=await generateFixtureRecipient();
  for(const change of [{guestPrivateKey:other.privateKey},{guestPublicKey:other.publicKey},{run:{...f.run,userId:'wrong_tenant'}}])
    await assert.rejects(f.runner.execute({run:f.run,sourceEnvelope:f.sourceEnvelope,guestPrivateKey:f.guest.privateKey,guestPublicKey:f.guest.publicKey,model:'fixture/model',...change}),{code:'PRIVATE_DEMO_UNAVAILABLE'});
  assert.equal(f.writes.length,0);
  const bad=createPrivateDemoRunner({aiPort:{infer:async()=>{throw new Error(canary)}},reportSink:createCiphertextReportSink({researchReport:{create:async args=>{f.writes.push(args)}}})});
  await assert.rejects(bad.execute({run:f.run,sourceEnvelope:f.sourceEnvelope,guestPrivateKey:f.guest.privateKey,guestPublicKey:f.guest.publicKey,model:'fixture/model'}),error=>error.code==='PRIVATE_DEMO_UNAVAILABLE'&&!error.message.includes(canary));
  assert.equal(f.writes.length,0);
});
test('encrypted file bytes are parsed inside guest using existing Dr. Nib parser seam',async()=>{
  const f=await fixture(),parses=[];
  const runner=createPrivateDemoRunner({aiPort:{infer:async x=>{f.calls.push(x);return {choices:[{message:{content:'Synthetic report'}}]}}},
    reportSink:createCiphertextReportSink({researchReport:{create:async x=>{f.writes.push(x);return x.data}}}),
    parseDocument:async(name,bytes)=>{parses.push({name,bytes});return {text:canary}}});
  const file=Buffer.from('%PDF-1.7\nSynthetic fixture only');
  const envelope=await sealHpkeSource({recipientPublicKey:f.guest.publicKey,
    context:{tenantId:f.run.userId,runId:f.run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:f.guest.recipientId},
    plaintext:Buffer.from(JSON.stringify({question:'What does the statement establish?',title:'Synthetic statement',fileName:'statement.pdf',fileBase64:file.toString('base64'),browserPublicKey:Buffer.from(f.browser.publicKey).toString('base64')}))});
  await runner.execute({run:f.run,sourceEnvelope:envelope,guestPrivateKey:f.guest.privateKey,guestPublicKey:f.guest.publicKey,model:'fixture/model'});
  assert.equal(parses.length,1);assert.equal(parses[0].name,'statement.pdf');assert.ok(parses[0].bytes.equals(file));
  assert.equal(f.calls.length,1);assert.ok(JSON.stringify(f.calls[0]).includes(canary));
  assert.ok(!JSON.stringify(f.writes).includes(canary));
  assert.ok(!JSON.stringify(f.writes).includes(file.toString('base64')));
});
test('ciphertext report reader verifies tenant, run and report before returning envelope',async()=>{
  const f=await fixture();
  const out=await f.runner.execute({run:f.run,sourceEnvelope:f.sourceEnvelope,guestPrivateKey:f.guest.privateKey,guestPublicKey:f.guest.publicKey,model:'fixture/model'});
  const reader=createCiphertextReportReader({researchRun:{findUnique:async()=>f.run},researchReport:{findFirst:async()=>f.writes[0].data}});
  assert.deepEqual(await reader({tenantId:f.run.userId,runId:f.run.id,reportId:out.id}),JSON.parse(f.writes[0].data.markdown).envelope);
  assert.equal(await reader({tenantId:'wrong_tenant',runId:f.run.id,reportId:out.id}),null);
  assert.equal(await reader({tenantId:f.run.userId,runId:f.run.id,reportId:randomUUID()}),null);
  assert.ok(!JSON.stringify(f.writes).includes(canary));
});
test('late-page evidence survives existing writer excerpt cap and truncation is disclosed',async()=>{
  const f=await fixture(),late='HARMLESS_SYNTHETIC_LATE_PAGE_CANARY';
  const long='a'.repeat(8000)+late;
  const runner=createPrivateDemoRunner({aiPort:{infer:async x=>{f.calls.push(x);return {choices:[{message:{content:'Synthetic report'}}]}}},
    reportSink:createCiphertextReportSink({researchReport:{create:async x=>{f.writes.push(x);return x.data}}}),
    parseDocument:async()=>({text:long,truncated:true})});
  const file=Buffer.from('%PDF-1.7\nSynthetic fixture only');
  const envelope=await sealHpkeSource({recipientPublicKey:f.guest.publicKey,context:{tenantId:f.run.userId,runId:f.run.id,objectId:randomUUID(),revision:1,purpose:'source',recipientId:f.guest.recipientId},
    plaintext:Buffer.from(JSON.stringify({question:'What does the statement establish?',title:'Synthetic statement',fileName:'statement.pdf',fileBase64:file.toString('base64'),browserPublicKey:Buffer.from(f.browser.publicKey).toString('base64')}))});
  await runner.execute({run:f.run,sourceEnvelope:envelope,guestPrivateKey:f.guest.privateKey,guestPublicKey:f.guest.publicKey,model:'fixture/model'});
  assert.ok(f.calls[0].messages[1].content.includes(late));
  const stored=JSON.parse(f.writes[0].data.markdown).envelope;
  const bytes=await openHpkeReport({recipientPrivateKey:f.browser.privateKey,expectedContext:stored.context,envelope:stored});
  assert.match(JSON.parse(Buffer.from(bytes).toString()).markdown,/Only the first 100,000 extracted characters were analyzed/);
  assert.ok(!JSON.stringify(f.writes).includes(late));
});
