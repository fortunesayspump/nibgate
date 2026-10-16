import {createHash} from 'node:crypto';
import {isConfidentialRun} from './guard.js';

// Micro-USD and integer arithmetic avoid floating-point admission errors.
const MILLION=1_000_000n;
const TOTAL_MONTHLY_CEILING=5_000_000n;
const MAX_CALLS=3;
const MAX_PROMPT_BYTES=150_000;
const MAX_OUTPUT_TOKENS=1_200;
const MAX_MESSAGES=100;

function fail(code='PRIVATE_AI_BUDGET_UNAVAILABLE'){
  const error=new Error(code);error.code=code;return error;
}
function integer(value,name,{min=0,max=Number.MAX_SAFE_INTEGER}={}){
  if(!Number.isSafeInteger(value)||value<min||value>max)throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
  return value;
}
function micro(value,name,{min=0n,max=TOTAL_MONTHLY_CEILING}={}){
  try{
    if(typeof value==='bigint'&&value>=min&&value<=max)return value;
    if(typeof value==='number'&&Number.isSafeInteger(value)&&BigInt(value)>=min&&BigInt(value)<=max)return BigInt(value);
    if(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)>=min&&BigInt(value)<=max)return BigInt(value);
  }catch{}
  throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
}
function monthKey(date){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw fail();
  return date.toISOString().slice(0,7);
}
function ceilDiv(a,b){return (a+b-1n)/b}
function priceOf(tokens,microUsdPerMillion){return ceilDiv(BigInt(tokens)*microUsdPerMillion,MILLION)}

/**
 * Provider prompt tokenization and protocol overhead are not independently
 * bounded by this estimate. The 2x UTF-8 byte allowance plus fixed protocol
 * reserve is deliberately conservative; a signed overage is an incident,
 * never a reason to dispatch another call. See budget docs for the remaining
 * provider-side hard-cap limitation.
 */
export function promptTokenCeiling(maxPromptBytesPerCall){
  integer(maxPromptBytesPerCall,'maxPromptBytesPerCall',{min:1,max:MAX_PROMPT_BYTES});
  return maxPromptBytesPerCall*2+MAX_MESSAGES*1024+8192;
}

export function estimatePrivateAiReservation({maxCalls,maxPromptBytesPerCall,maxOutputTokensPerCall,price}){
  integer(maxCalls,'maxCalls',{min:1,max:MAX_CALLS});
  integer(maxOutputTokensPerCall,'maxOutputTokensPerCall',{min:1,max:MAX_OUTPUT_TOKENS});
  const inputTokens=promptTokenCeiling(maxPromptBytesPerCall);
  const input=priceOf(inputTokens,price.inputMicroUsdPerMillion);
  const output=priceOf(maxOutputTokensPerCall,price.outputMicroUsdPerMillion);
  return BigInt(maxCalls)*(input+output);
}

function validatedPrices(modelPriceCeilings){
  if(!modelPriceCeilings||typeof modelPriceCeilings!=='object'||Array.isArray(modelPriceCeilings)||
     Object.keys(modelPriceCeilings).length<1)throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
  const prices=new Map();
  for(const [model,p] of Object.entries(modelPriceCeilings)){
    if(!/^[a-zA-Z0-9/_:.-]{3,120}$/.test(model)||!p||typeof p!=='object'||Array.isArray(p)||
      Object.keys(p).sort().join(',')!=='inputMicroUsdPerMillion,outputMicroUsdPerMillion')
      throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
    prices.set(model,Object.freeze({
      inputMicroUsdPerMillion:micro(p.inputMicroUsdPerMillion,'input price',{min:1n,max:1_000_000_000n}),
      outputMicroUsdPerMillion:micro(p.outputMicroUsdPerMillion,'output price',{min:1n,max:1_000_000_000n}),
    }));
  }
  return prices;
}

function digestRequest({model,messages,maxOutputTokens,callId}){
  return createHash('sha256').update(JSON.stringify({model,messages,maxOutputTokens,callId}),'utf8').digest('hex');
}

