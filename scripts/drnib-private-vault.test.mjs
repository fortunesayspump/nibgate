import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
// Exercise the browser module without adding a test runtime or requiring
// TypeScript support from Node's test discovery of scripts/*.test.mjs.
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const source=readFileSync(new URL('../frontend/src/lib/dr-nib-private-vault.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const {createPrivateVault,recoverPrivateVault,createPrivateProjectKeys,openPrivateProjectKeys,samePrivateVaultEnvelope,rewrapPrivateProjectKeys,privateVaultEnrollmentAction}=
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const tenantId='vault-local-fixture';
const expected=vault=>({tenantId:vault.tenantId,vaultId:vault.vaultId});
const denied={message:'PRIVATE_VAULT_UNAVAILABLE'};
const clone=value=>JSON.parse(JSON.stringify(value));

test('another device recovers independent project keys from JSON ciphertext and the recovery secret',async()=>{
  const {vault,recoverySecret,recoveryEnvelope}=await createPrivateVault(tenantId);
  const runId=randomUUID();
  const {secrets,envelope}=await createPrivateProjectKeys(vault,runId);
  // Only these JSON values are stored by the ordinary server. The recovery
  // secret represents a separate user-controlled recovery channel.
  const stored=JSON.parse(JSON.stringify({recoveryEnvelope,envelope}));
  assert.equal(JSON.stringify(stored).includes(Buffer.from(recoverySecret).toString('base64')),false);
  for(const bytes of Object.values(secrets))assert.equal(JSON.stringify(stored).includes(Buffer.from(bytes).toString('base64')),false);
  const other=await recoverPrivateVault(recoverySecret,stored.recoveryEnvelope,expected(vault));
  assert.deepEqual(await openPrivateProjectKeys(other,runId,stored.envelope),secrets);
  assert.notDeepEqual(secrets.reportKeySeed,secrets.workerStateKey);
  assert.equal(vault.key.extractable,false);
  await assert.rejects(crypto.subtle.exportKey('raw',vault.key));
  assert.equal(other.key.extractable,false);
});

test('wrong recovery secret or vault cannot unlock retained state',async()=>{
  const a=await createPrivateVault(tenantId),b=await createPrivateVault(tenantId);
  await assert.rejects(recoverPrivateVault(b.recoverySecret,a.recoveryEnvelope,expected(a.vault)),denied);
  const runId=randomUUID(),project=await createPrivateProjectKeys(a.vault,runId);
  await assert.rejects(openPrivateProjectKeys(b.vault,runId,project.envelope),denied);
});

test('tenant, vault, project, purpose and revision substitution all fail',async()=>{
  const {vault,recoverySecret,recoveryEnvelope}=await createPrivateVault(tenantId);
  const runId=randomUUID(),{envelope}=await createPrivateProjectKeys(vault,runId);
  await assert.rejects(recoverPrivateVault(recoverySecret,recoveryEnvelope,{...expected(vault),tenantId:'other'}),denied);
  await assert.rejects(recoverPrivateVault(recoverySecret,recoveryEnvelope,{...expected(vault),vaultId:randomUUID()}),denied);
  await assert.rejects(openPrivateProjectKeys(vault,randomUUID(),envelope),denied);
  for(const patch of [{tenantId:'other'},{vaultId:randomUUID()},{runId:randomUUID()},
    {purpose:'vault-recovery'},{revision:2}]){
    const changed=clone(envelope);Object.assign(changed.context,patch);
    await assert.rejects(openPrivateProjectKeys(vault,runId,changed),denied);
  }
  await assert.rejects(openPrivateProjectKeys(vault,runId,recoveryEnvelope),denied);
});

test('tampered ciphertext, IV or appended plaintext fields cannot be accepted',async()=>{
  const {vault,recoverySecret,recoveryEnvelope}=await createPrivateVault(tenantId);
  const runId=randomUUID(),{envelope}=await createPrivateProjectKeys(vault,runId);
  for(const original of [envelope,recoveryEnvelope])for(const field of ['ciphertext','iv']){
    const changed=clone(original),bytes=Buffer.from(changed[field],'base64');bytes[0]^=1;changed[field]=bytes.toString('base64');
    if(original===envelope)await assert.rejects(openPrivateProjectKeys(vault,runId,changed),denied);
    else await assert.rejects(recoverPrivateVault(recoverySecret,changed,expected(vault)),denied);
  }
  await assert.rejects(openPrivateProjectKeys(vault,runId,{...envelope,plaintext:'synthetic-canary'}),denied);
  const changed=clone(envelope);changed.context.extra='synthetic-canary';
  await assert.rejects(openPrivateProjectKeys(vault,runId,changed),denied);
});

test('invalid versions, algorithms, encodings, identities and key lengths fail with fixed errors',async()=>{
  const {vault,recoverySecret,recoveryEnvelope}=await createPrivateVault(tenantId);
  for(const patch of [{version:2},{algorithm:'none'},{iv:'!!!!'},{ciphertext:'A'.repeat(100000)}])
    await assert.rejects(recoverPrivateVault(recoverySecret,{...recoveryEnvelope,...patch},expected(vault)),denied);
  for(const bad of [new Uint8Array(0),new Uint8Array(31),'public-wallet-address',null])
    await assert.rejects(recoverPrivateVault(bad,recoveryEnvelope,expected(vault)),denied);
  await assert.rejects(createPrivateVault(''),denied);
  await assert.rejects(createPrivateProjectKeys(vault,'not-a-run'),denied);
});

test('encryption uses a fresh IV and new project material on every creation',async()=>{
  const {vault}=await createPrivateVault(tenantId),runId=randomUUID();
  const a=await createPrivateProjectKeys(vault,runId),b=await createPrivateProjectKeys(vault,runId);
  assert.notEqual(a.envelope.iv,b.envelope.iv);
  assert.notEqual(a.envelope.ciphertext,b.envelope.ciphertext);
  assert.notDeepEqual(a.secrets,b.secrets);
});

test('loss of every recovery secret is not bypassed by wallet/tenant identity or persisted ciphertext',async()=>{
  const {vault,recoveryEnvelope}=await createPrivateVault(tenantId);
  await assert.rejects(recoverPrivateVault(new Uint8Array(32),recoveryEnvelope,expected(vault)),denied);
  const runId=randomUUID(),{envelope}=await createPrivateProjectKeys(vault,runId);
  await assert.rejects(openPrivateProjectKeys({...expected(vault),key:null},runId,envelope),denied);
});

test('immutable vault envelopes tolerate JSONB key order but reject changed material or identity',async()=>{
 const {vault}=await createPrivateVault(tenantId),{envelope}=await createPrivateProjectKeys(vault,randomUUID());
 const reordered=Object.fromEntries(Object.entries(envelope).reverse());reordered.context=Object.fromEntries(Object.entries(envelope.context).reverse());
 assert.equal(samePrivateVaultEnvelope(envelope,reordered),true);
 assert.equal(samePrivateVaultEnvelope(envelope,{...reordered,iv:'different'}),false);
 assert.equal(samePrivateVaultEnvelope(envelope,{...reordered,context:{...reordered.context,runId:randomUUID()}}),false);
});

test('lost-code replacement preserves every project seed and excludes the old key and old recovery code',async()=>{
 const old=await createPrivateVault(tenantId),runId=randomUUID(),project=await createPrivateProjectKeys(old.vault,runId);
 const replacement=await createPrivateVault(tenantId,old.vault.vaultId);
 const envelope=await rewrapPrivateProjectKeys(old.vault,replacement.vault,runId,project.envelope);
 assert.equal(replacement.vault.vaultId,old.vault.vaultId);
 assert.deepEqual(await openPrivateProjectKeys(replacement.vault,runId,envelope),project.secrets);
 assert.notEqual(envelope.ciphertext,project.envelope.ciphertext);
 await assert.rejects(openPrivateProjectKeys(old.vault,runId,envelope),denied);
 await assert.rejects(recoverPrivateVault(old.recoverySecret,replacement.recoveryEnvelope,expected(old.vault)),denied);
 const restored=await recoverPrivateVault(replacement.recoverySecret,replacement.recoveryEnvelope,expected(old.vault));
 assert.deepEqual(await openPrivateProjectKeys(restored,runId,envelope),project.secrets);
 const unrelated=await createPrivateVault(tenantId);
 await assert.rejects(rewrapPrivateProjectKeys(old.vault,unrelated.vault,runId,project.envelope),denied);
});

test('interrupted replacement reconciles only the staged matching generation without discarding the usable old key',async()=>{
 const old=await createPrivateVault(tenantId),next=await createPrivateVault(tenantId,old.vault.vaultId);
 const remote={vaultId:old.vault.vaultId,revision:1,recoveryEnvelope:old.recoveryEnvelope};
 const pending={...remote,revision:2,recoveryEnvelope:next.recoveryEnvelope};
 const local={...remote,pendingReplacement:pending};
 assert.equal(privateVaultEnrollmentAction(local,remote),'current'); // request not sent/rejected
 assert.equal(privateVaultEnrollmentAction(local,pending),'promote'); // committed, response lost
 assert.equal(privateVaultEnrollmentAction({...remote},pending),'recover'); // other device
 assert.equal(privateVaultEnrollmentAction(local,{...remote,revision:2}),'current'); // passkey-only update
 for(const bad of [null,{...remote,vaultId:randomUUID()},{...remote,revision:0},{...remote,revision:NaN}])
  assert.throws(()=>privateVaultEnrollmentAction(local,bad),denied);
 assert.equal(privateVaultEnrollmentAction(local,{...pending,revision:3}),'recover'); // never promote an unmatched generation
});
