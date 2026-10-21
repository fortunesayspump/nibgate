import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguredPhalaWake} from './phala-wake-bootstrap.js';

const policy={expectedAppId:'44'.repeat(20),expectedInstanceId:'55'.repeat(20),expectedComposeHash:'11'.repeat(32),
  expectedOsHash:'22'.repeat(32),expectedKeyProvider:{name:'kms',id:'33'.repeat(32)},
  reviewedReleaseControls:{sshDisabled:true,debugDisabled:true,plaintextLogsDisabled:true,imagesDigestPinned:true,productionOsImage:true}};
function env(){return {DRNIB_PRIVATE_WAKE_ENABLED:'true',PHALA_CLOUD_API_KEY:'phak_synthetic_fixture_only',
  DRNIB_PRIVATE_CVM_ID:'synthetic-cvm-id',DRNIB_PRIVATE_RELEASE_POLICY_JSON:JSON.stringify(policy),
  DRNIB_PRIVATE_VERIFIER_URL:'https://verifier.example/verify',DRNIB_PRIVATE_VERIFIER_SPKI_SHA256:'55'.repeat(32),
  DRNIB_PRIVATE_WAKE_IDLE_MS:'15000',DRNIB_PRIVATE_WAKE_MAX_RUNTIME_MS:'60000'};}
function fakeClient(){
  let status='stopped';const calls=[];
  const client={getCvmState:async()=>({status}),startCvm:async()=>{calls.push('start');status='starting'},
    shutdownCvm:async()=>{calls.push('shutdown');status='stopping'},stopCvm:async()=>{calls.push('stop');status='stopping'},
    watchCvmState:async({target})=>{status=target;return {status}}};
  return {client,calls};
}
const common={guestBaseURL:'https://guest.example/',tenantId:'synthetic_owner',signCapability:async()=> 'synthetic-token'};

test('disabled flag never imports SDK, constructs credentials or contacts host',async()=>{
  let calls=0;
  assert.equal(await createConfiguredPhalaWake({...common,env:{},clientFactory:async()=>{calls++;throw Error('unexpected')}}),null);
  assert.equal(calls,0);
});
test('missing or unsafe configuration fails before SDK construction, including debug logging',async()=>{
  for(const change of [
    {PHALA_CLOUD_API_KEY:''},{DRNIB_PRIVATE_CVM_ID:''},{DRNIB_PRIVATE_WAKE_IDLE_MS:'0'},
    {DRNIB_PRIVATE_WAKE_MAX_RUNTIME_MS:'99999999'},{DRNIB_PRIVATE_WAKE_MAX_ACTIVE:'0'},{DRNIB_PRIVATE_WAKE_MAX_PENDING:'257'},{DRNIB_PRIVATE_VERIFIER_URL:'http://verifier.example/verify'},
    {DRNIB_PRIVATE_VERIFIER_SPKI_SHA256:'x'},
    {DRNIB_PRIVATE_RELEASE_POLICY_JSON:JSON.stringify({...policy,reviewedReleaseControls:{...policy.reviewedReleaseControls,sshDisabled:false}})},
    {DEBUG:'phala::api-client'},{DEBUG:'*'},{DEBUG:'other-namespace'},
  ]){
    let calls=0;
    await assert.rejects(createConfiguredPhalaWake({...common,env:{...env(),...change},clientFactory:async()=>{calls++;return fakeClient().client}}));
    assert.equal(calls,0);
  }
});
test('configured bootstrap uses explicit official SDK options and starts only on owner readiness',async()=>{
  const f=fakeClient();let supplied;let state;
  const lifecycleStore={mutate:async(initial,fn)=>{state??=structuredClone(initial);return fn(state,Date.now(),false)}};
  const controller=await createConfiguredPhalaWake({...common,env:env(),
    lifecycleStore,clientFactory:async options=>{supplied=options;return f.client},
    verifierFactory:()=>({verifyEvidence:async()=>({is_valid:false})}),
    fetchImpl:async(url)=>{
      assert.equal(new URL(url).pathname,'/health');
      return {status:200,json:async()=>({ok:true,privateReady:true})};
    }});
  assert.deepEqual(supplied,{apiKey:env().PHALA_CLOUD_API_KEY,baseURL:'https://cloud-api.phala.com/api/v1',
    version:'2026-06-23',timeout:60000});
  assert.deepEqual(f.calls,[]);
  assert.equal((await controller.status()).phase,'stopped');
  assert.deepEqual(f.calls,[]);
  await controller.close();
  assert.deepEqual(f.calls,[]);
});

test('reviewed two-hour ceiling remains bounded and does not start compute',async()=>{
 for(const max of ['3600000','7200000']){
  const f=fakeClient();let state;const controller=await createConfiguredPhalaWake({...common,env:{...env(),DRNIB_PRIVATE_WAKE_MAX_RUNTIME_MS:max},lifecycleStore:{mutate:async(initial,fn)=>{state??=structuredClone(initial);return fn(state,Date.now(),false)}},clientFactory:async()=>f.client,verifierFactory:()=>({verifyEvidence:async()=>({is_valid:false})})});
  assert.equal(state.policy.maxRuntimeMs,Number(max));assert.deepEqual(f.calls,[]);await controller.close();
 }
 let calls=0;await assert.rejects(createConfiguredPhalaWake({...common,env:{...env(),DRNIB_PRIVATE_WAKE_MAX_RUNTIME_MS:'7200001'},clientFactory:async()=>{calls++;return fakeClient().client}}));assert.equal(calls,0);
});
