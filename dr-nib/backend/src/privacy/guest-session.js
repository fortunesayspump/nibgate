import {createHash,randomUUID} from 'node:crypto';
import {getPhalaSessionEvidence} from './phala-quote.js';
import {generateHpkeRecipient,openHpkeSource,validateHpkeSourceEnvelope} from './source-hpke.js';
import {isConfidentialRun} from './guard.js';

const TTL_MS=2*60*1000;
const MAX_SESSIONS=64;
function safeError() {const e=new Error('Private guest session unavailable');e.code='PRIVATE_SESSION_UNAVAILABLE';return e}

/** Guest-side, one-use session state. The quote provider defaults to the real
 * dstack guest socket; fixture providers are permitted only in local tests.
 * The HTTP caller must independently authenticate ownership. */
export function createGuestSessionManager({getRun,runner,model,quoteProvider=getPhalaSessionEvidence,executionJournal,now=Date.now}) {
  if(typeof getRun!=='function'||typeof runner?.execute!=='function'||typeof quoteProvider!=='function'||typeof model!=='string'||!model||
     (executionJournal&&(typeof executionJournal.claim!=='function'||typeof executionJournal.complete!=='function')))
    throw new Error('PRIVATE_GUEST_UNAVAILABLE');
  const sessions=new Map();
  let openings=0;
  function session(id) {
    const s=sessions.get(id);
    if(!s||now()>s.expiresAt){sessions.delete(id);throw safeError()}
    if(s.processing)throw safeError(); // never evict the active owner's session
    return s;
  }
  async function executeJob({sessionId,sourceEnvelope,keyEnvelope,tenantId,runId},full){
    let s;
    try {
      s=session(sessionId);
      if(tenantId!==s.tenantId||runId!==s.runId)throw safeError();
      if(!s.proven||full&&typeof runner.executeFull!=='function'||!full&&keyEnvelope!==undefined)throw safeError();
      s.processing=true; // synchronous lease before any await
      const run=await getRun(s.runId);
      if(!isConfidentialRun(run)||run.id!==s.runId||run.userId!==s.tenantId||run.deletedAt!=null||run.status!=='draft')throw safeError();
      validateHpkeSourceEnvelope(sourceEnvelope,{tenantId:s.tenantId,runId:s.runId});
      if(sourceEnvelope.context.recipientId!==s.pair.recipientId)throw safeError();
      if(full){
        validateHpkeSourceEnvelope(keyEnvelope,{tenantId:s.tenantId,runId:s.runId});
        if(keyEnvelope.context.recipientId!==s.pair.recipientId||
           keyEnvelope.context.objectId===sourceEnvelope.context.objectId)throw safeError();
      }
      if(executionJournal){
        const args={tenantId:s.tenantId,runId:s.runId,sourceEnvelope,...(full?{keyEnvelope}:{})};
        const claimed=await executionJournal.claim(args);
        if(claimed.state==='complete')return {id:claimed.reportId,version:1,encrypted:true};
        if(claimed.state==='processing'||claimed.state==='uncertain')return {state:claimed.state,runId:s.runId};
        if(claimed.state!=='start')throw safeError();
        const job={run,sessionId,sourceEnvelope,...(full?{keyEnvelope}:{}),
          guestPrivateKey:s.pair.privateKey,guestPublicKey:s.pair.publicKey,model};
        const receipt=await (full?runner.executeFull(job):runner.execute(job));
        await executionJournal.complete({...args,receipt});
        return receipt;
      }
      if(full)throw safeError(); // full paid path must always have a durable claim
      return await runner.execute({run,sourceEnvelope,guestPrivateKey:s.pair.privateKey,guestPublicKey:s.pair.publicKey,model});
    } catch (error) {
      if(error?.code==='PRIVATE_JOB_CONFLICT')throw error;
      throw safeError();
    }
    finally {if(s)sessions.delete(sessionId)}
  }
  return {
    async open({tenantId,runId,clientNonce}) {
      let reserved=false;
      try {
        for(const [id,s] of sessions)if(now()>s.expiresAt)sessions.delete(id);
        if(!Buffer.isBuffer(clientNonce)||clientNonce.length!==32||sessions.size+openings>=MAX_SESSIONS)throw safeError();
        openings++;reserved=true; // reserve before getRun/keygen/quote await
        const run=await getRun(runId);
        // Attestation-only opens also serve owner status/report retrieval after
        // a paid job. executeJob still requires draft before any new AI call.
        if(!isConfidentialRun(run)||run.id!==runId||run.userId!==tenantId||run.deletedAt!=null||
           !['draft','planning','planned','running','complete','paused','awaiting','ended','failed'].includes(run.status))throw safeError();
        const pair=await generateHpkeRecipient(); // ephemeral, held in guest memory only
        const id=randomUUID();
        const evidence=await quoteProvider({clientNonce,sessionId:id,sessionPublicKey:Buffer.from(pair.publicKey)});
        if(!evidence || !(typeof evidence.attestation==='string'||(typeof evidence.quote==='string'&&typeof evidence.vmConfig==='string')))
          throw safeError();
        const publicEvidence=typeof evidence.attestation==='string'?{attestation:evidence.attestation}:{quote:evidence.quote,eventLog:evidence.eventLog,vmConfig:evidence.vmConfig};
        sessions.set(id,{runId,tenantId,clientNonce:clientNonce.toString('hex'),pair,expiresAt:now()+TTL_MS,proven:false,proving:false,processing:false});
        return {sessionId:id,recipientId:pair.recipientId,recipientPublicKey:Buffer.from(pair.publicKey).toString('base64'),clientNonce:clientNonce.toString('hex'),evidence:publicEvidence,...(typeof evidence.rawQuote==='string'?{rawQuote:evidence.rawQuote}:{})};
      } catch {throw safeError()}
      finally {if(reserved)openings--}
    },
    async prove({sessionId,challengeEnvelope,tenantId,runId}) {
      try {
        const s=session(sessionId);
        if(tenantId!==s.tenantId||runId!==s.runId)throw safeError();
        if(s.proven||s.proving)throw safeError();
        s.proving=true; // one challenge verifier at a time, before await
        validateHpkeSourceEnvelope(challengeEnvelope,{tenantId:s.tenantId,runId:s.runId});
        if(challengeEnvelope.context.recipientId!==s.pair.recipientId)throw safeError();
        const plain=await openHpkeSource({recipientPrivateKey:s.pair.privateKey,expectedContext:challengeEnvelope.context,envelope:challengeEnvelope});
        if(plain.length!==32)throw safeError();
        const proof=createHash('sha256').update('drnib-proof-v1\0').update(Buffer.from(sessionId.replaceAll('-',''),'hex')).update(plain).digest('hex');
        s.proven=true;
        return {verified:true,recipientId:s.pair.recipientId,clientNonce:s.clientNonce,sessionId,challengeDigest:proof};
      } catch {throw safeError()}
    },
    async action({sessionId,sourceEnvelope,tenantId,runId}) {
      let s;
      try {
        s=session(sessionId);
        if(!s.proven||s.tenantId!==tenantId||s.runId!==runId||typeof runner.action!=='function')throw safeError();
        s.processing=true;
        const run=await getRun(runId);
        if(!isConfidentialRun(run)||run.id!==runId||run.userId!==tenantId||run.deletedAt!=null)throw safeError();
        const c=validateHpkeSourceEnvelope(sourceEnvelope,{tenantId,runId});
        if(c.recipientId!==s.pair.recipientId)throw safeError();
        return await runner.action({run,sessionId,sourceEnvelope,guestPrivateKey:s.pair.privateKey,guestPublicKey:s.pair.publicKey,model});
      } catch {throw safeError()}
      finally {if(s)sessions.delete(sessionId)}
    },
    execute(args){return executeJob(args,false)},
    executeFull(args){return executeJob(args,true)},
    close(sessionId){sessions.delete(sessionId)},
  };
}
