import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAciChannelFactory,createAciSessionDiscoverer} from './phala-aci-adapter.js';
import {createPhalaAiPort} from './phala-ai-port.js';
import {PRIVATE_NOT_DISPATCHED,PRIVATE_FAILURE_EVIDENCE} from './phala-ai-port.js';

const compose='1'.repeat(64),session='a'.repeat(64),discovered='c'.repeat(64);
const MODEL='fixture/model';
test('429 retains its uncertain hold evidence and blocks new connections until Retry-After expires',async()=>{
 let now=1700000000000,sends=0,connections=0,closed=0;
 const connectVerified=createAciChannelFactory({baseURL:'https://inference.example',apiKey:'synthetic_test_only',expectedComposeHash:compose,acceptedSessionId:session,now:()=>now,connect:async()=>{
  connections++;return {identity:{composeHash:compose,transcript:{verdict:{verified:true},lines:[{id:'policy-os',status:'pass'}]}},
   fetch:async()=>{sends++;return {ok:false,status:429,headers:new Headers({'retry-after':'120','x-receipt-id':'synthetic-rate-limit','x-ratelimit-limit-tokens':'8192','x-ratelimit-remaining-tokens':'0','x-private-debug':'synthetic-secret'}),text:()=>assert.fail('Do not read error content')}},
   verifyReceipt:()=>assert.fail('429 is not a no-forwarding refusal'),close:async()=>{closed++}};
 }});
 const port=createPhalaAiPort({approvedModels:[MODEL],connectVerified});
 const request={model:MODEL,messages:[{role:'user',content:'synthetic'}]};
 await assert.rejects(port.infer(request),e=>{
  const f=e[PRIVATE_FAILURE_EVIDENCE];
  assert.equal(f.retryAfterMs,120000);assert.equal(f.retryAfterSource,'provider-header');
  assert.equal(f.tokenLimit,8192);assert.equal(f.tokensRemaining,0);
  assert.ok(f.requestBytes>0);assert.ok(f.requestedMaxTokens>0);
  assert.equal(JSON.stringify(f).includes('synthetic-secret'),false);
  return e[PRIVATE_NOT_DISPATCHED]!==true;
 });
 await assert.rejects(port.infer(request),e=>e[PRIVATE_NOT_DISPATCHED]===true);
 assert.equal(sends,1);assert.equal(connections,1);assert.equal(closed,1);
 now+=120000;
 await assert.rejects(port.infer(request));assert.equal(sends,2);assert.equal(connections,2);
});
function fixture({tamperBody=false,tamperSession=false,unverified=false,tamperResponse=false,discovery=false,optionalUpstream=false,sessionSet=false}={}){
  const calls=[];
  let body,responseBody;
  const servingSession=discovery||sessionSet?discovered:session;
  const connect=async options=>{
    calls.push(options);
    return {
      identity:{composeHash:compose,transcript:{verdict:{verified:!unverified},lines:[{id:'policy-os',status:'pass'}]}},
      fetch:async(_url,init)=>{body=init.body;responseBody=JSON.stringify({choices:[{message:{content:'Synthetic result'}}]});return new Response(responseBody,{status:200,headers:{'x-receipt-id':'fixture-receipt'}})},
      verifyReceipt:async()=>({receiptId:'fixture-receipt',transcript:{verdict:{verified:true}},receipt:{model:MODEL,event_log:[
        {type:'request.received',body_hash:`sha256:${tamperBody?'0'.repeat(64):createHash('sha256').update(body).digest('hex')}`},
        {type:'upstream.verified',result:'verified',required:!optionalUpstream,session_id:tamperSession?'b'.repeat(64):servingSession},
        {type:'response.returned',body_hash:`sha256:${tamperResponse?'0'.repeat(64):createHash('sha256').update(responseBody).digest('hex')}`},
      ]}}),close:async()=>{},
    };
  };
  const selectSession=sessionSet?async()=>[session,discovered]:discovery?async model=>{assert.equal(model,MODEL);return discovered}:undefined;
  const port=createPhalaAiPort({approvedModels:[MODEL],connectVerified:createAciChannelFactory({baseURL:'https://inference.example/v1',apiKey:'synthetic_test_only',expectedComposeHash:compose,approvedModels:[MODEL],selectSession,...(discovery||sessionSet?{}:{acceptedSessionId:session}),connect})});
  return {port,calls,getBody:()=>body};
}
test('ACI adapter sends private prompt only through SDK-pinned channel and signed receipt contract',async()=>{
  const f=fixture();
  const out=await f.port.infer({model:MODEL,messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]});
  assert.equal(out.choices[0].message.content,'Synthetic result');
  assert.equal(f.calls[0].policy.requireProductionOs,true);
  assert.equal(f.calls[0].timeoutMs,30000);
  assert.deepEqual(f.calls[0].policy.acceptedComposeHashes,[compose]);
  assert.deepEqual(f.calls[0].serving.acceptedSessionIds,[session]);
  assert.equal(JSON.parse(f.getBody()).provider.aci_session_ids[0],session);
});
test('completion deadline aborts the pinned request, closes it and never falls back or repeats',async()=>{
  let sends=0,closed=0;
  const connectVerified=createAciChannelFactory({baseURL:'https://inference.example',apiKey:'synthetic_test_only',expectedComposeHash:compose,approvedModels:[MODEL],acceptedSessionId:session,requestTimeoutMs:100,connect:async()=>({
    identity:{composeHash:compose,transcript:{verdict:{verified:true},lines:[{id:'policy-os',status:'pass'}]}},
    fetch:async(_url,init)=>{sends++;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('SYNTHETIC_PROVIDER_BODY')),{once:true}))},
    verifyReceipt:async()=>{throw Error('No completion receipt expected')},close:async()=>{closed++},
  })});
  const port=createPhalaAiPort({approvedModels:[MODEL],connectVerified});
  const keepAlive=setTimeout(()=>{},500);
  try{await assert.rejects(port.infer({model:MODEL,messages:[{role:'user',content:'synthetic'}]}),error=>error.code==='PHALA_PRIVATE_AI_UNAVAILABLE'&&error.failureStage==='completion'&&!error.message.includes('SYNTHETIC'));}
  finally{clearTimeout(keepAlive)}
  assert.equal(sends,1);assert.equal(closed,1);
});
test('ACI adapter discovers a live session at request time when the pin is unset',async()=>{
  const f=fixture({discovery:true});
  const out=await f.port.infer({model:MODEL,messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]});
  assert.equal(out.choices[0].message.content,'Synthetic result');
  assert.equal(f.calls[0].serving.acceptedSessionIds,undefined);
  assert.equal(JSON.parse(f.getBody()).provider.aci_session_ids[0],discovered);
});
test('a reviewed session set permits a healthy member while rejecting an unlisted serving receipt',async()=>{
 const f=fixture({sessionSet:true});await f.port.infer({model:MODEL,messages:[{role:'user',content:'synthetic'}]});
 assert.deepEqual(JSON.parse(f.getBody()).provider.aci_session_ids,[session,discovered]);
 const bad=fixture({sessionSet:true,tamperSession:true});await assert.rejects(bad.port.infer({model:MODEL,messages:[{role:'user',content:'synthetic'}]}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
});
test('session-set discovery excludes other models, deduplicates and validates session identifiers',async()=>{
 const discover=createAciSessionDiscoverer({baseURL:'https://inference.example',apiKey:'synthetic_test_only',fetchImpl:async url=>new Response(JSON.stringify(url.endsWith('/v1/models')?{data:[{id:MODEL,is_tee:true}]}:{sessions:[
  {session_id:session,expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:MODEL}}},{session_id:discovered,expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:MODEL}}},{session_id:session,expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:MODEL}}},{session_id:'b'.repeat(64),expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:'other/model'}}},{session_id:'invalid',expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:MODEL}}},
 ]}),{status:200})});
 assert.deepEqual(await discover(MODEL,{allSessions:true}),[session,discovered]);
});
test('ACI session discoverer picks the live TEE session for the approved model',async()=>{
  const urls=[];
  const fetchImpl=async url=>{
    urls.push(url);
    if(url.endsWith('/v1/models'))return new Response(JSON.stringify({data:[{id:MODEL,is_tee:true},{id:'other/model',is_tee:false}]}),{status:200});
    return new Response(JSON.stringify({sessions:[
      {session_id:session,expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:'other/model'}}},
      {session_id:discovered,expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:MODEL}}},
    ]}),{status:200});
  };
  const discover=createAciSessionDiscoverer({baseURL:'https://inference.example/v1',apiKey:'synthetic_test_only',fetchImpl});
  assert.equal(await discover(MODEL),discovered);
  assert.equal(urls.length,2);
  await assert.rejects(discover('missing/model'),{message:'PRIVATE_ACI_SESSION_UNAVAILABLE'});
});
test('model catalog and serving-session discovery use the same verified transport as completion',async()=>{
 const paths=[];
 const selectSession=createAciSessionDiscoverer({baseURL:'https://inference.example',apiKey:'synthetic_test_only',fetchImpl:()=>assert.fail('Independent HTTP discovery is forbidden in the channel')});
 const connectVerified=createAciChannelFactory({baseURL:'https://inference.example',apiKey:'synthetic_test_only',expectedComposeHash:compose,approvedModels:[MODEL],selectSession,connect:async()=>({
  identity:{composeHash:compose,transcript:{verdict:{verified:true},lines:[{id:'policy-os',status:'pass'}]}},
  fetch:async(url)=>{const path=new URL(url).pathname;paths.push(path);return new Response(JSON.stringify(path==='/v1/models'?{data:[{id:MODEL,is_tee:true}]}:{sessions:[{session_id:discovered,expires_at:Math.floor(Date.now()/1000)+3600,claims:{extra:{canonical_model_id:MODEL}}}]}),{status:200})},
  verifyReceipt:async()=>{},close:async()=>{},
 })});
 const channel=await connectVerified();try{assert.equal(await channel.sessionFor(MODEL),discovered);assert.deepEqual(paths.sort(),['/v1/aci/sessions','/v1/models']);}finally{await channel.close()}
});
test('ACI adapter rejects unsigned identity, mismatched request, wrong serving session and unbound response',async()=>{
  for(const opts of [{unverified:true},{tamperBody:true},{tamperSession:true},{tamperResponse:true},{optionalUpstream:true}]){
    const f=fixture(opts);
    await assert.rejects(f.port.infer({model:MODEL,messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
    if(opts.unverified)assert.equal(f.getBody(),undefined);
  }
});
test('completion HTTP failures expose fixed categories without consuming provider error bodies',async()=>{
 for(const [status,reason] of [[400,'PHALA_PRIVATE_AI_REQUEST_REJECTED'],[412,'PHALA_PRIVATE_AI_SESSION_EXPIRED'],[401,'PHALA_PRIVATE_AI_CREDENTIAL_REJECTED'],[429,'PHALA_PRIVATE_AI_RATE_LIMITED'],[503,'PHALA_PRIVATE_AI_UPSTREAM_UNAVAILABLE'],[418,null]]){
  const port=createPhalaAiPort({approvedModels:[MODEL],connectVerified:createAciChannelFactory({baseURL:'https://inference.example',apiKey:'synthetic_test_only',expectedComposeHash:compose,acceptedSessionId:session,connect:async()=>({
   identity:{composeHash:compose,transcript:{verdict:{verified:true},lines:[{id:'policy-os',status:'pass'}]}},
   fetch:async()=>({ok:false,status,text:async()=>assert.fail('Provider error bodies must not be consumed')}),verifyReceipt:async()=>assert.fail('No successful completion'),close:async()=>{},
  })})});
  await assert.rejects(port.infer({model:MODEL,messages:[{role:'user',content:'SYNTHETIC_PRIVATE_CANARY'}]}),e=>e.code==='PHALA_PRIVATE_AI_UNAVAILABLE'&&e.failureStage==='completion'&&(e.privateCompletionReason??null)===reason&&!e.message.includes('CANARY'));
 }
});

test('discovery rejects expired, nearly expired and missing-expiry sessions before a prompt is sent',async()=>{
 const now=1700000000000;
 const sessions=[{session_id:session,expires_at:1700000000},{session_id:'b'.repeat(64),expires_at:1700000003},{session_id:discovered,expires_at:1700003600}].map(s=>({...s,claims:{extra:{canonical_model_id:MODEL}}}));
 const discover=createAciSessionDiscoverer({baseURL:'https://inference.example',apiKey:'synthetic_test_only',now:()=>now,fetchImpl:async(url,options)=>{assert.equal(options.cache,'no-store');return new Response(JSON.stringify(url.endsWith('/models')?{data:[{id:MODEL,is_tee:true}]}:{sessions}))}});
 assert.deepEqual(await discover(MODEL,{allSessions:true}),[discovered]);
});
