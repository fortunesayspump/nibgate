import {createHash} from 'node:crypto';

const HEX64=/^[0-9a-f]{64}$/;

/** Discovers a live attested ACI session for an approved model.
 *
 * The gateway rotates sessions in seconds, so a boot-pinned session id goes
 * stale and fails with `session_not_accepted`. The guest must therefore
 * resolve a session at job time. A model is only serveable when it is both a
 * TEE model in `/v1/models` and has a current session whose
 * `claims.extra.canonical_model_id` equals the requestable route id. */
export function createAciSessionDiscoverer({baseURL,apiKey,fetchImpl=fetch}={}){
  if(typeof baseURL!=='string'||!baseURL.startsWith('https://')||
     typeof apiKey!=='string'||!apiKey||typeof fetchImpl!=='function')
    throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const base=baseURL.replace(/\/v1\/?$/,'').replace(/\/+$/,'');
  const headers={authorization:`Bearer ${apiKey}`};
  return async model=>{
    if(typeof model!=='string'||!model)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    let modelsRes,sessionsRes;
    try{
      [modelsRes,sessionsRes]=await Promise.all([
        fetchImpl(`${base}/v1/models`,{headers,signal:AbortSignal.timeout(20000)}),
        fetchImpl(`${base}/v1/aci/sessions`,{headers,signal:AbortSignal.timeout(20000)}),
      ]);
    }catch{throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE')}
    if(!modelsRes.ok||!sessionsRes.ok)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    const models=await modelsRes.json().catch(()=>null);
    const sessionsBody=await sessionsRes.json().catch(()=>null);
    const tee=new Set((Array.isArray(models?.data)?models.data:[]).filter(m=>m?.is_tee===true).map(m=>m.id));
    if(!tee.has(model))throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    const session=(Array.isArray(sessionsBody?.sessions)?sessionsBody.sessions:[])
      .find(s=>s?.claims?.extra?.canonical_model_id===model&&HEX64.test(s?.session_id));
    if(!session)throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
    return session.session_id;
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
export function createAciChannelFactory({baseURL,apiKey,expectedComposeHash,acceptedSessionId,approvedModels,selectSession,connect}){
  if(typeof baseURL!=='string'||!baseURL.startsWith('https://')||
     typeof apiKey!=='string'||!apiKey||!HEX64.test(expectedComposeHash)||
     (acceptedSessionId!==undefined&&!HEX64.test(acceptedSessionId))||
     (acceptedSessionId===undefined&&typeof selectSession!=='function')||
     (approvedModels!==undefined&&(!Array.isArray(approvedModels)||approvedModels.length===0||
       approvedModels.some(m=>typeof m!=='string'||!m))))throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const base=baseURL.replace(/\/v1\/?$/,'').replace(/\/+$/,'');
  const endpoint=new URL(base+'/v1/chat/completions');
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
    throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const allowed=Array.isArray(approvedModels)?new Set(approvedModels):null;
  return async()=>{
    const connectAci=connect??(await import('@phala/aci-verifier/runtime')).connectAci;
    const aci=await connectAci({baseURL:base,policy:{requireProductionOs:true,acceptedComposeHashes:[expectedComposeHash]},
      serving:{requireVerified:true,requireReceipt:true,...(acceptedSessionId?{acceptedSessionIds:[acceptedSessionId]}:{})}});
    try{
      if(aci?.identity?.transcript?.verdict?.verified!==true||aci.identity.composeHash!==expectedComposeHash||
         !aci.identity.transcript.lines?.some(x=>x.id==='policy-os'&&x.status==='pass')||
         typeof aci.fetch!=='function'||typeof aci.verifyReceipt!=='function')throw new Error('PRIVATE_ACI_IDENTITY_UNAVAILABLE');
      let receiptId=null,wireDigest=null,responseDigest=null,activeSessionId=null;
      return {
        verified:true,productionOs:true,expectedComposeHash:true,
        async sessionFor(model){
          if(typeof model!=='string'||!model||(allowed&&!allowed.has(model)))
            throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
          if(acceptedSessionId){activeSessionId=acceptedSessionId;return activeSessionId}
          const discovered=await selectSession(model);
          if(typeof discovered!=='string'||!HEX64.test(discovered))
            throw new Error('PRIVATE_ACI_SESSION_UNAVAILABLE');
          activeSessionId=discovered;return activeSessionId;
        },
        async requestSerialized(serialized){
          if(typeof serialized!=='string'||receiptId!==null||!activeSessionId)throw new Error('PRIVATE_ACI_REQUEST_UNAVAILABLE');
          wireDigest=createHash('sha256').update(serialized,'utf8').digest('hex');
          const response=await aci.fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:serialized});
          if(!response.ok)throw new Error('PRIVATE_ACI_RESPONSE_UNAVAILABLE');
          receiptId=response.headers.get('x-receipt-id');
          if(typeof receiptId!=='string'||!receiptId||receiptId.length>160)throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const raw=await response.text();
          if(raw.length>2*1024*1024)throw new Error('PRIVATE_ACI_RESPONSE_UNAVAILABLE');
          responseDigest=createHash('sha256').update(raw,'utf8').digest('hex');
          return JSON.parse(raw);
        },
        async verifyReceipt(_result,expected){
          if(!receiptId||!wireDigest||!responseDigest||!activeSessionId||wireDigest!==expected.requestDigest||expected.sessionId!==activeSessionId)
            throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const audit=await aci.verifyReceipt(receiptId);
          if(audit?.transcript?.verdict?.verified!==true||audit.receiptId!==receiptId||
             audit.receipt?.model!==expected.model)throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const events=audit.receipt.event_log;
          if(!Array.isArray(events)||!events.some(e=>e?.type==='request.received'&&e.body_hash===`sha256:${wireDigest}`)||
             !events.some(e=>e?.type==='upstream.verified'&&e.result==='verified'&&e.session_id===activeSessionId)||
             // Binds OUR exact response bytes to the signed receipt. Without this
             // the completion's usage/cost is unauthenticated.
             !events.some(e=>typeof e?.type==='string'&&e.type.startsWith('response.')&&e.body_hash===`sha256:${responseDigest}`))
            throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          return {verified:true,required:true,requestDigest:wireDigest,responseDigest,receiptId,sessionId:activeSessionId,model:expected.model};
        },
        close:()=>aci.close(),
      };
    }catch(error){await aci?.close?.().catch(()=>{});throw error}
  };
}
