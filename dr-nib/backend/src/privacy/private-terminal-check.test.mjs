import test from 'node:test';import assert from 'node:assert/strict';
import {createPrivateTerminalCheck} from './private-terminal-check.js';
import {createPrivateGuestHttpServer} from './private-guest-http.js';
import {createPrivateCapabilitySigner,createGuestCapabilityAuthenticator,createInMemoryJtiConsumer} from './private-capability.js';
import {generateKeyPair} from 'jose';
test('review terminal checks are fixed, bounded, cached and never invoke models or payment tools',async()=>{
 let calls=0;const check=createPrivateTerminalCheck({run:async input=>{calls++;assert.ok(!input.command.includes('API_KEY='));return {exitCode:0,timedOut:false,artifacts:input.persist?{'answer.txt':'28'}:{},stdout:calls===1?'packages-ready\nnode-ready':calls===2?'isolated':'cache-verified'}}});
 const [a,b]=await Promise.all([check(),check()]);assert.equal(a.ready,true);assert.deepEqual(a,b);assert.equal(calls,3);assert.equal((await check()).modelCalls,0);assert.equal(calls,3);
 let failures=0;const unavailable=createPrivateTerminalCheck({run:async()=>{failures++;throw Error('Unavailable')}});assert.deepEqual(await unavailable(),{ready:false});assert.deepEqual(await unavailable(),{ready:false});assert.equal(failures,1);
});
test('terminal review route requires its own single-use capability, empty input and a fixed non-content result',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('EdDSA'),sign=createPrivateCapabilitySigner({privateKey}),runId='11111111-1111-4111-8111-111111111111';
 let calls=0,result={ready:false};const server=createPrivateGuestHttpServer({sessions:{open:async()=>{},prove:async()=>{},execute:async()=>{}},authenticate:createGuestCapabilityAuthenticator({publicKey,consumeJti:createInMemoryJtiConsumer()}),getReport:async()=>{},checkTools:async()=>{calls++;return result}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/v1/private/tools/check`;
 const request=async(scope,body={})=>fetch(url,{method:'POST',headers:{authorization:'Bearer '+await sign({tenantId:'synthetic',runId,scope}),'content-type':'application/json'},body:JSON.stringify(body)});
 try{assert.equal((await request('sessions:open')).status,401);assert.equal(calls,0);assert.equal((await request('tools:check',{command:'curl private'})).status,400);assert.equal(calls,0);assert.deepEqual(await (await request('tools:check')).json(),{ready:false});assert.equal(calls,1);result={ready:true,plaintext:'must not leave'};assert.equal((await request('tools:check')).status,503);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
