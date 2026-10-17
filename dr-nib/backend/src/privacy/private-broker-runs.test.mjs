import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.HUB_DATABASE_URL ||= 'postgresql://nobody:unused@127.0.0.1:1/unused?schema=hub';
process.env.DRNIB_DATABASE_URL ||= 'postgresql://nobody:unused@127.0.0.1:1/unused?schema=drnib';
const {createPrivateBrokerRouter} = await import('./private-broker.js');

const TENANT='tenant-1';
const RUN='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';

function appWith(rows,{user={id:TENANT},tenant=TENANT}={}){
  const router=createPrivateBrokerRouter({
    store:{researchRun:{findMany:async()=>rows}},
    allowedTenantId:tenant,
    authenticate:(req,_res,next)=>{req.user=user;next();},
  });
  const app=express();
  app.use(express.json());
  app.use('/v1/private',router);
  return app.listen(0);
}

async function get(app,path){
  const {port}=app.address();
  const response=await fetch(`http://127.0.0.1:${port}${path}`,{redirect:'error'});
  return {status:response.status,body:await response.json()};
}

test('private broker lists only the tenant\'s confidential runs with ciphertext-free metadata',async()=>{
  const app=appWith([
    {id:RUN,createdAt:new Date('2026-01-02T03:04:05.000Z'),status:'completed',userId:TENANT},
    {id:OTHER,createdAt:new Date('2026-01-01T00:00:00.000Z'),status:'running',userId:'someone-else'},
    {id:'not-a-uuid',createdAt:new Date(),status:'draft',userId:TENANT},
  ]);
  try{
    const {status,body}=await get(app,'/v1/private/runs');
    assert.equal(status,200);
    assert.deepEqual(body,{runs:[{id:RUN,createdAt:'2026-01-02T03:04:05.000Z',status:'completed',tenantId:TENANT}]});
    assert.ok(!JSON.stringify(body).includes('envelope'));
  }finally{app.close()}
});

test('private broker run list is closed without a tenant or an authenticated user',async()=>{
  const closed=appWith([],{tenant:null});
  try{assert.equal((await get(closed,'/v1/private/runs')).status,404);}finally{closed.close()}
  const anonymous=appWith([{id:RUN,createdAt:new Date(),status:'completed',userId:TENANT}],{user:null});
  try{assert.equal((await get(anonymous,'/v1/private/runs')).status,404);}finally{anonymous.close()}
});
