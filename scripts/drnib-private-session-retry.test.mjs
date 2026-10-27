import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createRequire}from'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
const source=await readFile(new URL('../frontend/src/lib/dr-nib-private-api.ts',import.meta.url),'utf8');
const progress=ts.transpileModule(await readFile(new URL('../frontend/src/lib/dr-nib-private-connection.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const progressUrl='data:text/javascript;base64,'+Buffer.from(progress).toString('base64');
// This fixture covers authenticated-account transport; anonymous routing is tested separately.
const guestUrl='data:text/javascript;base64,'+Buffer.from("export const guestTransport=async()=>null;export const guestPlanningResponseError=async()=>{throw Error('Account fixture reached guest error handler')};").toString('base64');
const js=ts.transpileModule(source.replace("'./dr-nib-guest-planning'",JSON.stringify(guestUrl)).replace("'./dr-nib-private-connection'",JSON.stringify(progressUrl)),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const{openGuestSession,executePrivateRun}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('only recipient opening retries transient transport; authentication, invalid evidence and dispatch do not replay',async()=>{
 const original=globalThis.fetch,id='11111111-1111-4111-8111-111111111111',nonce='a'.repeat(64),session={sessionId:id,clientNonce:nonce,recipientId:'synthetic',recipientPublicKey:'synthetic',evidence:{attestation:'aa'}};
 let calls=0;const bodies=[];
 try{
  globalThis.fetch=async(_url,options)=>{if(String(_url).endsWith("/wake"))return Response.json({phase:"ready",enabled:false});calls++;bodies.push(JSON.parse(options.body));return calls===1?Response.json({}, {status:503}):Response.json(session,{status:201});};
  assert.equal((await openGuestSession(id,nonce)).sessionId,id);assert.equal(calls,2);assert.deepEqual(bodies,[{runId:id,clientNonce:nonce},{runId:id,clientNonce:nonce}]);
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({}, {status:401})};await assert.rejects(openGuestSession(id,nonce));assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({}, {status:201})};await assert.rejects(openGuestSession(id,nonce));assert.equal(calls,1);
  calls=0;globalThis.fetch=async()=>{calls++;return Response.json({}, {status:503})};await assert.rejects(executePrivateRun(id,id,{}));assert.equal(calls,1);
  calls=0;globalThis.fetch=async(url)=>{if(String(url).endsWith('/wake'))return Response.json({phase:'ready',enabled:false});calls++;if(calls===1)throw Error('synthetic socket loss');return Response.json(session,{status:201})};assert.equal((await openGuestSession(id,nonce)).sessionId,id);assert.equal(calls,2);
 }finally{globalThis.fetch=original}
});

test('wake waits for readiness without dispatching inference or sending keys',async()=>{
 const original=globalThis.fetch,id='11111111-1111-4111-8111-111111111111';const seen=[];let polls=0;
 try{globalThis.fetch=async(url,options)=>{seen.push([String(url),options.method??'GET',options.body]);
 if(String(url).endsWith('/wake'))return Response.json({phase:options.method==='POST'?'starting':(++polls?'ready':'starting'),enabled:true});
 return Response.json({sessionId:id,clientNonce:'a'.repeat(64),recipientId:'fixture',recipientPublicKey:'fixture',evidence:{attestation:'aa'}});};
 await openGuestSession(id,'a'.repeat(64));assert.equal(seen.length,3);assert.equal(seen[0][2],'{}');assert.equal(seen[1][1],'GET');assert.match(seen[2][0],/sessions$/);
 }finally{globalThis.fetch=original}
});
