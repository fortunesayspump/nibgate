import {createServer} from 'node:http';
import {validateHpkeReportEnvelope,recipientIdForPublicKey} from './source-hpke.js';

const MAX_BODY=5*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(res,status=503){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({code:'PRIVATE_GUEST_UNAVAILABLE'}))}
function send(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))}
async function body(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('oversize');chunks.push(chunk)}
  const out=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!out||typeof out!=='object'||Array.isArray(out))throw new Error('invalid');
  return out;
}
// Receipt-bound usage the guest attaches to a finished job so the broker can
// meter it. Shape is deliberately strict; anything else is rejected.
function validJobUsage(usage){
  if(!usage||typeof usage!=='object'||Array.isArray(usage)||
     Object.keys(usage).sort().join(',')!=='calls,costMicroUsd,receipts')return false;
  if(!Number.isSafeInteger(usage.calls)||usage.calls<1||usage.calls>4)return false;
  if(!Number.isSafeInteger(usage.costMicroUsd)||usage.costMicroUsd<0)return false;
  if(!Array.isArray(usage.receipts)||usage.receipts.length!==usage.calls)return false;
  return usage.receipts.every(r=>r&&typeof r==='object'&&!Array.isArray(r)&&
    Object.keys(r).sort().join(',')==='costMicroUsd,inputTokens,model,outputTokens,receiptId,responseDigest'&&
    (r.receiptId===null||(typeof r.receiptId==='string'&&r.receiptId.length<=160))&&
    typeof r.responseDigest==='string'&&/^[0-9a-f]{64}$/.test(r.responseDigest)&&
    typeof r.model==='string'&&Number.isSafeInteger(r.inputTokens)&&r.inputTokens>=0&&
    Number.isSafeInteger(r.outputTokens)&&r.outputTokens>=0&&
    Number.isSafeInteger(r.costMicroUsd)&&r.costMicroUsd>=0);
}

function publicSession(opened,nonce){
  const publicKey=Buffer.from(opened?.recipientPublicKey||'','base64');
  if(!UUID.test(opened?.sessionId)||opened.clientNonce!==nonce||
     publicKey.length!==65||publicKey.toString('base64')!==opened.recipientPublicKey||
     opened.recipientId!==recipientIdForPublicKey(publicKey)||
     !opened.evidence||!(
       (Object.keys(opened.evidence).join(',')==='attestation'&&typeof opened.evidence.attestation==='string'&&/^(?:[0-9a-f]{2})+$/i.test(opened.evidence.attestation))||
       (Object.keys(opened.evidence).sort().join(',')==='eventLog,quote,vmConfig'&&typeof opened.evidence.quote==='string'&&/^(?:[0-9a-f]{2})+$/i.test(opened.evidence.quote)&&typeof opened.evidence.eventLog==='string'&&typeof opened.evidence.vmConfig==='string'))||
     (opened.rawQuote!==undefined&&!(typeof opened.rawQuote==='string'&&/^(?:[0-9a-f]{2})+$/i.test(opened.rawQuote))))throw new Error('PRIVATE_GUEST_INVALID_PUBLIC_SESSION');
  return {sessionId:opened.sessionId,recipientId:opened.recipientId,recipientPublicKey:opened.recipientPublicKey,clientNonce:opened.clientNonce,evidence:opened.evidence,...(opened.rawQuote?{rawQuote:opened.rawQuote}:{})};
}

/** Measured guest endpoint contract. `authenticate` MUST validate a short-lived,
 * audience-bound broker capability; this module deliberately has no permissive
 * default. Nibgate cookies are not accepted by the CVM. Production wiring and
 * egress policy remain separate release gates. */
