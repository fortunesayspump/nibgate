import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateRunCreateAdmission} from './private-run-admission.js';

test('unapproved tenants and capped owners are rejected before a paid CVM can be woken',async()=>{
  let limitCalls=0,wakes=0;
  const createLimit=async()=>{limitCalls++;return {ok:false}};
  const ready=async()=>{wakes++;return true};
  const other=await privateRunCreateAdmission({user:{id:'other'},body:{},allowedTenantId:'owner',createLimit,ready});
  assert.deepEqual(other,{status:404,code:'PRIVATE_MODE_UNAVAILABLE'});
  assert.equal(limitCalls,0);
  const capped=await privateRunCreateAdmission({user:{id:'owner'},body:{},allowedTenantId:'owner',createLimit,ready});
  assert.deepEqual(capped,{status:429,code:'PRIVATE_RUN_LIMIT'});
  assert.equal(limitCalls,1);
  assert.equal(wakes,0);
});

test('only owner with empty opaque draft body reaches CVM readiness gate',async()=>{
  const createLimit=async()=>({ok:true});
  let wakes=0;
  const ready=async()=>{wakes++;return true};
  const args={user:{id:'owner'},allowedTenantId:'owner',createLimit,ready};
  assert.deepEqual(await privateRunCreateAdmission({...args,body:{}}),{status:200,code:'PRIVATE_RUN_ALLOWED'});
  assert.equal((await privateRunCreateAdmission({...args,body:{question:'synthetic private canary'}})).status,400);
  assert.equal((await privateRunCreateAdmission({...args,body:null})).status,400);
  assert.equal(wakes,1);
  assert.deepEqual(await privateRunCreateAdmission({...args,body:{},ready:async()=>false}),
    {status:503,code:'PRIVATE_MODE_UNAVAILABLE'});
  assert.deepEqual(await privateRunCreateAdmission({...args,body:{},allowedTenantId:undefined}),
    {status:503,code:'PRIVATE_MODE_UNAVAILABLE'});
});
