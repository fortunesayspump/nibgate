import { randomUUID } from 'node:crypto';
import { PRIVATE_USAGE,PRIVATE_METERED_COST,PRIVATE_CALL_CHARGE,PRIVATE_NOT_DISPATCHED,PRIVATE_REFUSAL_EVIDENCE,PRIVATE_FAILURE_EVIDENCE,PRIVATE_RETRYABLE_REJECTION } from './phala-ai-port.js';
import {privateWorkflowProfile} from './private-workflow-profiles.js';
import {availablePrivateRunSpend} from './private-run-budget.js';
/** A reservation is durable before dispatch. Unknown outcomes stay reserved.
 * This caps software admission, not the provider's infrastructure bill. */
export function createPrivateWorkflowAi({ db, aiPort, model, monthlyCapMicroUsd, inputPricePerMillion, outputPricePerMillion, maxCalls = 48, maxOutputTokens = 16384, fundingRequired=false, hostedZdr=false, coverRejected429=false }) {
    if(typeof fundingRequired!=='boolean')throw Error('PRIVATE_WORKFLOW_BUDGET_INVALID');
    for (const n of [monthlyCapMicroUsd, inputPricePerMillion, outputPricePerMillion, maxCalls, maxOutputTokens])
        if (!Number.isSafeInteger(n) || n < 1)
            throw Error('PRIVATE_WORKFLOW_BUDGET_INVALID');
    if (typeof hostedZdr!=='boolean'||maxOutputTokens > 16384 || maxCalls > 64 || aiPort?.privateVerifiedTransport !== (hostedZdr?'openrouter-zdr-v1':'phala-aci-v1'))
        throw Error('PRIVATE_WORKFLOW_BUDGET_INVALID');
    return async ({ run, actionId, messages, json=false, stage='intake', temperature, maxTokens, budgetMicroUsd }) => {
        if(maxTokens!==undefined&&(!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>16384))throw Error('PRIVATE_WORKFLOW_INPUT_LIMIT');
        const profile=privateWorkflowProfile(stage,model);let outputLimit=Math.min(profile.maxTokens,maxOutputTokens,maxTokens??profile.maxTokens);
        const billingKind=fundingRequired?(['intake','thinking','plan','discuss'].includes(stage)?'platform':'customer'):'owner-test';
        if (temperature!==undefined&&(!Number.isFinite(temperature)||temperature<0||temperature>1)||typeof json!=='boolean'||!Array.isArray(messages) || messages.length > 100 || messages.some(m => typeof m?.content !== 'string') || Buffer.byteLength(JSON.stringify(messages)) > 150000)
            throw Error('PRIVATE_WORKFLOW_INPUT_LIMIT');
        const inputCeiling = 2 * Buffer.byteLength(JSON.stringify(messages)) + 110592;
        let reserved = (BigInt(inputCeiling) * BigInt(inputPricePerMillion) + BigInt(outputLimit) * BigInt(outputPricePerMillion) + 999999n) / 1000000n;
        const id = randomUUID(), monthKey = new Date().toISOString().slice(0, 7);
        try{await db.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT pg_advisory_xact_lock(648821, 1)::text AS locked`;
            const fresh = await tx.researchRun.findUnique({ where: { id: run.id } });
            if (fresh?.userId !== run.userId || fresh.deletedAt || fresh.metadata?.privacyMode !== 'confidential')
                throw Error('PRIVATE_WORKFLOW_OWNER_INVALID');
            // Shared across runs and worker restarts. Retain the original
            // uncertain call's hold; a cooldown never proves it was free.
            const limited=await tx.privateInferenceCall.findFirst({where:{model,status:{in:['reserved','rejected-held']},updatedAt:{gte:new Date(Date.now()-3600000)},usageEvidence:{path:['failure','httpStatus'],equals:429}},orderBy:{updatedAt:'desc'},select:{usageEvidence:true,updatedAt:true,status:true}});
            if(limited){
                const until=Date.parse(limited.usageEvidence?.failure?.retryNotBefore??'');
                const fallback=new Date(limited.updatedAt).getTime()+60000;
                if(Date.now()<(Number.isFinite(until)?Math.min(limited.status==='rejected-held'?Math.max(until,fallback):until,new Date(limited.updatedAt).getTime()+3600000):fallback))throw Error('PRIVATE_WORKFLOW_RATE_LIMITED');
            }
            if (await tx.privateInferenceCall.count({ where: { runId: run.id, actionId } }) >= maxCalls)
                throw Error('PRIVATE_WORKFLOW_CALL_LIMIT');
            if(await tx.privateInferenceCall.count({where:{runId:run.id,actionId,status:'reserved'}}))throw Error('PRIVATE_WORKFLOW_ACTION_UNCERTAIN');
            const fitOutput=(available,code)=>{
              if(available!==null&&reserved>available){
                const affordable=(available*1000000n-BigInt(inputCeiling)*BigInt(inputPricePerMillion))/BigInt(outputPricePerMillion);
                if(affordable<BigInt(Math.min(outputLimit,1024)))throw Error(code);
                outputLimit=Math.min(outputLimit,Number(affordable));
                reserved=(BigInt(inputCeiling)*BigInt(inputPricePerMillion)+BigInt(outputLimit)*BigInt(outputPricePerMillion)+999999n)/1000000n;
                if(reserved>available)throw Error(code);
              }
            };
            fitOutput(await availablePrivateRunSpend(tx,run.id,budgetMicroUsd,fundingRequired,billingKind,fresh),'PRIVATE_RUN_BUDGET_EXHAUSTED');
            const sum = await tx.privateInferenceCall.aggregate({ where: { monthKey }, _sum: { committedMicroUsd: true } });
            const old = await tx.privateAiBudgetReservation.aggregate({ where: { monthKey }, _sum: { committedMicroUsd: true } });
            // Both limits apply under the same admission lock. Retain the full
            // conservative input bound; shrink only unused output headroom.
            fitOutput(BigInt(monthlyCapMicroUsd)-BigInt(sum._sum.committedMicroUsd??0)-BigInt(old._sum.committedMicroUsd??0),'PRIVATE_WORKFLOW_CAP');
            await tx.privateInferenceCall.create({ data: { id, runId: run.id, actionId, model, billingKind, costBasis:'reservation', monthKey, reservedMicroUsd: reserved, committedMicroUsd: reserved, status: 'reserved' } });
        },{timeout:60000,maxWait:10000});}catch(error){
            if(['PRIVATE_RUN_BUDGET_EXHAUSTED','PRIVATE_WORKFLOW_CAP','PRIVATE_WORKFLOW_RATE_LIMITED'].includes(error?.message))Object.defineProperty(error,PRIVATE_NOT_DISPATCHED,{value:true});
            throw error;
        }
        let result;
        try {result=await aiPort.infer({ model, messages, json,reasoningEffort:profile.effort,temperature:temperature??profile.temperature,maxTokens:outputLimit });}
        catch(error){
            const failure=error?.[PRIVATE_FAILURE_EVIDENCE],refusalProofs=error?.[PRIVATE_REFUSAL_EVIDENCE];
            const rejected=coverRejected429===true&&error?.code==='PHALA_PRIVATE_AI_UNAVAILABLE'&&error.failureStage==='completion'&&error.privateCompletionReason==='PHALA_PRIVATE_AI_RATE_LIMITED'&&failure?.httpStatus===429;
            if(error?.[PRIVATE_NOT_DISPATCHED]===true||failure||refusalProofs?.length)await db.$transaction(async tx=>{
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(648821,1)::text AS locked`;
                await tx.privateInferenceCall.updateMany({where:{id,status:'reserved'},data:{
                  ...(error?.[PRIVATE_NOT_DISPATCHED]===true?{status:'not-dispatched',costBasis:'not-dispatched',committedMicroUsd:0n}:{}),
                  ...(rejected?{status:'rejected-held',billingKind:'platform',costBasis:'operator-reservation'}:{}),
                  ...((failure||refusalProofs?.length)?{usageEvidence:{format:'drnib-aci-failure-evidence-v1',...(failure?{failure}:{}),...(refusalProofs?.length?{refusalProofs}:{})}}:{})}});
            });
            if(rejected)Object.defineProperty(error,PRIVATE_RETRYABLE_REJECTION,{value:true});
            throw error;
        }
        const usage = result?.[PRIVATE_USAGE];
        if (!usage || usage.model !== model || (usage.costMicroUsd !== null && (!Number.isSafeInteger(usage.costMicroUsd) || usage.costMicroUsd < 0)) || !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0 || usage.inputTokens > inputCeiling || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0 || usage.outputTokens > outputLimit)
            throw Error('PRIVATE_WORKFLOW_USAGE_INVALID');
        const tokenCeiling = (BigInt(usage.inputTokens) * BigInt(inputPricePerMillion) + BigInt(usage.outputTokens) * BigInt(outputPricePerMillion) + 999999n) / 1000000n;
        if(usage.costMicroUsd===null)throw Error('PRIVATE_WORKFLOW_USAGE_UNPRICED');
        const actual=BigInt(usage.costMicroUsd);
        if(actual>tokenCeiling+1n)throw Error('PRIVATE_WORKFLOW_PRICE_OVERAGE');
        if (actual > reserved)
            throw Error('PRIVATE_WORKFLOW_PRICE_OVERAGE');
        const usageEvidence={format:'drnib-private-usage-v1',inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,costMicroUsd:Number(actual),
            ...(typeof usage.requestDigest==='string'&&/^[0-9a-f]{64}$/.test(usage.requestDigest)?{requestDigest:usage.requestDigest}:{}),
            ...(usage.refusalProofs?.length?{refusalProofs:usage.refusalProofs}:{}),
            ...(typeof usage.receiptId==='string'&&/^[A-Za-z0-9_:.-]{1,160}$/.test(usage.receiptId)?{receiptId:usage.receiptId}:{}),
            ...(typeof usage.responseDigest==='string'&&/^[0-9a-f]{64}$/.test(usage.responseDigest)?{responseDigest:usage.responseDigest}:{}),
            ...(typeof result.id==='string'&&/^[A-Za-z0-9_:.-]{1,200}$/.test(result.id)?{providerRequestId:result.id}:{})};
        if(hostedZdr)Object.assign(usageEvidence,{privacy:'hosted-provider-visible',provider:'Azure',source:'OpenRouter-ZDR'});
        await db.privateInferenceCall.update({ where: { id }, data: { status: hostedZdr?'accounted':'verified', costBasis:hostedZdr?'provider-reported':'receipt-reported',usageEvidence, committedMicroUsd: actual } });
        Object.defineProperty(result,PRIVATE_METERED_COST,{value:Number(actual),enumerable:false});
        Object.defineProperty(result,PRIVATE_CALL_CHARGE,{value:Object.freeze({callId:id,billingKind,costMicroUsd:Number(actual)}),enumerable:false});
        return result;
    };
}
