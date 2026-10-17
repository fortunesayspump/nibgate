import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAciChannelFactory} from './phala-aci-adapter.js';
import {createPhalaAiPort} from './phala-ai-port.js';

const compose='1'.repeat(64),session='a'.repeat(64);
function fixture({tamperBody=false,tamperSession=false,unverified=false,tamperResponse=false}={}){
  const calls=[];
  let body,responseBody;
  const connect=async options=>{
    calls.push(options);
    return {
      identity:{composeHash:compose,transcript:{verdict:{verified:!unverified},lines:[{id:'policy-os',status:'pass'}]}},
      fetch:async(_url,init)=>{body=init.body;responseBody=JSON.stringify({choices:[{message:{content:'Synthetic result'}}]});return new Response(responseBody,{status:200,headers:{'x-receipt-id':'fixture-receipt'}})},
      verifyReceipt:async()=>({receiptId:'fixture-receipt',transcript:{verdict:{verified:true}},receipt:{model:'fixture/model',event_log:[
        {type:'request.received',body_hash:`sha256:${tamperBody?'0'.repeat(64):createHash('sha256').update(body).digest('hex')}`},
        {type:'upstream.verified',result:'verified',session_id:tamperSession?'b'.repeat(64):session},
        {type:'response.returned',body_hash:`sha256:${tamperResponse?'0'.repeat(64):createHash('sha256').update(responseBody).digest('hex')}`},
      ]}}),close:async()=>{},
    };
  };
  const port=createPhalaAiPort({approvedModels:['fixture/model'],acceptedSessionIds:[session],connectVerified:createAciChannelFactory({baseURL:'https://inference.example/v1',apiKey:'synthetic_test_only',expectedComposeHash:compose,acceptedSessionId:session,connect})});
  return {port,calls,getBody:()=>body};
}
test('ACI adapter sends private prompt only through SDK-pinned channel and signed receipt contract',async()=>{
  const f=fixture();
  const out=await f.port.infer({model:'fixture/model',messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]});
  assert.equal(out.choices[0].message.content,'Synthetic result');
  assert.equal(f.calls[0].policy.requireProductionOs,true);
  assert.deepEqual(f.calls[0].policy.acceptedComposeHashes,[compose]);
  assert.deepEqual(f.calls[0].serving.acceptedSessionIds,[session]);
  assert.equal(JSON.parse(f.getBody()).provider.aci_session_ids[0],session);
});
test('ACI adapter rejects unsigned identity, mismatched request, wrong serving session and unbound response',async()=>{
  for(const opts of [{unverified:true},{tamperBody:true},{tamperSession:true},{tamperResponse:true}]){
    const f=fixture(opts);
    await assert.rejects(f.port.infer({model:'fixture/model',messages:[{role:'user',content:'HARMLESS_SYNTHETIC_PRIVATE_CANARY'}]}),{code:'PHALA_PRIVATE_AI_UNAVAILABLE'});
    if(opts.unverified)assert.equal(f.getBody(),undefined);
  }
});
