import {randomUUID} from 'node:crypto';
import {createPrivateGuestHttpServer} from './private-guest-http.js';
import {getPhalaSessionEvidence} from './phala-quote.js';
import {generateHpkeRecipient} from './source-hpke.js';
import {createGuestSessionManager} from './guest-session.js';
import {createPrivateDemoRunner,createCiphertextReportSink,createCiphertextReportReader} from './private-demo.js';
import {createPhalaAiPort,PRIVATE_USAGE} from './phala-ai-port.js';
import {createAciChannelFactory} from './phala-aci-adapter.js';
import {createGuestCapabilityAuthenticator,createInMemoryJtiConsumer} from './private-capability.js';
import {createPrivateExecuteJournal} from './private-execute-journal.js';
import {createPrivateSourceOnlySessionJob} from './private-plan-session.js';
import {createPrivateAiBudgetGate} from './private-ai-budget.js';

function required(env,key){const value=env[key];if(typeof value!=='string'||!value.trim())throw new Error(`Private guest configuration missing ${key}`);return value}
export function brokerPublicKeyPem(env){
  const encoded=env.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64;
  if(encoded!==undefined){
    if(typeof encoded!=='string'||encoded.length===0||encoded.length%4!==0||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new Error('Private broker public key unavailable');
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.toString('base64')!==encoded)throw new Error('Private broker public key unavailable');
    const pem=bytes.toString('utf8');
    if(!Buffer.from(pem,'utf8').equals(bytes)||
      !/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\n?$/.test(pem))
      throw new Error('Private broker public key unavailable');
    return pem;
  }
  return required(env,'PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM');
}
function positiveInteger(env,key){
  const raw=required(env,key);
  if(!/^[1-9][0-9]*$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error('Private budget configuration unavailable');
  return Number(raw);
}
function diagnosticFactory(quoteProvider=getPhalaSessionEvidence){
  let windowStart=Date.now(),count=0;
  return async nonce=>{
    if(Date.now()-windowStart>60000){windowStart=Date.now();count=0}
    if(++count>10)throw new Error('diagnostic rate limit');
    const pair=await generateHpkeRecipient(),sessionId=randomUUID();
    const quote=await quoteProvider({clientNonce:nonce,sessionId,sessionPublicKey:Buffer.from(pair.publicKey)});
    const evidence=quote.attestation?{attestation:quote.attestation}:{quote:quote.quote,eventLog:quote.eventLog,vmConfig:quote.vmConfig};
    return {diagnostic:true,sessionId,clientNonce:nonce.toString('hex'),recipientId:pair.recipientId,
      recipientPublicKey:Buffer.from(pair.publicKey).toString('base64'),evidence,...(quote.rawQuote?{rawQuote:quote.rawQuote}:{})};
  };
}

/** Build a separate measured CVM service, not the ordinary worker/server.
 * Diagnostic-only mode permits hardware verification without DB/AI secrets.
 * It cannot open an authenticated private job. */
export async function createPrivateGuestRuntime({env=process.env,quoteProvider=getPhalaSessionEvidence,connectAci}={}){
  if(env.DSTACK_SIMULATOR_ENDPOINT)throw new Error('Simulator is forbidden');
  const diagnosticEvidence=diagnosticFactory(quoteProvider);
  if(env.DRNIB_PRIVATE_DIAGNOSTIC_ONLY==='true'){
    const unavailable=async()=>{throw new Error('PRIVATE_DIAGNOSTIC_ONLY')};
    return createPrivateGuestHttpServer({sessions:{open:unavailable,prove:unavailable,execute:unavailable},authenticate:async()=>null,getReport:unavailable,diagnosticEvidence});
  }
  const databaseUrl=required(env,'DRNIB_DATABASE_URL');
  const publicKeyPem=brokerPublicKeyPem(env);
  const model=required(env,'PRIVATE_AI_APPROVED_MODEL');
  const baseURL=required(env,'PRIVATE_ACI_GATEWAY_BASE_URL');
  const apiKey=required(env,'PRIVATE_AI_API_KEY');
  const composeHash=required(env,'PRIVATE_ACI_COMPOSE_HASH');
  const sessionId=required(env,'PRIVATE_ACI_SESSION_ID');
  const fullRequested=env.DRNIB_PRIVATE_FULL_ENABLED==='true';
  const allowedTenantId=required(env,'DRNIB_PRIVATE_TEST_TENANT_ID');
  if(!/^[A-Za-z0-9:_-]{1,128}$/.test(allowedTenantId))throw new Error('Private test tenant unavailable');
  const monthlyAiCapMicroUsd=positiveInteger(env,'DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD');
  const monthlyInfraCeilingMicroUsd=positiveInteger(env,'DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD');
  const inputMicroUsdPerMillion=positiveInteger(env,'DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M');
  const outputMicroUsdPerMillion=positiveInteger(env,'DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M');
  const [{PrismaClient},{importSPKI}]=await Promise.all([import('@prisma/client'),import('jose')]);
  const db=new PrismaClient({datasourceUrl:databaseUrl});
  const publicKey=await importSPKI(publicKeyPem,'EdDSA');
  const connectVerified=createAciChannelFactory({baseURL,apiKey,expectedComposeHash:composeHash,acceptedSessionId:sessionId,connect:connectAci});
  try{
    await db.$connect();
    await import('../sources/parse.js'); // reject a missing measured parser dependency at boot
    if(typeof db.privateAiBudgetReservation?.create!=='function')throw new Error('Private budget schema unavailable');
    const budgetRows=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'PrivateAiBudgetReservation'))::text AS name`;
    if(!Array.isArray(budgetRows)||typeof budgetRows[0]?.name!=='string'||!budgetRows[0].name)
      throw new Error('Private budget migration missing');
    if(fullRequested){
      if(typeof db.privateWorkerObject?.create!=='function')throw new Error('Private worker schema unavailable');
      const rows=await db.$queryRaw`SELECT to_regclass(format('%I.%I',current_schema(),'PrivateWorkerObject'))::text AS name`;
      if(!Array.isArray(rows)||typeof rows[0]?.name!=='string'||!rows[0].name)throw new Error('Private worker migration missing');
    }
    const channel=await connectVerified();
    await channel.close(); // no inference request or paid tokens at readiness
  }catch{await db.$disconnect();throw new Error('Private guest dependencies unavailable')}
  // Keep the first synthetic source-only rehearsal small. The optional full
  // path is disabled by default and needs a separate limit review.
  const maxPromptBytesPerCall=8192;
  const maxOutputTokensPerCall=512;
  const aiPort=createPhalaAiPort({approvedModels:[model],acceptedSessionIds:[sessionId],connectVerified,
    maxPromptChars:maxPromptBytesPerCall,maxOutputTokens:maxOutputTokensPerCall});
  // The adapter already cryptographically verified each receipt and bound the
  // counters to the exact request/response body hashes. This hook re-checks the
  // shape + consistency of that authenticated usage before the budget gate
  // trusts it; a missing/mismatched value fails the gate closed.
  const verifySignedUsage=async(signedUsage,expected)=>{
    if(!signedUsage||typeof signedUsage!=='object'||signedUsage.model!==expected.model||
       signedUsage.callId!==expected.callId||signedUsage.requestDigest!==expected.requestDigest||
       typeof signedUsage.responseDigest!=='string'||! /^[0-9a-f]{64}$/.test(signedUsage.responseDigest)||
       !Number.isSafeInteger(signedUsage.inputTokens)||signedUsage.inputTokens<1||
       signedUsage.inputTokens>expected.maxInputTokens||
       !Number.isSafeInteger(signedUsage.outputTokens)||signedUsage.outputTokens<0||
       signedUsage.outputTokens>expected.maxOutputTokens)return null;
    return {verified:true,signed:true,model:signedUsage.model,callId:signedUsage.callId,
      requestDigest:signedUsage.requestDigest,inputTokens:signedUsage.inputTokens,outputTokens:signedUsage.outputTokens};
  };
  let budget;
  try{budget=createPrivateAiBudgetGate({db,ownerUserId:allowedTenantId,monthlyAiCapMicroUsd,
    monthlyInfraCeilingMicroUsd,verifySignedUsage,modelPriceCeilings:{[model]:{inputMicroUsdPerMillion,outputMicroUsdPerMillion}}});}
  catch{await db.$disconnect();throw new Error('Private budget configuration unavailable')}
  // Per-call authenticated usage sink. `meteredPort` appends each verified
  // call here so the finished job can report a trusted total to the broker.
  const meteredPort=usageSink=>infer=>Object.freeze({privateVerifiedTransport:'phala-aci-v1',
    infer:({model:requested,messages})=>{
      if(requested!==model)throw new Error('PRIVATE_AI_MODEL_UNAVAILABLE');
      return infer({messages,dispatch:async({model:fixed,messages:bounded,maxOutputTokens,callId,requestDigest})=>{
        if(fixed!==model||maxOutputTokens!==maxOutputTokensPerCall)throw new Error('PRIVATE_AI_MODEL_UNAVAILABLE');
        const value=await aiPort.infer({model:fixed,messages:bounded});
        const usage=value?.[PRIVATE_USAGE];
        if(!usage)return {value};
        const signedUsage={...usage,callId,requestDigest};
        usageSink.push(signedUsage);
        return {value,signedUsage};
      }});
    },
  });
  const attachUsage=(value,usageSink)=>{
    if(!value||typeof value!=='object'||value.encrypted!==true)return value;
    if(usageSink.length<1||usageSink.some(u=>!Number.isSafeInteger(u.costMicroUsd)||u.costMicroUsd<0))return value;
    const costMicroUsd=usageSink.reduce((sum,u)=>sum+u.costMicroUsd,0);
    return {...value,usage:Object.freeze({calls:usageSink.length,costMicroUsd,
      receipts:Object.freeze(usageSink.map(u=>Object.freeze({receiptId:u.receiptId??null,responseDigest:u.responseDigest,
        model:u.model,inputTokens:u.inputTokens,outputTokens:u.outputTokens,costMicroUsd:u.costMicroUsd})))})};
  };
  const paidJob=async(job,maxCalls,build)=>{
    const usageSink=[];
    const value=await budget.run({runId:job.run.id,tenantId:job.run.userId,model,
      maxCalls,maxPromptBytesPerCall,maxOutputTokensPerCall,
      execute:({infer})=>build(meteredPort(usageSink)(infer)).run(job)});
    return attachUsage(value,usageSink);
  };
  const runner={execute:job=>paidJob(job,1,port=>({run:item=>createPrivateDemoRunner({aiPort:port,
    reportSink:createCiphertextReportSink(db)}).execute(item)})),
    ...(fullRequested?{executeFull:job=>paidJob(job,3,port=>createPrivateSourceOnlySessionJob({db,aiPort:port,model}))}:{})};
  const withRunLock=(runId,action)=>db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
    return action(tx);
  },{maxWait:10000,timeout:15000});
  const executionJournal=createPrivateExecuteJournal({withRunLock});
  const sessions=createGuestSessionManager({getRun:id=>db.researchRun.findUnique({where:{id}}),runner,model,quoteProvider,executionJournal});
  const verifyCapability=createGuestCapabilityAuthenticator({publicKey,consumeJti:createInMemoryJtiConsumer()});
  const authenticate=async req=>{
    const identity=await verifyCapability(req);
    return identity?.tenantId===allowedTenantId?identity:null;
  };
  const getReport=createCiphertextReportReader(db);
  // Nonsecret, rate-limited, nonce-bound hardware attestation for reviewer
  // verification only. Off by default; the normal release keeps it disabled.
  const reviewAttestationEnabled=env.DRNIB_PRIVATE_REVIEW_ATTESTATION_ENABLED==='true';
  const server=createPrivateGuestHttpServer({sessions,authenticate,getReport,getJobStatus:executionJournal.status,
    ...(reviewAttestationEnabled?{diagnosticEvidence}:{}),
    privateReady:true,fullReady:fullRequested});
  server.on('close',()=>void db.$disconnect());
  return server;
}

if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const port=Number(process.env.PORT||3102);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Invalid guest port');
  createPrivateGuestRuntime().then(server=>server.listen(port,'0.0.0.0',()=>console.log('[dr-nib-private] guest ready')))
    .catch(()=>{console.error('[dr-nib-private] configuration or startup unavailable');process.exitCode=1});
}
