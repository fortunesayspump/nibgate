import {requirePrivateFundingInputs} from './private-input-readiness.js';
import {assertGuestPlanningAction} from './guest-planning-policy.js';
import {createPrivateWorkClock} from './private-work-clock.js';
import {readPrivateTipBudget} from './private-run-budget.js';
import { createHmac } from 'node:crypto';
import { openHpkeSource, validateHpkeSourceEnvelope, recipientIdForPublicKey } from './source-hpke.js';
import { canonicalCiphertext } from './ciphertext-digest.js';
import { sealClientObject } from './client-object-crypto.js';
import { createPrivateActionStore } from './private-action-store.js';
import { privateActionFailure } from './private-action-failure.js';
import {readPrivateUsage} from './private-usage.js';
import {readPrivateFinancialReceipt} from './private-financial-receipt.js';
import {createPrivateCheckpoint,answerPrivateCheckpoint,PRIVATE_PAUSED,PRIVATE_AWAITING} from './private-checkpoint.js';
import {readPrivateExternalResult} from './private-external-receipt.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['intake', 'answers', 'answer','finish-intake', 'configure', 'edit-plan', 'guidance', 'pause', 'end', 'execute', 'resume', 'recover','revise', 'discuss', 'export', 'validate-plan']);
const publicStatusFor=status=>({intake:'draft','intake-done':'draft',draft:'draft',planned:'planned',paused:'paused',awaiting:'awaiting',ended:'ended',failed:'failed',running:'running',complete:'complete'})[status];
const fail = () => Error('PRIVATE_ACTION_UNAVAILABLE');
/** Only imported by the measured guest. A durable claim precedes model calls;
 * encrypted state and the replayable encrypted reply commit atomically. */
