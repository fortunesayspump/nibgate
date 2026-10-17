import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateBrokerAuth} from './private-broker-auth.js';

const COOKIE='auth_session_testnet';

function response(){
  const out={statusCode:null,body:null,status(n){this.statusCode=n;return this},json(value){this.body=value;return this}};
  return out;
}

test('broker auth delegates only the SIWE cookie to the pinned hub identity endpoint',async()=>{
  const calls=[];
  const middleware=createPrivateBrokerAuth({env:{PRIVATE_BROKER_AUTH_URL:'https://testnet-api.nibgate.xyz/api/auth/me',NIBGATE_SESSION_COOKIE:COOKIE},
    fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return {
      status:200,ok:true,redirected:false,url:'https://testnet-api.nibgate.xyz/api/auth/me',
      json:async()=>({authenticated:true,user:{id:'owner-1',walletAddress:'0xabc',ignored:'not-forwarded'}}),
    }}});
  const req={cookies:{[COOKIE]:'secret-cookie',unrelated:'do-not-forward'}};
  const res=response();let next=0;
  await middleware(req,res,()=>{next++});
  assert.equal(next,1);
  assert.deepEqual(req.user,{id:'owner-1',walletAddress:'0xabc'});
  assert.equal(calls[0].url,'https://testnet-api.nibgate.xyz/api/auth/me');
  assert.equal(calls[0].init.headers.cookie,`${COOKIE}=secret-cookie`);
  assert.ok(!calls[0].init.headers.cookie.includes('unrelated'));
});

test('broker auth fails closed for missing cookies, unpinned URLs and redirects',async()=>{
  for(const env of [{},{PRIVATE_BROKER_AUTH_URL:'http://testnet-api.nibgate.xyz/api/auth/me'},
    {PRIVATE_BROKER_AUTH_URL:'https://testnet-api.nibgate.xyz/other'}]){
    const res=response();let next=0;
    await createPrivateBrokerAuth({env,fetchImpl:async()=>{throw new Error('must not fetch')}})({cookies:{}},res,()=>{next++});
    assert.equal(next,0);assert.equal(res.statusCode,401);
  }
  const res=response();let next=0;
  await createPrivateBrokerAuth({env:{PRIVATE_BROKER_AUTH_URL:'https://testnet-api.nibgate.xyz/api/auth/me',NIBGATE_SESSION_COOKIE:COOKIE},fetchImpl:async()=>({
    status:200,ok:true,redirected:true,url:'https://evil.example/',json:async()=>({}),
  })})({cookies:{[COOKIE]:'x'}},res,()=>{next++});
  assert.equal(next,0);assert.equal(res.statusCode,503);
});
