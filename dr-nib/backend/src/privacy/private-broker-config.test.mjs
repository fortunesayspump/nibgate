import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredPrivateBroker} from './private-broker-config.js';

test('private broker is unavailable by default or with incomplete credentials, preserving conventional server',async()=>{
  for(const env of [{},{DRNIB_PRIVATE_ENABLED:'true'},{DRNIB_PRIVATE_ENABLED:'true',DRNIB_PRIVATE_GUEST_BASE_URL:'http://unsafe',PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM:'invalid'},
    {DRNIB_PRIVATE_ENABLED:'true',DRNIB_PRIVATE_GUEST_BASE_URL:'https://guest.example',PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM:'invalid'}]){
    const config=await configuredPrivateBroker(env);
    assert.equal(await config.ready(),false);assert.equal(config.signCapability,undefined);
  }
});

test('guest readiness does not advertise an old worker, and reviewed parked release uses configured wake without starting it',async()=>{
  // Ephemeral test-only capability key; never provisioned to a service.
  const {generateKeyPair,exportPKCS8}=await import('jose');
  const {privateKey}=await generateKeyPair('EdDSA',{extractable:true});
  const env={DRNIB_PRIVATE_ENABLED:'true',DRNIB_PRIVATE_GUEST_BASE_URL:'https://worker.test.invalid',PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM:await exportPKCS8(privateKey),DRNIB_PRIVATE_TEST_TENANT_ID:'test-owner',DRNIB_PRIVATE_ACCESS_MODE:'authenticated',DRNIB_PRIVATE_WORKFLOW_ENABLED:'true',DRNIB_PRIVATE_RECORDS_ENABLED:'true',DRNIB_GUEST_PLANNING_ENABLED:'true',DRNIB_GUEST_WORKER_REVIEWED:'true'};
  const before=globalThis.fetch;let woke=0;
  try{
    globalThis.fetch=async()=>Response.json({ok:true,privateReady:true,workflowReady:true});
    const old=await configuredPrivateBroker(env);assert.equal(await old.guestPlanningReady(),false);
    globalThis.fetch=async()=>Response.json({ok:true,privateReady:true,workflowReady:true,guestPlanningReady:true});
    assert.equal(await old.guestPlanningReady(),true);
    const unreviewed=await configuredPrivateBroker({...env,DRNIB_GUEST_WORKER_REVIEWED:'false'});assert.equal(await unreviewed.guestPlanningReady(),false);
    globalThis.fetch=async()=>{throw Error('test-only parked worker')};
    const parked=await configuredPrivateBroker({...env,DRNIB_PRIVATE_WAKE_ENABLED:'true'},{wakeController:{run:async()=>{woke++},ensureReady:async()=>{woke++}}});
    assert.equal(await parked.guestPlanningReady(),true);assert.equal(woke,0);
  }finally{globalThis.fetch=before;}
});
