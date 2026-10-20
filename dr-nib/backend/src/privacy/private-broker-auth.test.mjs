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
test('account-check timeout configuration stays bounded and rejects invalid startup settings',()=>{
  assert.doesNotThrow(()=>createPrivateBrokerAuth({env:{PRIVATE_BROKER_AUTH_TIMEOUT_MS:'15000'}}));
  for(const value of ['0','-1','500','20001','Infinity','15000.5','not-a-number'])
    assert.throws(()=>createPrivateBrokerAuth({env:{PRIVATE_BROKER_AUTH_TIMEOUT_MS:value}}),/timeout/);
});
test('parallel session checks coalesce only while in flight, with no stale grant or cross-session reuse',async()=>{
  let calls=0,release;let gate=new Promise(resolve=>{release=resolve});let status=200;
  const auth=createPrivateBrokerAuth({env:{PRIVATE_BROKER_AUTH_URL:'https://testnet-api.nibgate.xyz/api/auth/me',NIBGATE_SESSION_COOKIE:COOKIE},fetchImpl:async()=>{
    calls++;await gate;return {status,ok:status===200,redirected:false,url:'https://testnet-api.nibgate.xyz/api/auth/me',json:async()=>({authenticated:true,user:{id:'owner'}})};
  }});
  let next=0;const invoke=token=>{const res=response();return auth({cookies:{[COOKIE]:token}},res,()=>{next++}).then(()=>res)};
  const first=invoke('one'),second=invoke('one'),other=invoke('two');
  assert.equal(calls,2);release();await Promise.all([first,second,other]);assert.equal(next,3);
  status=401;const denied=await invoke('one');assert.equal(calls,3);assert.equal(next,3);assert.equal(denied.statusCode,401);
  status=503;assert.equal((await invoke('one')).statusCode,503);assert.equal(next,3);
});

test('canonical Hub identity path works without granting database or unrelated-cookie access',async()=>{
 const endpoint='https://testnet-api.nibgate.xyz/auth/me';let seen;
 const middleware=createPrivateBrokerAuth({env:{PRIVATE_BROKER_AUTH_URL:endpoint,NIBGATE_SESSION_COOKIE:COOKIE},fetchImpl:async(url,init)=>{seen={url:String(url),init};return{status:200,ok:true,url:endpoint,json:async()=>({authenticated:true,user:{id:'owner'}})}}});
 const req={cookies:{[COOKIE]:'fixture',other:'not-forwarded'}};let next=0;
 await middleware(req,response(),()=>next++);assert.equal(next,1);assert.equal(seen.url,endpoint);assert.equal(seen.init.headers.cookie,COOKIE+'=fixture');
});