export function createPrivateGuestHttpServer({sessions,authenticate,getReport,getJobStatus,diagnosticEvidence,checkTools,privateReady=false,fullReady=false,workflowReady=false,guestPlanningReady=false}){
  if(typeof sessions?.open!=='function'||typeof sessions?.prove!=='function'||typeof sessions?.execute!=='function'||
     typeof authenticate!=='function'||typeof getReport!=='function')throw new Error('PRIVATE_GUEST_UNAVAILABLE');
  return createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://private-guest.invalid');
      if(url.pathname==='/health'&&req.method==='GET')return send(res,200,{ok:true,privateReady:privateReady===true,fullReady:fullReady===true,...(workflowReady?{workflowReady:true}:{}),...(guestPlanningReady?{guestPlanningReady:true}:{})});
      if(url.pathname==='/v1/private/attestation'&&req.method==='GET'){
        if(typeof diagnosticEvidence!=='function'||url.searchParams.size!==1||! /^[0-9a-f]{64}$/.test(url.searchParams.get('nonce')||''))return fail(res,400);
        const evidence=await diagnosticEvidence(Buffer.from(url.searchParams.get('nonce'),'hex'));
        if(!evidence||evidence.diagnostic!==true)return fail(res);
        return send(res,200,{diagnostic:true,...publicSession(evidence,url.searchParams.get('nonce'))});
      }
      const identity=await authenticate(req);
      if(!identity||typeof identity.tenantId!=='string'||!identity.tenantId||typeof identity.runId!=='string'||!identity.runId)
        return fail(res,401);
      if(req.method==='POST'&&url.pathname==='/v1/private/tools/check'){
        if(typeof checkTools!=='function'||url.searchParams.size)return fail(res,404);
        const data=await body(req);if(Object.keys(data).length)return fail(res,400);
        const result=await checkTools();if(!result||!(result.ready===false&&Object.keys(result).join(',')==='ready'||result.ready===true&&Object.keys(result).sort().join(',')==='checks,engine,modelCalls,paymentCalls,ready'&&result.engine==='gvisor'&&result.modelCalls===0&&result.paymentCalls===0&&JSON.stringify(result.checks)===JSON.stringify(['python-numpy-pandas-node','persisted-text-artifact','filesystem-environment-network-isolation','curl-python-https-cache-and-denied-path'])))return fail(res);
        return send(res,200,result);
      }
      if(req.method==='POST'&&url.pathname==='/v1/private/sessions'){
        const data=await body(req);
        if(Object.keys(data).sort().join(',')!=='clientNonce,runId'||data.runId!==identity.runId||
           typeof data.clientNonce!=='string'||! /^[0-9a-f]{64}$/.test(data.clientNonce))return fail(res,400);
        const opened=await sessions.open({tenantId:identity.tenantId,runId:identity.runId,clientNonce:Buffer.from(data.clientNonce,'hex')});
        return send(res,201,publicSession(opened,data.clientNonce));
      }
      const sessionPath=url.pathname.match(/^\/v1\/private\/sessions\/([0-9a-f-]{36})\/(prove|execute|full-execute|action)$/);
      if(req.method==='POST'&&sessionPath&&UUID.test(sessionPath[1])){
        const data=await body(req);
        if(sessionPath[2]==='prove'){
          if(Object.keys(data).join(',')!=='challengeEnvelope')return fail(res,400);
          const proof=await sessions.prove({sessionId:sessionPath[1],challengeEnvelope:data.challengeEnvelope,tenantId:identity.tenantId,runId:identity.runId});
          if(!proof||proof.verified!==true||proof.sessionId!==sessionPath[1]||
             typeof proof.recipientId!=='string'||! /^[0-9a-f]{64}$/.test(proof.recipientId)||
             typeof proof.clientNonce!=='string'||! /^[0-9a-f]{64}$/.test(proof.clientNonce)||
             typeof proof.challengeDigest!=='string'||! /^[0-9a-f]{64}$/.test(proof.challengeDigest))return fail(res);
          return send(res,200,{verified:true,recipientId:proof.recipientId,clientNonce:proof.clientNonce,sessionId:proof.sessionId,challengeDigest:proof.challengeDigest});
        }
        if(sessionPath[2]==='action'){
          if(!workflowReady||typeof sessions.action!=='function')return fail(res);
          if(Object.keys(data).join(',')!=='sourceEnvelope')return fail(res,400);
          const result=await sessions.action({sessionId:sessionPath[1],sourceEnvelope:data.sourceEnvelope,tenantId:identity.tenantId,runId:identity.runId});
          if(!result||!UUID.test(result.requestId)||!['complete','processing','uncertain','failed'].includes(result.state))return fail(res);
          if((['complete','failed'].includes(result.state)||result.state==='uncertain'&&result.envelope!==undefined)&&(!result.envelope||Object.keys(result).sort().join(',')!=='envelope,requestId,state'))return fail(res);
          return send(res,result.state==='complete'?200:202,result);
        }
        const full=sessionPath[2]==='full-execute';
        if(full&&(fullReady!==true||typeof sessions.executeFull!=='function'))return fail(res);
        if(Object.keys(data).sort().join(',')!==(full?'keyEnvelope,sourceEnvelope':'sourceEnvelope'))return fail(res,400);
        const args={sessionId:sessionPath[1],sourceEnvelope:data.sourceEnvelope,
          ...(full?{keyEnvelope:data.keyEnvelope}:{}),tenantId:identity.tenantId,runId:identity.runId};
        const job=await (full?sessions.executeFull(args):sessions.execute(args));
        if(job&&Object.keys(job).sort().join(',')==='runId,state'&&job.runId===identity.runId&&
           (job.state==='processing'||job.state==='uncertain'))return send(res,202,{state:job.state,runId:job.runId});
        if(!job||!['encrypted,id,version','encrypted,id,usage,version'].includes(Object.keys(job).sort().join(','))||
           job.encrypted!==true||job.version!==1||!UUID.test(job.id))return fail(res);
        if(job.usage!==undefined&&!validJobUsage(job.usage))return fail(res);
        return send(res,200,job);
      }
      const jobPath=url.pathname.match(/^\/v1\/private\/runs\/([0-9a-f-]{36})\/job$/);
      if(req.method==='GET'&&jobPath&&UUID.test(jobPath[1])){
        if(jobPath[1]!==identity.runId||url.searchParams.size||typeof getJobStatus!=='function')return fail(res,404);
        const status=await getJobStatus({tenantId:identity.tenantId,runId:identity.runId});
        if(!status||typeof status!=='object'||Array.isArray(status))return fail(res);
        if(status.state==='complete'&&Object.keys(status).sort().join(',')==='reportId,state'&&UUID.test(status.reportId))
          return send(res,200,{state:'complete',reportId:status.reportId});
        if(['not_started','processing','uncertain'].includes(status.state)&&Object.keys(status).join(',')==='state')
          return send(res,200,{state:status.state});
        return fail(res);
      }
      const reportPath=url.pathname.match(/^\/v1\/private\/reports\/([0-9a-f-]{36})$/);
      if(req.method==='GET'&&reportPath&&UUID.test(reportPath[1])){
        if(url.searchParams.size!==1||url.searchParams.get('runId')!==identity.runId)return fail(res,400);
        const envelope=await getReport({tenantId:identity.tenantId,runId:identity.runId,reportId:reportPath[1]});
        if(!envelope)return fail(res,404);
        validateHpkeReportEnvelope(envelope,{tenantId:identity.tenantId,runId:identity.runId});
        if(envelope.context.objectId!==reportPath[1])return fail(res);
        return send(res,200,envelope);
      }
      return fail(res,404);
    }catch(error){return fail(res,error?.code==='PRIVATE_JOB_CONFLICT'?409:503)}
  });
}
