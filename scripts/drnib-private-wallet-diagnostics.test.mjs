import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-wallet-diagnostics.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{readEscrowWalletDiagnostics}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('unsupported optional wallet methods cannot falsely report a dead RPC',async()=>{
 const out=await readEscrowWalletDiagnostics(async({method})=>{if(method==='eth_blockNumber')return '0x123';if(method==='eth_getBalance')return '0x1';throw Object.assign(Error('unsupported'),{code:-32601});},'synthetic','0x');
 assert.equal(out.blockNumber,'0x123');assert.equal(out.gas,'0x1');assert.equal(out.syncing,null);assert.equal(out.usdc,null);
});
test('a failed or invalid mandatory read blocks payment diagnostics',async()=>{
 await assert.rejects(readEscrowWalletDiagnostics(async()=>{throw Error('unavailable')},'synthetic','0x'));
 await assert.rejects(readEscrowWalletDiagnostics(async()=>null,'synthetic','0x'));
 await assert.rejects(readEscrowWalletDiagnostics(async()=>new Promise(()=>{}),'synthetic','0x',10));
});
