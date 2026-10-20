import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const ts=createRequire(new URL('../frontend/package.json',import.meta.url))('typescript');
const js=ts.transpileModule(await readFile(new URL('../frontend/src/lib/dr-nib-private-vault-prompt.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const load=async name=>import('data:text/javascript;base64,'+Buffer.from(js+'\n// '+name).toString('base64'));
test('separate route chunks and module replacement reach the same mounted recovery dialog',async()=>{
 globalThis.window=new EventTarget();
 try{
  const layout=await load('layout'),page=await load('page-after-hot-reload');
  const stop=layout.setPrivateVaultPrompt(request=>{assert.equal(request.mode,'replace');request.resolve('synthetic-code');});
  assert.equal(await page.askPrivateVaultPrompt({mode:'replace',tenantId:'fixture',recoveryCode:'synthetic-code'}),'synthetic-code');
  stop();await assert.rejects(page.askPrivateVaultPrompt({mode:'recover',tenantId:'fixture'}),/unlock is not ready/);
  const cancel=page.setPrivateVaultPrompt(request=>request.reject());
  await assert.rejects(layout.askPrivateVaultPrompt({mode:'recover',tenantId:'fixture'}),/remain locked/);cancel();
 }finally{delete globalThis.window;}
});
