import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getPhalaSessionEvidence,attestV1} from './phala-quote.js';
const original=process.env.DSTACK_SIMULATOR_ENDPOINT;
const fixtureKey=()=>Buffer.concat([Buffer.from([4]),randomBytes(64)]);
async function unixSocketAvailable(){
  const dir=await mkdtemp(join(tmpdir(),'drnib-socket-probe-')),path=join(dir,'probe.sock');
  const server=createServer();
  const available=await new Promise(resolve=>{server.once('error',()=>resolve(false));server.listen(path,()=>resolve(true))});
  if(available)await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});return available;
}
const unixAvailable=await unixSocketAvailable();
test('Phala v1 adapter binds nonce and ephemeral key into report data',async()=>{
  delete process.env.DSTACK_SIMULATOR_ENDPOINT;
  let seen;
  const result=await getPhalaSessionEvidence({clientNonce:randomBytes(32),sessionId:randomUUID(),sessionPublicKey:fixtureKey(),client:{attestV1:async data=>{seen=data;return {attestation:'aabb'}}}});
  assert.equal(seen.length,32);assert.equal(result.reportData,seen.toString('hex'));
  assert.equal(result.attestation,'aabb');
});
test('legacy SDK attest or quote is never used as v1 evidence',async()=>{
  await assert.rejects(getPhalaSessionEvidence({clientNonce:randomBytes(32),sessionId:randomUUID(),sessionPublicKey:fixtureKey(),client:{attest:async()=>({attestation:'aabb'}),getQuote:async()=>({quote:'aabb'})}}),/v1 attestation unavailable/);
});
test('Phala adapter rejects simulator even with fixture v1 client',async()=>{
  process.env.DSTACK_SIMULATOR_ENDPOINT='http://localhost:8090';
  await assert.rejects(getPhalaSessionEvidence({clientNonce:randomBytes(32),sessionId:randomUUID(),sessionPublicKey:fixtureKey(),client:{attestV1:async()=>{throw new Error('should not call')}}}),/simulator/);
  if(original===undefined)delete process.env.DSTACK_SIMULATOR_ENDPOINT;else process.env.DSTACK_SIMULATOR_ENDPOINT=original;
});
test('Phala adapter rejects malformed v1 response',async()=>{
  delete process.env.DSTACK_SIMULATOR_ENDPOINT;
  await assert.rejects(getPhalaSessionEvidence({clientNonce:randomBytes(32),sessionId:randomUUID(),sessionPublicKey:fixtureKey(),client:{attestV1:async()=>({attestation:'not hex'})}}),/invalid Phala v1/);
});
test('production v1 transport sends correct Unix-socket path and report-data JSON',{skip:!unixAvailable},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'drnib-dstack-')),socketPath=join(dir,'dstack.sock'),binding=randomBytes(32);
  const seen=[];
  const server=createServer((req,res)=>{
    const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{
      seen.push({method:req.method,path:req.url,body:JSON.parse(Buffer.concat(chunks).toString())});
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({attestation:'aabb',boottime_gpu_evidence:[]}));
    });
  });
  await new Promise(resolve=>server.listen(socketPath,resolve));
  try{
    assert.equal((await attestV1(binding,{socketPath})).attestation,'aabb');
    assert.deepEqual(seen,[{method:'POST',path:'/v1/Attest',body:{report_data:binding.toString('hex'),include_boottime_gpu_evidence:false}}]);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
test('production v1 transport rejects server errors and oversized evidence',{skip:!unixAvailable},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'drnib-dstack-')),socketPath=join(dir,'dstack.sock');
  let mode='error';
  const server=createServer((_req,res)=>{if(mode==='error'){res.writeHead(500);res.end('bad')}else{res.writeHead(200);res.end(JSON.stringify({attestation:'aa'.repeat(1100000)}))}});
  await new Promise(resolve=>server.listen(socketPath,resolve));
  try{
    await assert.rejects(attestV1(randomBytes(32),{socketPath}),/unavailable/);
    mode='large';await assert.rejects(attestV1(randomBytes(32),{socketPath}),/too large/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
});
