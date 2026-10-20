import {createHash} from 'node:crypto';
import {privateModelSessionMatches} from './private-model-session.js';
import {PRIVATE_ACI_REFUSAL,PRIVATE_ACI_FAILURE,verifiedAciRefusal} from './private-aci-refusal.js';
import {privateRateLimitEvidence} from './private-rate-limit.js';

const HEX64=/^[0-9a-f]{64}$/;

/** Discovers a live attested ACI session for an approved model.
 *
 * The gateway rotates sessions in seconds, so a boot-pinned session id goes
 * stale and fails with `session_not_accepted`. The guest must therefore
 * resolve a session at job time. A model is only serveable when it is both a
 * TEE model in `/v1/models` and has a current session whose
 * `claims.extra.canonical_model_id` equals the requestable route id. */
export function createAciSessionDiscoverer({baseURL,apiKey,fetchImpl=fetch,now=Date.now}={}){
  if(typeof baseURL!=='string'||!baseURL.startsWith('https://')||
     typeof apiKey!=='string'||!apiKey||typeof fetchImpl!=='function'||typeof now!=='function')
    throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const base=baseURL.replace(/\/v1\/?$/,'').replace(/\/+$/,'');
  const headers={authorization:`Bearer ${apiKey}`};
  return async(model,{fetchImpl:channelFetch=fetchImpl,allSessions=false}={})=>{
    if(typeof channelFetch!=='function')throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    if(typeof model!=='string'||!model)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    let modelsRes,sessionsRes;
    try{
      [modelsRes,sessionsRes]=await Promise.all([
        channelFetch(`${base}/v1/models`,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)}),
        channelFetch(`${base}/v1/aci/sessions?model=${encodeURIComponent(model)}`,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)}),
      ]);
    }catch{throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE')}
    if(!modelsRes.ok||!sessionsRes.ok)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    const models=await modelsRes.json().catch(()=>null);
    const sessionsBody=await sessionsRes.json().catch(()=>null);
    const tee=new Set((Array.isArray(models?.data)?models.data:[]).filter(m=>m?.is_tee===true).map(m=>m.id));
    if(!tee.has(model))throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    const sessions=[...new Set((Array.isArray(sessionsBody?.sessions)?sessionsBody.sessions:[])
      .filter(s=>privateModelSessionMatches(s,model)&&HEX64.test(s?.session_id)&&Number.isSafeInteger(s.expires_at)&&s.expires_at*1000>now()+5000)
      .sort((a,b)=>b.expires_at-a.expires_at).map(s=>s.session_id))].slice(0,16);
    if(!sessions.length)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    return allSessions?sessions:sessions[0];
  };
}

/** SDK-backed verified inference channel, for use only inside the measured
 * guest. Credentials must arrive through independently reviewed guest secret
 * release. This adapter has no direct network fallback for inference.
 *
 * The serving session is resolved by the caller through `sessionFor(model)`:
 * a pinned `acceptedSessionId` when supplied, otherwise a fresh live session
 * from `selectSession` (see `createAciSessionDiscoverer`). The identity pin
 * (production OS + compose hash) is always enforced.
 *
 * Receipt findings from the live compatibility probe
 * (src/privacy/aci-receipt-probe.mjs):
 *   - the gateway's chat route is `/v1/chat/completions` (the old
 *     `/chat/completions` path 404s), so the base URL's `/v1` is normalized;
 *   - the signed receipt does NOT embed usage/cost, but its event_log commits
 *     `sha256:<response bytes>` under a `response.*` event, and the completion
 *     body carries `usage.cost`. Binding our exact response bytes to that
 *     committed hash is what makes `usage` trustworthy. */
