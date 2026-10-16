import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {verifyPhalaRecipient} from './phala-verifier.js';
import {generateHpkeRecipient,openHpkeReport,recipientIdForPublicKey,sealHpkeSource,validateHpkeReportEnvelope} from './source-hpke.js';

function safeError(){const error=new Error('Confidential session unavailable');error.code='PRIVATE_CLIENT_UNAVAILABLE';return error}
function equalHex(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&/^[0-9a-f]+$/i.test(a)&&/^[0-9a-f]+$/i.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'))}

/** Client contract. In production this must run in independently pinned client
 * code, never in mutable operator-served JavaScript. The transport carries
 * ciphertext and attestation only. Fixture transport is for local tests. */
export function createPrivateClient({transport,verifyEvidence,policy}) {
  if(!transport?.open||!transport?.prove||!transport?.execute||!transport?.getReport||typeof verifyEvidence!=='function'||!policy)
    throw new Error('PRIVATE_CLIENT_UNAVAILABLE');
  const consumed=new Set();
  return {
    async run({tenantId,runId,question,title,sourceText}) {
      try {
        const clientNonce=randomBytes(32);
        const session=await transport.open({tenantId,runId,clientNonce});
        if(session.clientNonce!==clientNonce.toString('hex')||typeof session.recipientPublicKey!=='string')throw safeError();
        const guestPublicKey=Buffer.from(session.recipientPublicKey,'base64');
        if(guestPublicKey.toString('base64')!==session.recipientPublicKey||session.recipientId!==recipientIdForPublicKey(guestPublicKey))throw safeError();
        const possession=async({sessionId,clientNonce:nonce,recipientPublicKey,recipientId})=>{
          const challenge=randomBytes(32);
          const challengeEnvelope=await sealHpkeSource({recipientPublicKey,context:{tenantId,runId,objectId:randomUUID(),revision:1,purpose:'source',recipientId},plaintext:challenge});
          const proof=await transport.prove({sessionId,challengeEnvelope,tenantId,runId});
          const expected=createHash('sha256').update('drnib-proof-v1\0').update(Buffer.from(sessionId.replaceAll('-',''),'hex')).update(challenge).digest('hex');
          if(!equalHex(proof?.challengeDigest,expected))throw safeError();
          return {verified:true,recipientId,clientNonce:nonce.toString('hex'),sessionId};
        };
        await verifyPhalaRecipient({evidence:session.evidence,clientNonce,sessionId:session.sessionId,recipientPublicKey:guestPublicKey,
          expectedComposeHash:policy.expectedComposeHash,expectedOsHash:policy.expectedOsHash,
          expectedAppId:policy.expectedAppId,expectedInstanceId:policy.expectedInstanceId,
          expectedKeyProvider:policy.expectedKeyProvider,reviewedReleaseControls:policy.reviewedReleaseControls,
          verifyEvidence,verifyKeyPossession:possession,
          consumeNonce:async({sessionId,clientNonce:nonce})=>{
            const key=`${sessionId}:${nonce.toString('hex')}`;
            if(consumed.has(key))return false;
            consumed.add(key);
            return true;
          }});
        const browser=await generateHpkeRecipient();
        const sourceEnvelope=await sealHpkeSource({recipientPublicKey:guestPublicKey,
          context:{tenantId,runId,objectId:randomUUID(),revision:1,purpose:'source',recipientId:session.recipientId},
          plaintext:Buffer.from(JSON.stringify({question,title,sourceText,browserPublicKey:Buffer.from(browser.publicKey).toString('base64')}))});
        const job=await transport.execute({sessionId:session.sessionId,sourceEnvelope,tenantId,runId});
        if(!job?.encrypted||typeof job.id!=='string')throw safeError();
        const reportEnvelope=await transport.getReport({tenantId,runId,reportId:job.id});
        validateHpkeReportEnvelope(reportEnvelope,{tenantId,runId});
        if(reportEnvelope.context.objectId!==job.id||reportEnvelope.context.recipientId!==browser.recipientId)throw safeError();
        const plain=await openHpkeReport({recipientPrivateKey:browser.privateKey,expectedContext:reportEnvelope.context,envelope:reportEnvelope});
        const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
        if(!result||typeof result.markdown!=='string'||Object.keys(result).join(',')!=='markdown')throw safeError();
        return {id:job.id,markdown:result.markdown};
      }catch{throw safeError()}
    },
  };
}
