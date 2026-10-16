import {createHash} from 'node:crypto';

/** SDK-backed verified inference channel, for use only inside the measured
 * guest. Credentials must arrive through independently reviewed guest secret
 * release. This adapter has no direct network fallback. Published ACI 0.7.3
 * and current gateway documentation disagree on session-id syntax; keep this
 * disconnected from live private jobs until a harmless compatibility probe. */
export function createAciChannelFactory({baseURL,apiKey,expectedComposeHash,acceptedSessionId,connect}){
  if(typeof baseURL!=='string'||!baseURL.startsWith('https://')||
     typeof apiKey!=='string'||!apiKey||! /^[0-9a-f]{64}$/.test(expectedComposeHash)||
     ! /^[0-9a-f]{64}$/.test(acceptedSessionId))throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  const endpoint=new URL(baseURL.replace(/\/+$/,'')+'/chat/completions');
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)
    throw new Error('PRIVATE_ACI_CONFIG_UNAVAILABLE');
  return async()=>{
    const connectAci=connect??(await import('@phala/aci-verifier/runtime')).connectAci;
    const aci=await connectAci({baseURL,policy:{requireProductionOs:true,acceptedComposeHashes:[expectedComposeHash]},
      serving:{requireVerified:true,requireReceipt:true,acceptedSessionIds:[acceptedSessionId]}});
    try{
      if(aci?.identity?.transcript?.verdict?.verified!==true||aci.identity.composeHash!==expectedComposeHash||
         !aci.identity.transcript.lines?.some(x=>x.id==='policy-os'&&x.status==='pass')||
         typeof aci.fetch!=='function'||typeof aci.verifyReceipt!=='function')throw new Error('PRIVATE_ACI_IDENTITY_UNAVAILABLE');
      let receiptId=null,wireDigest=null;
      return {
        verified:true,productionOs:true,expectedComposeHash:true,sessionId:acceptedSessionId,
        async requestSerialized(serialized){
          if(typeof serialized!=='string'||receiptId!==null)throw new Error('PRIVATE_ACI_REQUEST_UNAVAILABLE');
          wireDigest=createHash('sha256').update(serialized,'utf8').digest('hex');
          const response=await aci.fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:serialized});
          if(!response.ok)throw new Error('PRIVATE_ACI_RESPONSE_UNAVAILABLE');
          receiptId=response.headers.get('x-receipt-id');
          if(typeof receiptId!=='string'||!receiptId||receiptId.length>160)throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const raw=await response.text();
          if(raw.length>2*1024*1024)throw new Error('PRIVATE_ACI_RESPONSE_UNAVAILABLE');
          return JSON.parse(raw);
        },
        async verifyReceipt(_result,expected){
          if(!receiptId||!wireDigest||wireDigest!==expected.requestDigest||expected.sessionId!==acceptedSessionId)
            throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const audit=await aci.verifyReceipt(receiptId);
          if(audit?.transcript?.verdict?.verified!==true||audit.receiptId!==receiptId||
             audit.receipt?.model!==expected.model)throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          const events=audit.receipt.event_log;
          if(!Array.isArray(events)||!events.some(e=>e?.type==='request.received'&&e.body_hash===`sha256:${wireDigest}`)||
             !events.some(e=>e?.type==='upstream.verified'&&e.result==='verified'&&e.session_id===acceptedSessionId))
            throw new Error('PRIVATE_ACI_RECEIPT_UNAVAILABLE');
          return {verified:true,required:true,requestDigest:wireDigest,sessionId:acceptedSessionId,model:expected.model};
        },
        close:()=>aci.close(),
      };
    }catch(error){await aci?.close?.().catch(()=>{});throw error}
  };
}
