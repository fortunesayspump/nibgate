// Offline bundle preparation/integrity regression; no account configuration.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,appendFile,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
test('canary CLI prepares an owner-only review bundle, refuses overwrite and detects edits',async()=>{
 const scratch=await mkdtemp(join(root,'ops/dr-nib-canary/.cli-test-')),out=join(scratch,'bundle');
 const call=(...args)=>spawnSync(process.execPath,['scripts/drnib-private-canary.mjs',...args],{cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:60000});
 try{
  const prepare=call('prepare','ops/dr-nib-canary/plan.example.json',out);assert.equal(prepare.status,0,prepare.stderr);assert.equal(JSON.parse(prepare.stdout).configurationComplete,false);
  assert.equal((await stat(out)).mode&0o077,0);assert.equal((await stat(join(out,'reviewed-plan.json'))).mode&0o077,0);
  const verified=call('verify',out);assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).integrityVerified,true);
  const selection=JSON.parse(await readFile(join(out,'verifier/selection.json')));
  assert.equal(selection.selected.hostingAccepted,false);assert.equal(selection.hostedQuoteApiProbe.usableForCurrentBrowserKeyRelease,false);
  assert.ok((await readFile(join(out,'VERIFIER.md'),'utf8')).includes('Official Phala verifier'));
  assert.ok((await readFile(join(out,'verifier/compose.local.yaml'),'utf8')).includes(selection.selected.image));
  const inputs=JSON.parse(await readFile(join(out,'deployment-inputs.json')));assert.ok(inputs.environmentInputs['env/funding.env.example'].some(v=>v.key==='HUB_API_URL'&&!v.requiresProvisioning));
  assert.notEqual(call('prepare','ops/dr-nib-canary/plan.example.json',out).status,0);
  await appendFile(join(out,'env/frontend.env.example'),'UNREVIEWED=1\n');assert.notEqual(call('verify',out).status,0);
 }finally{assert.ok(resolve(scratch).startsWith(join(root,'ops/dr-nib-canary/.cli-test-')));await rm(scratch,{recursive:true,force:true});}
});
