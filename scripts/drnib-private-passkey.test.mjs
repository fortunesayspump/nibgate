import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const source=readFileSync(new URL('../frontend/src/lib/dr-nib-private-passkey.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}});
const {createPrivatePasskey,readPrivatePasskey,privatePasskeySupported}=
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('passkey enrollment requires a working PRF assertion and uses the same credential for recovery',async()=>{
 const original=new Map(['window','navigator','location','PublicKeyCredential','crypto'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const define=(name,value)=>Object.defineProperty(globalThis,name,{configurable:true,value});
 const id=webcrypto.getRandomValues(new Uint8Array(32));
 const output=webcrypto.getRandomValues(new Uint8Array(32));
 let assertions=0;
 try{
  define('window',{isSecureContext:true});define('location',{hostname:'testnet.nibgate.xyz'});
  define('PublicKeyCredential',class{});define('crypto',webcrypto);
  define('navigator',{credentials:{
   create:async({publicKey})=>{
    assert.equal(publicKey.rp.id,'testnet.nibgate.xyz');
    assert.equal(publicKey.authenticatorSelection.userVerification,'required');
    return {rawId:id.buffer,getClientExtensionResults:()=>({prf:{enabled:true}})};
   },
   get:async({publicKey})=>{
    assertions++;
    assert.deepEqual(new Uint8Array(publicKey.allowCredentials[0].id),id);
    assert.equal(publicKey.userVerification,'required');
    assert.equal(publicKey.extensions.prf.eval.first.length>32,true);
    return {rawId:id.buffer,getClientExtensionResults:()=>({prf:{results:{first:output.buffer}}})};
   },
  }});
  assert.equal(privatePasskeySupported(),true);
  const created=await createPrivatePasskey('owner','11111111-1111-4111-8111-111111111111');
  assert.equal(assertions,1);
  assert.deepEqual(created.output,output);
  const stored={credentialId:Buffer.from(created.credentialId).toString('base64'),salt:Buffer.from(created.salt).toString('base64'),envelope:{iv:'',ciphertext:''}};
  assert.deepEqual(await readPrivatePasskey(stored,'owner','11111111-1111-4111-8111-111111111111'),output);
  assert.equal(assertions,2);
  await assert.rejects(readPrivatePasskey({...stored,credentialId:'bad'},'owner','11111111-1111-4111-8111-111111111111'));
  globalThis.navigator.credentials.get=async()=>({rawId:id.buffer,getClientExtensionResults:()=>({prf:{}})});
  await assert.rejects(readPrivatePasskey(stored,'owner','11111111-1111-4111-8111-111111111111'));
 }finally{for(const [name,descriptor] of original)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
});