export function createAciChannelFactory({baseURL,apiKey,expectedComposeHash,acceptedSessionId,approvedModels,selectSession,connect,requestTimeoutMs=180000,now=Date.now}){
  if(typeof baseURL!=='string'||!baseURL.startsWith('https://')||
     typeof apiKey!=='string'||!apiKey||typeof now!=='function'||!HEX64.test(expectedComposeHash)||!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<100||requestTimeoutMs>180000||
     (acceptedSessionId!==undefined&&!HEX64.test(acceptedSessionId))||
     (acceptedSessionId===undefined&&typeof selectSession!=='function')||
     (approvedModels!==undefined&&(!Array.isArray(approvedModels)||approvedModels.length===0||
       approvedModels.some(m=>typeof m!=='string'||!m))))throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const base=baseURL.replace(/\/v1\/?$/,'').replace(/\/+$/,'');
  const endpoint=new URL(base+'/v1/chat/completions');
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
    throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const allowed=Array.isArray(approvedModels)?new Set(approvedModels):null;
  let rateLimitedUntil=0;
  return async()=>{
    // Do not reconnect or send another prompt during an account cooldown.
    // The AI port can prove this failure happened before dispatch.
    if(now()<rateLimitedUntil)throw new Error('PRIVATE_ACI_COOLDOWN');
    const connectAci=connect??(await import('@phala/aci-verifier/runtime')).connectAci;
    const aci=await connectAci({baseURL:base,timeoutMs:30000,policy:{requireProductionOs:true,acceptedComposeHashes:[expectedComposeHash]},
      serving:{requireVerified:true,requireReceipt:true,...(acceptedSessionId?{acceptedSessionIds:[acceptedSessionId]}:{})}});
    try{
      if(aci?.identity?.transcript?.verdict?.verified!==true||aci.identity.composeHash!==expectedComposeHash||
         !aci.identity.transcript.lines?.some(x=>x.id==='policy-os'&&x.status==='pass')||
         typeof aci.fetch!=='function'||typeof aci.verifyReceipt!=='function')throw new Error('PRIVATE_ACI_IDENTITY_UNAVAILABLE');
      let receiptId=null,wireDigest=null,responseDigest=null,activeSessionIds=[];
      const discover=async model=>{
        if(typeof model!=='string'||!model||(allowed&&!allowed.has(model)))throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
        const value=acceptedSessionId?[acceptedSessionId]:await selectSession(model,{fetchImpl:(...args)=>aci.fetch(...args),allSessions:true});
        const ids=typeof value==='string'?[value]:value;
        if(!Array.isArray(ids)||!ids.length||ids.length>16||ids.some(id=>typeof id!=='string'||!HEX64.test(id))||new Set(ids).size!==ids.length)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
        activeSessionIds=[...ids];return [...ids];
      };
      return {
        verified:true,productionOs:true,expectedComposeHash:true,
        async sessionFor(model){return (await discover(model))[0]},
        sessionsFor:discover,
        async requestSerialized(serialized){
          if(typeof serialized!=='string'||receiptId!==null||!activeSessionIds.length)throw new Error('PRIVATE_ACI_REQUEST_UNAVAILABLE');
          wireDigest=createHash('sha256').update(serialized,'utf8').digest('hex');
          const response=await aci.fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:serialized,signal:AbortSignal.timeout(requestTimeoutMs)});
          if(!response.ok){
            // Only an allowlisted HTTP category crosses the private error
            // boundary. Never read or persist an upstream error body.
            const error=new Error('PRIVATE_ACI_RESPONSE_UNAVAILABLE');
            error.privateCompletionReason=response.status===400?'PHALA_PRIVATE_AI_REQUEST_REJECTED':
              response.status===412?'PHALA_PRIVATE_AI_SESSION_EXPIRED':
              [401,403].includes(response.status)?'PHALA_PRIVATE_AI_CREDENTIAL_REJECTED':
              response.status===429?'PHALA_PRIVATE_AI_RATE_LIMITED':
              [502,503,504].includes(response.status)?'PHALA_PRIVATE_AI_UPSTREAM_UNAVAILABLE':null;
            const refusedId=response.headers?.get?.('x-receipt-id');
            const rateLimit=response.status===429?privateRateLimitEvidence(response.headers,now()):null;
            const retryAfterMs=rateLimit?.retryAfterMs??null;
            if(retryAfterMs!==null)rateLimitedUntil=Math.max(rateLimitedUntil,now()+retryAfterMs);
            const request=JSON.parse(serialized);
            Object.defineProperty(error,PRIVATE_ACI_FAILURE,{value:Object.freeze({format:'drnib-aci-failure-v1',httpStatus:response.status,requestDigest:wireDigest,model:request.model,...(rateLimit?{...rateLimit,retryNotBefore:new Date(rateLimitedUntil).toISOString(),requestBytes:Buffer.byteLength(serialized,'utf8'),...(Number.isSafeInteger(request.max_tokens)&&request.max_tokens>0?{requestedMaxTokens:request.max_tokens}:{})}:{}),...(typeof refusedId==='string'&&/^[A-Za-z0-9_:.-]{1,160}$/.test(refusedId)?{receiptId:refusedId}:{})})});
            if(response.status===412&&typeof refusedId==='string'&&/^[A-Za-z0-9_:.-]{1,160}$/.test(refusedId)){
              // The SDK hashes its response clone; no provider error body is
              // read into a string, logged or parsed by this adapter.
              try{const proof=verifiedAciRefusal(await aci.verifyReceipt(refusedId),{receiptId:refusedId,requestDigest:wireDigest,model:JSON.parse(serialized).model,status:response.status});
                Object.defineProperty(error,PRIVATE_ACI_REFUSAL,{value:proof});
              }catch{} // Missing/late/invalid proof keeps the full reservation.
            }
            throw error;
          }
          receiptId=response.headers.get('x-receipt-id');
          if(typeof receiptId!=='string'||!receiptId||receiptId.length>160)throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const raw=await response.text();
          if(raw.length>2*1024*1024)throw new Error('PRIVATE_ACI_RESPONSE_UNAVAILABLE');
          responseDigest=createHash('sha256').update(raw,'utf8').digest('hex');
          return JSON.parse(raw);
        },
        async verifyReceipt(_result,expected){
          const expectedIds=expected.sessionIds??[expected.sessionId];
          if(!receiptId||!wireDigest||!responseDigest||!activeSessionIds.length||wireDigest!==expected.requestDigest||JSON.stringify(expectedIds)!==JSON.stringify(activeSessionIds))
            throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const audit=await aci.verifyReceipt(receiptId);
          if(audit?.transcript?.verdict?.verified!==true||audit.receiptId!==receiptId||
             audit.receipt?.model!==expected.model)throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const events=audit.receipt.event_log;
          const serving=Array.isArray(events)?events.find(e=>e?.type==='upstream.verified'&&e.result==='verified'&&e.required===true&&activeSessionIds.includes(e.session_id)):null;
          if(!Array.isArray(events)||!events.some(e=>e?.type==='request.received'&&e.body_hash===`sha256:${wireDigest}`)||
             !serving||
             // Binds OUR exact response bytes to the signed receipt. Without this
             // the completion's usage/cost is unauthenticated.
             !events.some(e=>typeof e?.type==='string'&&e.type.startsWith('response.')&&e.body_hash===`sha256:${responseDigest}`))
            throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          return {verified:true,required:true,requestDigest:wireDigest,responseDigest,receiptId,sessionId:serving.session_id,model:expected.model};
        },
        close:()=>aci.close(),
      };
    }catch(error){await aci?.close?.().catch(()=>{});throw error}
  };
}
