// Real owner-only local broker + SIWE proxy. No fixture, mock model, fake
// account or permissive attestation verifier. Never deploy this local adapter.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {writeLocalAuthResponse} from './drnib-private-auth-response.mjs';
import {localAuthTransport} from './drnib-private-auth-transport.mjs';
const require=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url));
const dotenv=require('dotenv');
const settings=JSON.parse(await readFile('/tmp/drnib-private-broker-vars.json','utf8'));
const storage=JSON.parse(await readFile('/tmp/drnib-private-storage-vars.json','utf8'));
const owner=dotenv.parse(await readFile('/Users/fortune/Documents/Codex/2026-10-16/task-5/owner-only-phala.env','utf8'));
if(process.env.DRNIB_LOCAL_VERIFIED_OWNER_FILE){
 const identity=JSON.parse(await readFile(process.env.DRNIB_LOCAL_VERIFIED_OWNER_FILE,'utf8'));
 const checkedAt=Date.parse(identity.verifiedAt),age=Date.now()-checkedAt;
 // A persisted owner identifier is configuration, never request authentication.
 // Allow read-only restart for the exact previously checked wallet/tenant;
 // every request still requires the Hub's live signed-session verification.
 const pausedOwnerRestart=process.env.DRNIB_LOCAL_WORKFLOW_PAUSED==='true'&&process.env.DRNIB_LOCAL_EXPECTED_TENANT_ID===identity.id&&
  identity.walletAddress?.toLowerCase()===process.env.DRNIB_LOCAL_EXPECTED_WALLET?.toLowerCase();
 if(!/^[A-Za-z0-9:_-]{1,128}$/.test(identity.id)||!/^0x[0-9a-f]{40}$/i.test(identity.walletAddress)||!Number.isFinite(checkedAt)||age<0||age>3600000&&!pausedOwnerRestart)throw Error('Invalid signed owner configuration');
 settings.DRNIB_PRIVATE_TEST_TENANT_ID=identity.id;
}
const privateUrl=new URL(settings.DRNIB_DATABASE_URL),guestUrl=new URL(owner.DRNIB_DATABASE_URL);
if(privateUrl.pathname!=='/drnib_private_synthetic'||guestUrl.pathname!==privateUrl.pathname)throw Error('Wrong private test database');
privateUrl.hostname=guestUrl.hostname;privateUrl.port=guestUrl.port;privateUrl.searchParams.set('sslmode','require');
privateUrl.searchParams.set('connect_timeout','20');
Object.assign(process.env,settings,{DRNIB_DATABASE_URL:privateUrl.href,PRIVATE_BROKER_AUTH_TIMEOUT_MS:'15000',DRNIB_PRIVATE_BROKER_ONLY:'true',DRNIB_PRIVATE_WAKE_ENABLED:'false',DRNIB_PRIVATE_RECORDS_ENABLED:'true',DRNIB_PRIVATE_WORKFLOW_ENABLED:'true',PORT:'3103',NODE_ENV:'development'});
process.env.DRNIB_PRIVATE_WEB_ENABLED=process.env.DRNIB_LOCAL_PUBLIC_WEB==='true'?'true':'false';
if(process.env.DRNIB_LOCAL_WORKFLOW_PAUSED==='true')Object.assign(process.env,{DRNIB_PRIVATE_WORKFLOW_ENABLED:'false',DRNIB_PRIVATE_WEB_ENABLED:'false'});
if(process.env.DRNIB_LOCAL_PRIVATE_PAUSED==='true')Object.assign(process.env,{DRNIB_PRIVATE_ENABLED:'false',DRNIB_PRIVATE_RECORDS_ENABLED:'false',DRNIB_PRIVATE_WORKFLOW_ENABLED:'false'});
for(const name of ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','DRNIB_R2_BUCKET']){if(!storage[name])throw Error('Private storage configuration missing');process.env[name]=storage[name]}
const hub=new URL(settings.PRIVATE_BROKER_AUTH_URL).origin;
if(hub!=='https://testnet-api.nibgate.xyz')throw Error('Unexpected test auth service');
// Diagnose real Hub availability without logging cookies, tokens or bodies.
const upstreamFetch=globalThis.fetch;
const authTransport=process.env.DRNIB_LOCAL_HUB_AUTH_TRANSPORT_ORIGIN??hub;
localAuthTransport(hub+'/api/auth/me',authTransport); // Validate before listening.
// Validate the response against its real TLS origin. Never spoof Response.url
// or relax the broker's same-origin/no-redirect authorization checks.
process.env.PRIVATE_BROKER_AUTH_URL=authTransport+'/api/auth/me';
let loggedAuthShape=false;
globalThis.fetch=async(url,options)=>{
 const checked=[hub+'/api/auth/me',authTransport+'/api/auth/me'].includes(String(url));const started=Date.now();
 try{const response=await upstreamFetch(localAuthTransport(url,authTransport),options);if(checked)console.log('[hub-auth]',{status:response.status,elapsedMs:Date.now()-started});
  if(checked&&response.status===200&&!loggedAuthShape&&process.env.DRNIB_LOCAL_AUTH_SHAPE_DIAGNOSTICS==='true'){
   const data=await response.clone().json();loggedAuthShape=true;
   console.log('[hub-auth-shape]',{hasLegacyAddress:/^0x[0-9a-f]{40}$/i.test(data.user?.walletAddress??''),hasLinkedAddress:/^0x[0-9a-f]{40}$/i.test(data.user?.wallets?.[0]?.address??''),linkedWalletCount:Array.isArray(data.user?.wallets)?data.user.wallets.length:null});
  }
  return response;}
 catch(error){if(checked)console.log('[hub-auth]',{unavailable:true,timedOut:options?.signal?.aborted===true,elapsedMs:Date.now()-started,transportCode:['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'].includes(error?.cause?.code)?error.cause.code:'OTHER'});throw error;}
};
const {createPrivateBrokerOnlyApp}=await import('../dr-nib/backend/src/privacy/private-broker-main.js');
const app=await createPrivateBrokerOnlyApp();
const broker=createServer((req,res)=>{
 // Local diagnosis only: fixed route shape/status, never bodies, cookies,
 // private titles, keys or source bytes.
 const path=new URL(req.url,'http://127.0.0.1').pathname.replace(/[0-9a-f-]{36}/gi,':id');
 res.once('finish',()=>{
  console.log('[private-route]',req.method,path,res.statusCode,...(res.statusCode>=500?[{authenticated:!!req.user}]:[]));
  if(path==='/v1/private/identity'&&req.user){
   console.log('[private-owner]',{configuredOwnerMatches:req.user.id===settings.DRNIB_PRIVATE_TEST_TENANT_ID});
   const wallet=process.env.DRNIB_LOCAL_EXPECTED_WALLET,output=process.env.DRNIB_LOCAL_VERIFIED_OWNER_OUTPUT;
   if(/^0x[0-9a-f]{40}$/i.test(wallet||'')&&output?.startsWith('/tmp/')&&req.user.walletAddress?.toLowerCase()===wallet.toLowerCase())
    void writeFile(output,JSON.stringify({id:req.user.id,walletAddress:req.user.walletAddress,verifiedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'}).then(()=>console.log('[private-owner] verified signed wallet identity saved locally')).catch(()=>{});
  }
 });
 app(req,res);
});
broker.listen(3103,'127.0.0.1',()=>console.log('Real private broker: http://127.0.0.1:3103 (owner-restricted, real SIWE, real Phala)'));
const methods=new Map([['/auth/nonce','GET'],['/auth/verify','POST'],['/auth/me','GET'],['/auth/logout','POST']]);
const auth=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(methods.get(path)!==req.method){res.writeHead(404);return res.end()}
  if(req.method==='POST'&&!['http://127.0.0.1:3001','http://localhost:3001'].includes(req.headers.origin)){res.writeHead(403);return res.end()}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)throw Error('Request limit');chunks.push(chunk)}
  const cookies=String(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>/^(auth_session_testnet|auth_nonce_testnet)=/.test(s)).join('; ');
  const response=await fetch(hub+path,{method:req.method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/json','content-type':'application/json',cookie:cookies,'x-forwarded-host':'127.0.0.1:3001'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
  const setCookies=response.headers.getSetCookie().filter(s=>/^(auth_session_testnet|auth_nonce_testnet)=/.test(s)).map(s=>s.replace(/;\s*Domain=[^;]+/ig,'').replace(/;\s*Secure\b/ig,''));
  await writeLocalAuthResponse(res,response,setCookies);
 }catch{if(res.headersSent){res.destroy();return}res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({code:'LOCAL_AUTH_UNAVAILABLE'}))}
});
auth.listen(3104,'127.0.0.1',()=>console.log('Real SIWE loopback proxy: http://127.0.0.1:3104/auth/*'));
async function stop(){broker.closeAllConnections?.();auth.closeAllConnections?.();await Promise.all([new Promise(r=>broker.close(r)),new Promise(r=>auth.close(r))]);process.exit(0)}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
