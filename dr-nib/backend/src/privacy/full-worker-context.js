import {isConfidentialRun} from './guard.js';

// This adapter is deliberately separate from worker.js until its entire call
// graph is ported. No ordinary Prisma, JEV, provider, tool or event imports.
const KINDS=new Set(['plan','search','fetch','data','score','review','write','verify','tips']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ERROR='PRIVATE_STAGE_FAILED';

function validRun(run,runId) {
  return isConfidentialRun(run) && run.id===runId && UUID.test(run.id) &&
    typeof run.userId==='string' && run.userId.length>0;
}
function required(port,methods) {
  if (!port || methods.some(name=>typeof port[name]!=='function')) throw new Error('PRIVATE_CONTEXT_UNAVAILABLE');
}

/** Port-only seam for migrating the existing stage order into the measured
 * guest. All methods are injected private implementations; this file performs
 * no persistence/network and is not yet called by the production worker. */
export function createFullWorkerPrivateContext({store,events,ai,judge,tools,billing}) {
  required(store,['loadRun','beginStage','finishStage','failStage']);
  required(events,['emitFixed']);
  required(ai,['generate','verify']);
  required(judge,['sourceBatch','choice']);
  required(tools,['run']);
  required(billing,['meter']);

  return Object.freeze({
    store,events,ai,judge,tools,billing,
    async stage(runId,kind,attempt,work) {
      if (!UUID.test(runId) || !KINDS.has(kind) || !Number.isSafeInteger(attempt) || attempt<1 || typeof work!=='function')
        throw new Error('PRIVATE_STAGE_INVALID');
      let lease;
      let finished=false;
      let run;
      try {
        run=await store.loadRun(runId);
        if (!validRun(run,runId)) throw new Error('PRIVATE_RUN_UNAVAILABLE');
        // beginStage must atomically recheck classification and owner inside
        // its transaction and return a sealed prior result on replay.
        const claim=await store.beginStage({run,kind,attempt});
        if (claim?.state==='done') return claim.output;
        if (claim?.state!=='claimed' || typeof claim.lease!=='string' || !claim.lease)
          throw new Error('PRIVATE_STAGE_UNAVAILABLE');
        lease=claim.lease;
        await events.emitFixed({runId,type:'step.started',kind});
        const output=await work({run,ai,judge,tools,billing,store});
        // finishStage seals the output before any ordinary persistence.
        await store.finishStage({run,kind,attempt,lease,output});
        finished=true;
        await events.emitFixed({runId,type:'step.finished',kind});
        return output;
      } catch {
        if (lease && !finished) {
          try { await store.failStage({run,runId,kind,attempt,lease,code:SAFE_ERROR}); } catch {}
          try { await events.emitFixed({runId,type:'step.failed',kind,code:SAFE_ERROR}); } catch {}
        }
        throw new Error(SAFE_ERROR);
      }
    },
  });
}
