import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {openClientObject,sealClientObject} from '../dr-nib/backend/src/privacy/client-object-crypto.js';
import {ciphertextDigest} from '../dr-nib/backend/src/privacy/ciphertext-digest.js';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
const source=readFileSync(new URL('../frontend/src/lib/dr-nib-private-objects.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const browser=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const context=()=>({tenantId:'local-owner',vaultId:randomUUID(),runId:randomUUID(),objectId:randomUUID(),revision:1,purpose:'source'});
test('browser and guest interoperate for every protected object purpose',async()=>{
 for(const purpose of ['source','manifest','intent','discussion','export','report','event','action-progress','checkpoint']){
  const key=randomBytes(32),c={...context(),purpose},plain=Buffer.from('SYNTHETIC_PRIVATE_OBJECT_CANARY');
  const envelope=await browser.sealPrivateObject(key,c,plain);assert.deepEqual(openClientObject(key,c,envelope),plain);
  const reverse=sealClientObject(key,c,plain);assert.deepEqual(Buffer.from(await browser.openPrivateObject(key,c,reverse)),plain);
  assert.ok(!JSON.stringify(envelope).includes(plain.toString()));
 }
});
test('tampering, wrong keys and context substitution fail in both directions',async()=>{
 const key=randomBytes(32),c=context(),envelope=sealClientObject(key,c,Buffer.from('synthetic'));
 for(const patch of [{tenantId:'other'},{vaultId:randomUUID()},{runId:randomUUID()},{objectId:randomUUID()},{purpose:'report'},{revision:2}]){
  assert.throws(()=>openClientObject(key,{...c,...patch},envelope));await assert.rejects(browser.openPrivateObject(key,{...c,...patch},envelope));
 }
 const corrupt=structuredClone(envelope),bytes=Buffer.from(corrupt.ciphertext,'base64');bytes[0]^=1;corrupt.ciphertext=bytes.toString('base64');
 assert.throws(()=>openClientObject(key,c,corrupt));await assert.rejects(browser.openPrivateObject(key,c,corrupt));
 await assert.rejects(browser.openPrivateObject(randomBytes(32),c,envelope));
});
test('ciphertext digest survives JSONB key reordering and covers all values',()=>{
 const c=context(),envelope=sealClientObject(randomBytes(32),c,Buffer.from('synthetic'));
 const reordered=Object.fromEntries(Object.entries(envelope).reverse());reordered.context=Object.fromEntries(Object.entries(c).reverse());
 assert.equal(ciphertextDigest(reordered),ciphertextDigest(envelope));assert.notEqual(ciphertextDigest({...envelope,revision:2}),ciphertextDigest(envelope));
});
