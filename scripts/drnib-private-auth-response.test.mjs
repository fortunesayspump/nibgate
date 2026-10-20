import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeLocalAuthResponse} from './drnib-private-auth-response.mjs';
test('upstream auth body failure produces one 503 and leaves the next request operational',async()=>{
 let calls=0;
 const server=createServer(async(_req,res)=>{
  const response=++calls===1?{status:200,text:async()=>{throw Error('synthetic upstream timeout')}}:Response.json({signedIn:false});
  try{await writeLocalAuthResponse(res,response,[])}catch{if(res.headersSent){res.destroy();return}res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({code:'LOCAL_AUTH_UNAVAILABLE'}))}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}`;
  const first=await fetch(url);assert.equal(first.status,503);assert.deepEqual(await first.json(),{code:'LOCAL_AUTH_UNAVAILABLE'});
  const second=await fetch(url);assert.equal(second.status,200);assert.equal(second.headers.get('cache-control'),'no-store');assert.deepEqual(await second.json(),{signedIn:false});
 }finally{await new Promise(resolve=>server.close(resolve))}
});
