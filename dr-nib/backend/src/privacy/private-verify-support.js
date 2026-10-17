import {
  PRIVATE_SUPPORT_MAX_PROMPT_BYTES,PRIVATE_SUPPORT_MAX_OUTPUT_TOKENS,
  privateSupportMessages,privateSupportOutput,privateSupportPassage,
  privateSupportProbability,privateSupportSelectedIndices,
} from './private-verify-support-core.js';

function denied(){const error=new Error('PRIVATE_SUPPORT_UNAVAILABLE');error.code='PRIVATE_SUPPORT_UNAVAILABLE';return error;}

/** Unpublished follow-on to the sealed extraction checkpoint. The only paid
 * path is an independently budgeted, approved measured AI port. A support
 * probability is model-scored evidence, not an ordinary JEV verdict or a
 * whole-report verification badge. The current source-only guest completes
 * before this stage and must not call this runner. */
export function createPrivateVerifySupportRunner({supportStore,aiPort,budget,model}={}){
  if(typeof supportStore?.loadRun!=='function'||typeof supportStore?.begin!=='function'||
     typeof supportStore?.assertFresh!=='function'||typeof supportStore?.finish!=='function'||
     typeof supportStore?.fail!=='function'||typeof supportStore?.commitClaims!=='function'||
     typeof aiPort?.infer!=='function'||aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof budget?.run!=='function'||typeof model!=='string'||!model)throw denied();
  return Object.freeze({
    async run(runId){
      let run,lease,checkpointed=false;
      try{
        run=await supportStore.loadRun(runId);
        const claim=await supportStore.begin(run);
        if(claim?.state==='done')return await supportStore.commitClaims(run);
        if(claim?.state!=='claimed'||typeof claim.lease!=='string'||!claim.snapshot)throw denied();
        lease=claim.lease;
        const {snapshotDigest,source,report,extraction}=claim.snapshot;
        const selected=privateSupportSelectedIndices(extraction,source,report);
        const probabilities=[];
        if(selected.length){
          await budget.run({runId:run.id,tenantId:run.userId,model,maxCalls:selected.length,
            maxPromptBytesPerCall:PRIVATE_SUPPORT_MAX_PROMPT_BYTES,
            maxOutputTokensPerCall:PRIVATE_SUPPORT_MAX_OUTPUT_TOKENS,
            execute:async({infer})=>{
              if(typeof infer!=='function')throw denied();
              for(const index of selected){
                // Paid calls are separated by a fresh sealed snapshot read.
                // If anything changed during an earlier call, stop before
                // dispatching another. The final recheck also precedes the
                // durable checkpoint and atomic claim commit.
                await supportStore.assertFresh(run,snapshotDigest);
                const passage=privateSupportPassage(source,report,extraction.claims[index]);
                if(!passage)throw denied();
                const messages=privateSupportMessages(extraction.claims[index],passage);
                const response=await infer({messages,dispatch:async bounded=>{
                  if(bounded?.model!==model||bounded.maxOutputTokens!==PRIVATE_SUPPORT_MAX_OUTPUT_TOKENS||
                     !Array.isArray(bounded.messages))throw denied();
                  return {value:await aiPort.infer({model:bounded.model,messages:bounded.messages})};
                }});
                probabilities.push({index,probability:privateSupportProbability(response)});
              }
            },
          });
        }
        await supportStore.assertFresh(run,snapshotDigest);
        const output=privateSupportOutput({snapshotDigest,source,report,extraction,probabilities});
        await supportStore.finish(run,{lease,output});
        checkpointed=true;
        return await supportStore.commitClaims(run);
      }catch{
        // Once the encrypted model output is durably checkpointed, a failed
        // claim transaction may replay from that checkpoint with no new AI.
        // Before the checkpoint, any failed/uncertain call is never retried.
        if(lease&&!checkpointed){try{await supportStore.fail(run,{lease});}catch{}}
        throw denied();
      }
    },
  });
}
