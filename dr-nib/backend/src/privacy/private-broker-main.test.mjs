import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('broker-only entrypoint cannot import broad server or operational subsystems',async()=>{
  const source=await readFile(new URL('./private-broker-main.js',import.meta.url),'utf8');
  const imports=[...source.matchAll(/^import\s+.+?from\s+['"]([^'"]+)['"];?$/gm)].map(match=>match[1]);
  assert.deepEqual(imports.sort(),[
    '../db.js','../env.js','./private-broker-auth.js','./private-broker-config.js','./private-broker.js','./private-runs.js',
    'cookie-parser','cors','express','node:path','node:url',
  ].sort());
  for(const blocked of ['../server.js','../queue.js','../worker.js','../routes/exports.js','../routes/x402.js'])
    assert.ok(!imports.includes(blocked));
  assert.match(source,/DRNIB_PRIVATE_BROKER_ONLY/);
});

test('broker-only entrypoint imports without any hub database credential',()=>{
  const entry=new URL('./private-broker-main.js',import.meta.url).href;
  const env={...process.env,DRNIB_PRIVATE_BROKER_ONLY:'true',
    DRNIB_DATABASE_URL:'postgresql://nobody:unused@127.0.0.1:1/unused?schema=drnib',
    PRIVATE_BROKER_AUTH_URL:'https://testnet-api.nibgate.xyz/api/auth/me',NIBGATE_SESSION_COOKIE:'auth_session_testnet'};
  delete env.HUB_DATABASE_URL;delete env.DATABASE_URL;
  const child=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(entry)})`],
    {env,encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
});

test('broker-only local dependency closure excludes real research, queue, storage and payment code',async()=>{
  const entry=fileURLToPath(new URL('./private-broker-main.js',import.meta.url));
  const seen=new Set();
  async function walk(file){
    if(seen.has(file))return;
    seen.add(file);
    const source=await readFile(file,'utf8');
    for(const match of source.matchAll(/^import(?:\s+.+?from\s+|\s*)['"]([^'"]+)['"];?$/gm)){
      if(!match[1].startsWith('.'))continue;
      const target=path.resolve(path.dirname(file),match[1]);
      await walk(fileURLToPath(pathToFileURL(target)));
    }
  }
  await walk(entry);
  const relative=[...seen].map(file=>path.relative(path.resolve(path.dirname(entry),'..'),file));
  for(const blocked of [
    'server.js','queue.js','worker.js','routes/runs.js','routes/budgets.js','routes/exports.js','routes/x402.js',
    'retrieval/','sources/','escrow/','spend/','tools/',
  ])assert.ok(!relative.some(file=>file===blocked||file.startsWith(blocked)),`unexpected broker dependency: ${blocked}`);
});