function validatedMessages(messages,maxPromptBytesPerCall){
  if(!Array.isArray(messages)||messages.length<1||messages.length>MAX_MESSAGES||
    messages.some(m=>!m||typeof m!=='object'||Array.isArray(m)||
      Object.keys(m).sort().join(',')!=='content,role'||
      !['system','user','assistant'].includes(m.role)||typeof m.content!=='string'))throw fail('PRIVATE_AI_REQUEST_OUT_OF_BOUNDS');
  const copy=messages.map(m=>Object.freeze({role:m.role,content:m.content}));
  const bytes=Buffer.byteLength(JSON.stringify(copy),'utf8');
  if(bytes>maxPromptBytesPerCall)throw fail('PRIVATE_AI_REQUEST_OUT_OF_BOUNDS');
  return {messages:Object.freeze(copy),bytes};
}

/** Global PostgreSQL reservation ledger. A transaction-scoped global advisory
 * lock serializes all monthly cap admissions across workers/processes. */
export function createPostgresPrivateAiBudgetLedger(db){
  if(typeof db?.$transaction!=='function')throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
  const locked=action=>db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821, 1)::text AS locked`;
    return action(tx);
  },{maxWait:10_000,timeout:20_000});
  return Object.freeze({
    async reserve({runId,tenantId,ownerUserId,month,model,maxCalls,maxPromptBytesPerCall,maxOutputTokensPerCall,amount,monthlyAiCapMicroUsd}){
      return locked(async tx=>{
        const run=await tx.researchRun.findUnique({where:{id:runId},select:{userId:true,deletedAt:true,metadata:true}});
        if(!run||run.deletedAt||run.userId!==tenantId||tenantId!==ownerUserId||!isConfidentialRun(run))throw fail('PRIVATE_AI_OWNER_ONLY');
        if(await tx.privateAiBudgetReservation.findUnique({where:{runId},select:{id:true}}))throw fail('PRIVATE_AI_ALREADY_RESERVED');
        const sum=await tx.privateAiBudgetReservation.aggregate({where:{monthKey:month},_sum:{committedMicroUsd:true}});
        const spent=BigInt(sum?._sum?.committedMicroUsd??0);
        if(spent<0n||spent>monthlyAiCapMicroUsd||amount>monthlyAiCapMicroUsd-spent)throw fail('PRIVATE_AI_MONTHLY_CAP');
        await tx.privateAiBudgetReservation.create({data:{runId,tenantId,monthKey:month,model,maxCalls,
          maxPromptBytesPerCall,maxOutputTokensPerCall,reservedMicroUsd:amount,committedMicroUsd:amount,status:'reserved'}});
        return {month,amount};
      });
    },
    async finalize({runId,amount,status,verifiedCalls}){
      return locked(async tx=>{
        const row=await tx.privateAiBudgetReservation.findUnique({where:{runId}});
        if(!row||row.status!=='reserved'||amount<0n||amount>BigInt(row.reservedMicroUsd)||
          !['settled','uncertain'].includes(status)||!Number.isSafeInteger(verifiedCalls)||verifiedCalls<0||verifiedCalls>row.maxCalls)
          throw fail();
        if(status==='uncertain'&&amount!==BigInt(row.reservedMicroUsd))throw fail();
        await tx.privateAiBudgetReservation.update({where:{runId},data:{committedMicroUsd:amount,status,verifiedCalls,finishedAt:new Date()}});
      });
    },
  });
}

/**
 * The only permitted owner-live-test dispatch wrapper. It reserves the entire
 * <=3-call envelope before execute() can invoke infer(). Missing signed usage
 * is charged at the full reservation; unverified or mismatched signed usage
 * fails closed. The verifier must cryptographically validate the provider's
 * signed counters and bind them to this exact call and request, not result.usage.
 */
export function createPrivateAiBudgetGate({db,ledger,ownerUserId,monthlyAiCapMicroUsd,
  monthlyInfraCeilingMicroUsd,modelPriceCeilings,verifySignedUsage,clock=()=>new Date()}={}){
  const store=ledger??createPostgresPrivateAiBudgetLedger(db);
  if(typeof store.reserve!=='function'||typeof store.finalize!=='function'||
    typeof ownerUserId!=='string'||!ownerUserId||typeof clock!=='function')throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
  const aiCap=micro(monthlyAiCapMicroUsd,'AI cap',{min:1n,max:TOTAL_MONTHLY_CEILING-1n});
  const infraCeiling=micro(monthlyInfraCeilingMicroUsd,'infra ceiling',{min:1n,max:TOTAL_MONTHLY_CEILING-1n});
  if(aiCap+infraCeiling>TOTAL_MONTHLY_CEILING)throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');
  const prices=validatedPrices(modelPriceCeilings);
  if(verifySignedUsage!==undefined&&typeof verifySignedUsage!=='function')throw fail('PRIVATE_AI_BUDGET_CONFIG_INVALID');

  return Object.freeze({
    async run({runId,tenantId,model,maxCalls,maxPromptBytesPerCall,maxOutputTokensPerCall,execute}){
      if(typeof runId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId)||
        typeof tenantId!=='string'||!tenantId||tenantId!==ownerUserId||typeof execute!=='function')throw fail('PRIVATE_AI_OWNER_ONLY');
      const price=prices.get(model);
      if(!price)throw fail('PRIVATE_AI_PRICE_UNKNOWN');
      const amount=estimatePrivateAiReservation({maxCalls,maxPromptBytesPerCall,maxOutputTokensPerCall,price});
      const month=monthKey(clock());
      try{await store.reserve({runId,tenantId,ownerUserId,month,model,maxCalls,maxPromptBytesPerCall,maxOutputTokensPerCall,amount,monthlyAiCapMicroUsd:aiCap})}
      catch(error){if(['PRIVATE_AI_OWNER_ONLY','PRIVATE_AI_ALREADY_RESERVED','PRIVATE_AI_MONTHLY_CAP'].includes(error?.code))throw fail(error.code);throw fail()}

      let called=0;
      let active=true;
      const signedCosts=[];
      let result;
      try{
        const infer=async({messages,dispatch})=>{
          if(!active||typeof dispatch!=='function'||called>=maxCalls||monthKey(clock())!==month)throw fail('PRIVATE_AI_REQUEST_OUT_OF_BOUNDS');
          const bounded=validatedMessages(messages,maxPromptBytesPerCall);
          const index=called++;
          const callId=`${runId}:${index}`;
          const requestDigest=digestRequest({model,messages:bounded.messages,maxOutputTokens:maxOutputTokensPerCall,callId});
          // The underlying port must use exactly these fixed arguments and its
          // own verified transport. No caller-controlled model/token increase.
          const response=await dispatch(Object.freeze({model,messages:bounded.messages,maxOutputTokens:maxOutputTokensPerCall,callIndex:index,callId,requestDigest}));
          if(!response||typeof response!=='object'||!Object.prototype.hasOwnProperty.call(response,'value'))throw fail();
          if(response.signedUsage!==undefined&&response.signedUsage!==null){
            if(!verifySignedUsage)throw fail('PRIVATE_AI_USAGE_INVALID');
            const usage=await verifySignedUsage(response.signedUsage,Object.freeze({model,callId,requestDigest,
              maxInputTokens:promptTokenCeiling(maxPromptBytesPerCall),maxOutputTokens:maxOutputTokensPerCall}));
            if(!usage||usage.verified!==true||usage.signed!==true||usage.model!==model||usage.callId!==callId||
              usage.requestDigest!==requestDigest||!Number.isSafeInteger(usage.inputTokens)||usage.inputTokens<1||
              usage.inputTokens>promptTokenCeiling(maxPromptBytesPerCall)||!Number.isSafeInteger(usage.outputTokens)||
              usage.outputTokens<0||usage.outputTokens>maxOutputTokensPerCall)throw fail('PRIVATE_AI_USAGE_INVALID');
            signedCosts[index]=priceOf(usage.inputTokens,price.inputMicroUsdPerMillion)+priceOf(usage.outputTokens,price.outputMicroUsdPerMillion);
          }
          return response.value;
        };
        result=await execute(Object.freeze({infer}));
      }catch{
        active=false;
        try{await store.finalize({runId,amount,status:'uncertain',verifiedCalls:signedCosts.filter(v=>v!==undefined).length})}catch{}
        throw fail('PRIVATE_AI_UNAVAILABLE');
      }
      active=false;
      const allSigned=called>0&&Array.from({length:called},(_,i)=>signedCosts[i]).every(v=>v!==undefined);
      const committed=allSigned?signedCosts.reduce((a,b)=>a+b,0n):amount;
      try{await store.finalize({runId,amount:committed,status:'settled',verifiedCalls:allSigned?called:0})}
      catch{throw fail()}
      return result;
    },
  });
}