export function createPrivateActionRunner({ db, storage, workflow,allowHostedResearchFallback=false }) {
    if (!db || typeof workflow !== 'function')
        throw fail();
    return async ({ run, sessionId, sourceEnvelope, guestPrivateKey, guestPublicKey }) => {
        let plaintext, stateKey, store, claim, action,heartbeat,workClock,persistJournal;
        try {
            const context = validateHpkeSourceEnvelope(sourceEnvelope, { tenantId: run.userId, runId: run.id });
            if (context.recipientId !== recipientIdForPublicKey(guestPublicKey))
                throw fail();
            plaintext = await openHpkeSource({ recipientPrivateKey: guestPrivateKey, expectedContext: context, envelope: sourceEnvelope });
            const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
            if (!input || Object.keys(input).sort().join(',') !== 'action,args,requestId,sessionId,stateKeyBase64,vaultId' || input.sessionId !== sessionId ||
                !UUID.test(input.requestId) || context.objectId !== input.requestId || !UUID.test(input.vaultId) || !ACTIONS.has(input.action) ||
                !input.args || typeof input.args !== 'object' || Array.isArray(input.args) || typeof input.stateKeyBase64 !== 'string')
                throw fail();
            stateKey = Buffer.from(input.stateKeyBase64, 'base64');
            action=input.action;
            if (stateKey.length !== 32 || stateKey.toString('base64') !== input.stateKeyBase64)
                throw fail();
            store = createPrivateActionStore({ db, storage, stateKey, tenantId: run.userId, runId: run.id, vaultId: input.vaultId,allowCancelledExport:input.action==='export',allowHostedResearchFallback });
            // Authenticate the supplied key before reserving the one active action.
            const before = await store.load();
            assertGuestPlanningAction(before.run, input.action, before.value, input.args);
            if(before.value.id!==run.id||publicStatusFor(before.value.status)!==before.run.status)throw Error('PRIVATE_WORKFLOW_STATE_INVALID');
            if(input.action==='answer'&&(!before.value.privateCheckpoint||before.value.status!=='awaiting')){
                const prior=await store.receipt(input.requestId),digest=createHmac('sha256',stateKey).update(canonicalCiphertext({action:input.action,args:input.args,vaultId:input.vaultId})).digest('hex');
                if(prior?.status==='complete'&&prior.digest===digest)return {requestId:input.requestId,state:'complete',envelope:prior.reply};
                throw Error('PRIVATE_ANSWER_INVALID');
            }
            let journalValue,recover=input.action==='recover';
            // Setup and discussion also call paid providers. Journal their
            // results before final manifest commit, just like research, so a
            // lost final write cannot require purchasing the result again.
            const research=['intake','answers','finish-intake','configure','edit-plan','discuss','execute','resume','answer','revise','recover'].includes(input.action);
            let descriptor={requestId:input.requestId,action:input.action,args:input.args,manifestRevision:before.row.revision,manifestDigest:before.row.digest};
            if(recover){
                const receipt=await store.receipt(input.requestId);
                if(receipt?.status==='complete')return {requestId:input.requestId,state:'complete',envelope:receipt.reply};
                journalValue=await store.checkpoint(before.value.privateCheckpoint?.rootRequestId??input.requestId);
                descriptor=journalValue.current;
                if(descriptor?.requestId!==input.requestId||descriptor.manifestRevision!==before.row.revision||descriptor.manifestDigest!==before.row.digest)throw Error('PRIVATE_CHECKPOINT_UNCERTAIN');
                const unfinished=journalValue.entries?.find(e=>e.state!=='complete');
                // Only the store can prove a failed first inference admission
                // was never dispatched, under the admission and run locks.
                const initialAdmission=journalValue.entries?.length===1&&unfinished?.kind==='infer'&&unfinished.state==='started';
                const rejectedCandidate=allowHostedResearchFallback&&unfinished?.kind==='infer'&&unfinished.state==='started'&&unfinished===journalValue.entries.at(-1);
                if(unfinished&&!initialAdmission&&!rejectedCandidate){
                    const operation=['infer','judge','parse','code','terminal','owner-answer','public-retrieval'].includes(unfinished.kind)?unfinished.kind:'unknown';
                    const envelope=sealClientObject(stateKey,{tenantId:run.userId,runId:run.id,vaultId:input.vaultId,objectId:input.requestId,revision:1,purpose:'event'},Buffer.from(JSON.stringify({error:'PRIVATE_CHECKPOINT_UNCERTAIN',operation})));
                    return {requestId:input.requestId,state:'uncertain',envelope};
                }
            }else if(['resume','answer'].includes(input.action)&&before.value.privateCheckpoint){
                journalValue=await store.checkpoint(before.value.privateCheckpoint.rootRequestId);journalValue.current=descriptor;
                if(input.action==='answer'){
                    if(before.value.status!=='awaiting'||input.args.questionId!==before.value.pendingQuestion?.id)throw Error('PRIVATE_ANSWER_INVALID');
                    if(before.value.pendingQuestion.externalRequest&&input.args.optionId==='approve')await readPrivateExternalResult(db,run.id,{request:before.value.pendingQuestion.externalRequest,answer:input.args});
                    answerPrivateCheckpoint(journalValue,input.args);
                }
            }else if(research)journalValue={format:'drnib-checkpoint-v1',toolPolicyVersion:'direct-urls-first-v1',rootRequestId:input.requestId,initialAction:input.action,initialArgs:input.args,initialState:before.value,current:descriptor,entries:[],consumed:[]};
            if(journalValue&&(journalValue.format!=='drnib-checkpoint-v1'||journalValue.initialState?.id!==run.id||!UUID.test(journalValue.rootRequestId)||!Array.isArray(journalValue.entries)||Buffer.byteLength(JSON.stringify(journalValue))>1536*1024))throw Error('PRIVATE_CHECKPOINT_UNCERTAIN');
            const digest = createHmac('sha256', stateKey).update(canonicalCiphertext({ action: descriptor.action, args: descriptor.args, vaultId: input.vaultId })).digest('hex');
            claim = await store.claim({ requestId: input.requestId, digest, manifestId: before.row.id, manifestRevision: before.row.revision, action: input.action,...(journalValue&&!recover?{checkpoint:journalValue}:{}),recover,checkpointRoot:journalValue?.rootRequestId });
            if(claim.recovered)journalValue=claim.checkpoint;
            if (claim.status === 'complete')
                return { requestId: input.requestId, state: 'complete', envelope: claim.reply };
            if(claim.status==='failed')return {requestId:input.requestId,state:'failed',envelope:claim.reply};
            if (claim.existing)
                return { requestId: input.requestId, state: claim.status,...(claim.status==='uncertain'&&claim.reply?{envelope:claim.reply}:{}) };
            let lastProgress,journalTail=Promise.resolve();
            if(journalValue){
                if(['execute','resume','answer','revise'].includes(journalValue.initialAction))workClock=createPrivateWorkClock({prior:journalValue.activeWork??journalValue.initialState.activeWork});
                // Serialize heartbeat and operation saves. Snapshot at queue execution
                // so a delayed heartbeat cannot overwrite a newer completed entry.
                persistJournal=(value=journalValue)=>{const pending=journalTail.then(async()=>{if(workClock)value.activeWork=workClock.snapshot(false);await store.saveCheckpoint(journalValue.rootRequestId,structuredClone(value));});journalTail=pending.catch(()=>{});return pending;};
            }
            let renewing=false;
            heartbeat=setInterval(()=>{if(renewing)return;renewing=true;void(async()=>{
                await store.heartbeat();
                if(persistJournal)await persistJournal(journalValue);
                if(lastProgress&&workClock)await store.progress(claim.id,{...lastProgress,activeWork:workClock.snapshot()});
            })().catch(()=>{}).finally(()=>{renewing=false})},30000);heartbeat.unref?.();
            const sources = ['configure', 'execute', 'resume','answer', 'recover','revise','validate-plan'].includes(input.action) ? await store.sources() : [];
            assertGuestPlanningAction(before.run, input.action, before.value, input.args, sources);
            const financialReceipt=input.action==='export'?await readPrivateFinancialReceipt(db,run.id,run.userId):undefined;
            const checkpoint=journalValue?createPrivateCheckpoint({key:stateKey,value:journalValue,save:value=>persistJournal(value),fence:store.fence,controls:()=>store.controls(journalValue.rootRequestId)}):undefined;
            const recoveryNotes=(journalValue?.reconciliations??[]).filter(r=>r.kind==='operator-covered-interrupted-inference').map(r=>({type:'thinking',phase:'recovery',origin:'system',at:r.at,text:'A model response was lost during worker shutdown. Its unknown cost remains reserved for the operator, not charged to your escrow. Restoring completed work before a bounded model-only retry.'}));
            let result;
            if (['edit-plan','execute'].includes(input.action) && before.run.metadata?.guestAdoption) await requirePrivateFundingInputs(db, before.run);
            try{result = await workflow({ state: journalValue?.initialState??before.value, action: journalValue?.initialAction??input.action, args: journalValue?.initialArgs??input.args, sources, run:before.run, actionId: input.requestId,financialReceipt,checkpoint,readBudget:async()=>({...await readPrivateTipBudget(db,run.id,run.userId),remainingApprovals:Math.max(0,12-(checkpoint?.value.entries.filter(e=>e.kind==='owner-answer'&&e.question?.externalRequest).length??0))}),externalTool:input=>readPrivateExternalResult(db,run.id,input),
                onProgress: snapshot => {const events=[...recoveryNotes.filter(note=>!(snapshot.events??[]).some(e=>e.at===note.at&&e.text===note.text)),...(snapshot.events??[])];lastProgress={...snapshot,events,...(workClock?{activeWork:workClock.snapshot()}: {})};return store.progress(claim.id,lastProgress);} });}
            catch(error){
                if(![PRIVATE_PAUSED,PRIVATE_AWAITING].includes(error?.message)||!journalValue)throw error;
                const state=structuredClone(journalValue.initialState);state.status=error.message===PRIVATE_AWAITING?'awaiting':'paused';state.pauseReason=state.status==='awaiting'?'awaiting':'user';state.privateCheckpoint={rootRequestId:journalValue.rootRequestId};
                if(state.status==='awaiting')state.pendingQuestion=error.question;
                state.events=[...(state.events??[]),...(lastProgress?.events??[]),{type:'thinking',phase:'recovery',origin:'system',at:new Date().toISOString(),text:state.status==='awaiting'?'Waiting for your answer. Completed results are saved; no research continues while waiting.':'Paused at a saved operation boundary. Completed model and tool results will be restored without another charge.'}];
                const ids=new Set((state.decisions??[]).map(d=>d.id));state.decisions=[...(state.decisions??[]),...(lastProgress?.decisions??[]).filter(d=>!ids.has(d.id))];
                if(state.status==='awaiting')state.events.push({type:'awaiting',at:new Date().toISOString(),question:state.pendingQuestion});
                result={state,value:state};
            }
            clearInterval(heartbeat);
            if(workClock){result.state.activeWork=workClock.stop();await persistJournal(journalValue);}
            if(!['paused','awaiting'].includes(result.state.status)){delete result.state.privateCheckpoint;delete result.state.pendingQuestion;}
            result.state.aiUsage=await readPrivateUsage(db,run.id);
            result.state.spent = result.state.aiUsage.totalMicroUsd / 1000000;
            const reply = sealClientObject(stateKey, { tenantId: run.userId, runId: run.id, vaultId: input.vaultId, objectId: input.requestId, revision: 1, purpose: 'event' }, Buffer.from(JSON.stringify(result.value)));
            const publicStatus = publicStatusFor(result.state.status);
            if (!publicStatus)
                throw fail();
            await store.commit(before, result.state, { status: publicStatus, budgetCap:result.state.budgetCap,...(['configure','edit-plan','validate-plan'].includes(descriptor.action)?{fundingInputs:{webApproved:result.state.brief?.liveWeb===true&&(result.state.brief?.searchEnabled===false||result.state.brief?.publicResearch?.approved===true)}}:{}), receiptId: claim.id, reply, planningAction: descriptor.action });
            return { requestId: input.requestId, state: 'complete', envelope: reply };
        }
        catch (error) {
            clearInterval(heartbeat);
            if(workClock){workClock.stop();if(persistJournal)await persistJournal(undefined).catch(()=>{});}
            if (store && claim?.id && !claim.existing)
                await store.uncertain(claim.id, {...privateActionFailure(error),...(workClock?{activeWork:workClock.stop()}: {})},{terminalResearchFailure:['execute','resume','revise','answer','recover'].includes(action)}).catch(() => { });
            throw fail();
        }
        finally {
            clearInterval(heartbeat);
            plaintext?.fill(0);
            stateKey?.fill(0);
        }
    };
}
