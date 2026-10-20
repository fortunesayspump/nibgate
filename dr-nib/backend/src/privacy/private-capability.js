import {randomUUID} from 'node:crypto';

const SCOPES=new Set(['sessions:open','sessions:action','sessions:prove','sessions:execute','sessions:full-execute','reports:read','jobs:read','tools:check']);
const RUN_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TENANT_ID=/^[A-Za-z0-9:_-]{1,128}$/;
const ISSUER='drnib-private-broker';
const AUDIENCE='drnib-phala-guest';
function requestScope(req){
  const path=new URL(req.url,'http://guest.invalid').pathname;
  if(req.method==='POST'&&path==='/v1/private/tools/check')return 'tools:check';
  if(req.method==='POST'&&path==='/v1/private/sessions')return 'sessions:open';
  if(req.method==='POST'&&/^\/v1\/private\/sessions\/[0-9a-f-]{36}\/prove$/.test(path))return 'sessions:prove';
  if(req.method==='POST'&&/^\/v1\/private\/sessions\/[0-9a-f-]{36}\/execute$/.test(path))return 'sessions:execute';
  if(req.method==='POST'&&/^\/v1\/private\/sessions\/[0-9a-f-]{36}\/full-execute$/.test(path))return 'sessions:full-execute';
  if(req.method==='POST'&&/^\/v1\/private\/sessions\/[0-9a-f-]{36}\/action$/.test(path))return 'sessions:action';
  if(req.method==='GET'&&/^\/v1\/private\/reports\/[0-9a-f-]{36}$/.test(path))return 'reports:read';
  if(req.method==='GET'&&/^\/v1\/private\/runs\/[0-9a-f-]{36}\/job$/.test(path))return 'jobs:read';
  return null;
}
/** Standard EdDSA JWT capability. Signing key stays on the ordinary broker,
 * and only its public verification key is in the guest. A forged broker token
 * can consume service capacity but cannot decrypt client-to-guest HPKE data. */
export function createPrivateCapabilitySigner({privateKey}){
  if(!privateKey)throw new Error('PRIVATE_CAPABILITY_UNAVAILABLE');
  return async({tenantId,runId,scope})=>{
    if(typeof tenantId!=='string'||typeof runId!=='string'||!TENANT_ID.test(tenantId)||!RUN_ID.test(runId)||!SCOPES.has(scope))throw new Error('PRIVATE_CAPABILITY_UNAVAILABLE');
    const {SignJWT}=await import('jose');
    return new SignJWT({tenantId,runId,scope})
      .setProtectedHeader({alg:'EdDSA',typ:'JWT'}).setIssuer(ISSUER).setAudience(AUDIENCE)
      .setIssuedAt().setExpirationTime('45s').setJti(randomUUID()).sign(privateKey);
  };
}
/** Reject replays with an atomic consumeJti store; no permissive default. */
export function createGuestCapabilityAuthenticator({publicKey,consumeJti}){
  if(!publicKey||typeof consumeJti!=='function')throw new Error('PRIVATE_CAPABILITY_UNAVAILABLE');
  return async req=>{
    try{
      const scope=requestScope(req),auth=req.headers.authorization;
      if(!scope||typeof auth!=='string'||!auth.startsWith('Bearer '))return null;
      const {jwtVerify}=await import('jose');
      const {payload}=await jwtVerify(auth.slice(7),publicKey,{issuer:ISSUER,audience:AUDIENCE,algorithms:['EdDSA'],maxTokenAge:'45s',clockTolerance:0});
      if(payload.scope!==scope||typeof payload.tenantId!=='string'||!TENANT_ID.test(payload.tenantId)||
         typeof payload.runId!=='string'||!RUN_ID.test(payload.runId)||typeof payload.jti!=='string'||
         await consumeJti(payload.jti,payload.exp)!==true)return null;
      return {tenantId:payload.tenantId,runId:payload.runId};
    }catch{return null}
  };
}

/** Single-process demo replay cache. Production multi-instance guests need a
 * shared atomic store, or one pinned instance with this cache per lifecycle. */
export function createInMemoryJtiConsumer({now=Date.now,maxEntries=4096}={}){
  const seen=new Map();
  return async(jti,exp)=>{
    if(typeof jti!=='string'||! /^[0-9a-f-]{36}$/.test(jti)||!Number.isSafeInteger(exp))return false;
    for(const [key,until] of seen)if(until<=now())seen.delete(key);
    const until=exp*1000;
    if(until<=now()||seen.has(jti)||seen.size>=maxEntries)return false;
    seen.set(jti,until);return true;
  };
}
