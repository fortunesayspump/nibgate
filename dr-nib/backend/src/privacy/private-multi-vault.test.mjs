import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {createPrivateRecordsRouter} from './private-record-routes.js';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const date=new Date('2026-10-01T00:00:00Z');
const sealed=(vaultId,purpose)=>({version:1,algorithm:'AES-256-GCM',iv:Buffer.alloc(12).toString('base64'),ciphertext:Buffer.alloc(48).toString('base64'),context:{tenantId:'owner',vaultId,runId:null,revision:1,purpose}});
const recovery=vaultId=>({version:2,code:sealed(vaultId,'vault-recovery'),password:{...sealed(vaultId,'vault-password'),kdf:{name:'PBKDF2-HMAC-SHA-256',iterations:600000,salt:Buffer.alloc(16).toString('base64')}}});

function fixture(){
 let active={userId:'owner',vaultId:A,revision:1,recoveryEnvelope:recovery(A),passkey:null,createdAt:date,updatedAt:date};
 const inactive=new Map();
 const vaultRecord={findUnique:async({where})=>where.userId==='owner'?active:null,updateMany:async({where,data})=>{
   if(active.vaultId!==where.vaultId||active.revision!==where.revision)return {count:0};
   active={...active,...data,updatedAt:new Date()};return {count:1};
 }};
 const vaultStored={findMany:async({where})=>[...inactive.values()].filter(row=>row.userId===where.userId),findUnique:async({where})=>inactive.get(where.vaultId)||null,count:async({where})=>[...inactive.values()].filter(row=>row.userId===where.userId).length,create:async({data})=>{if(inactive.has(data.vaultId))throw Error('duplicate');inactive.set(data.vaultId,data)},delete:async({where})=>{inactive.delete(where.vaultId)}};
 const store={privateVaultRecord:vaultRecord,privateVaultStored:vaultStored,researchRun:{findMany:async({where})=>[{id:where.privateClientObjects.some.vaultId,metadata:{},status:'draft',createdAt:date,updatedAt:date,deletedAt:null}]},$queryRaw:async()=>[], $transaction:async fn=>fn(store)};
 const app=express();app.use(express.json());app.use(createPrivateRecordsRouter({store,enabled:()=>true,allowedTenantId:'owner',authenticate:(req,_res,next)=>{req.user={id:'owner'};next()}}));
 return {api:request(app),state:()=>({active,inactive})};
}

test('vault folders keep old wrappers and scope projects across switches',async()=>{
 const {api,state}=fixture();
 assert.deepEqual((await api.get('/vaults')).body.vaults.map(v=>v.vaultId),[A]);
 const body={expectedVaultId:A,expectedRevision:1,newVaultId:B,recoveryEnvelope:recovery(B)};
 assert.equal((await api.post('/vaults').send(body)).status,201);
 assert.equal(state().active.vaultId,B);
 assert.deepEqual(state().inactive.get(A).recoveryEnvelope,recovery(A));
 assert.equal((await api.get('/projects')).body.runs[0].id,B);
 assert.equal((await api.post('/vaults').send(body)).status,201); // lost reply is safe to retry
 assert.equal((await api.post('/vaults').send({...body,recoveryEnvelope:{...body.recoveryEnvelope,code:{...body.recoveryEnvelope.code,iv:Buffer.alloc(12,9).toString('base64')}}})).status,409);
 assert.equal(state().inactive.size,1);
 assert.equal((await api.post('/vaults/switch').send({vaultId:A})).status,200);
 assert.equal((await api.get('/projects')).body.runs[0].id,A);
 assert.equal(state().active.revision,2);
 assert.deepEqual(state().inactive.get(B).recoveryEnvelope,recovery(B));
 assert.equal((await api.post('/vaults/switch').send({vaultId:B})).status,200);
 assert.equal(state().active.vaultId,B);
 assert.equal((await api.post('/vaults/switch').send({vaultId:'33333333-3333-4333-8333-333333333333'})).status,404);
});
