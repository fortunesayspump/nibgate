import {createHash} from 'node:crypto';
const ROUTING=Object.freeze({aci_verified:true,zdr:true,data_collection:'deny',allow_fallbacks:false,require_parameters:true});
/**
 * Interface contract only. Production must supply @phala/aci-verifier's pinned
 * transport and receipt checks inside the measured worker; nothing is wired.
 */
export function createPhalaAiPort({approvedModels,acceptedSessionIds,connectVerified,maxPromptChars=150000,maxOutputTokens=1200}) {
  if (!Array.isArray(approvedModels) || approvedModels.length===0 ||
      approvedModels.some(m=>typeof m!=='string' || !/^[a-zA-Z0-9/_:.-]{3,120}$/.test(m)) ||
      !Array.isArray(acceptedSessionIds) || acceptedSessionIds.length!==1 ||
      !/^[0-9a-f]{64}$/.test(acceptedSessionIds[0]) ||
      typeof connectVerified!=='function'||!Number.isSafeInteger(maxPromptChars)||maxPromptChars<1000||maxPromptChars>150000||
      !Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>1200)
    throw new Error('incomplete attested AI port');
  const models=new Set(approvedModels);
  const pinnedSessionId=acceptedSessionIds[0];
  return Object.freeze({
    // Accidental-miswire guard for measured-worker stages. This marker alone
    // is not attestation; infer() still verifies the channel and receipt.
    privateVerifiedTransport:'phala-aci-v1',
    async infer({model,messages}) {
      let channel;
      try {
      if (!models.has(model) || !Array.isArray(messages)||messages.length<1||messages.length>100||
          messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')||
          messages.reduce((n,m)=>n+m.content.length,0)>maxPromptChars)throw new Error('unapproved private AI request');
      channel=await connectVerified();
      if (!channel || channel.verified!==true || channel.productionOs!==true || channel.expectedComposeHash!==true ||
          channel.sessionId!==pinnedSessionId ||
          typeof channel.requestSerialized!=='function'||typeof channel.verifyReceipt!=='function') throw new Error('attested AI channel unavailable');
      // Request travels only over the verified transport object, never a
      // separate caller-controlled fetch. This canonical digest is an expected
      // value for the independent signed-receipt verifier.
      const body={model,messages,max_tokens:maxOutputTokens,provider:{...ROUTING,aci_session_ids:[pinnedSessionId]}};
      const serialized=JSON.stringify(body); // immutable UTF-8 wire contract
      const requestDigest=createHash('sha256').update(serialized,'utf8').digest('hex');
      const result=await channel.requestSerialized(serialized,{contentType:'application/json'});
      const expected={requestDigest,sessionId:channel.sessionId,model};
      const receipt=await channel.verifyReceipt(result,expected);
      if (!receipt || receipt.verified!==true || receipt.required!==true ||
          receipt.requestDigest!==requestDigest || receipt.sessionId!==channel.sessionId || receipt.model!==model)
        throw new Error('attested AI receipt unavailable');
      return result;
      } catch {
        // The existing worker persists error.message in steps/events. Never
        // let a provider exception carrying prompt text reach that sink.
        const error=new Error('Private AI unavailable');
        error.code='PHALA_PRIVATE_AI_UNAVAILABLE';
        throw error;
      } finally {
        try {await channel?.close?.()} catch {}
      }
    },
  });
}
