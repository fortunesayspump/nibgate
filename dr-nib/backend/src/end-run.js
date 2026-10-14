import {withRunLock} from './run-lock.js';
import {recordEvent} from './eventlog.js';
import {settle} from './money.js';

export async function endRun(runId) {
  const active=await withRunLock(runId,async tx=>{
    const run=await tx.researchRun.findUniqueOrThrow({where:{id:runId}});
    if(['ended','complete'].includes(run.status))throw Object.assign(new Error(`run is already ${run.status}`),{status:409});
    await tx.researchRun.update({where:{id:runId},data:{status:'ended',endedAt:new Date(),pauseReason:'user',pendingQuestion:null}});
    return tx.researchStep.count({where:{runId,status:'active'}});
  });
  await recordEvent(runId,{type:'status',status:'ended',pauseReason:'user'});
  if(active)return {id:runId,status:'ended',pending:true,note:'Stopping after the current stage; its cost is recorded before refunding.'};
  const money=await settle(runId,'ended');
  const {settleEscrowRun}=await import('./escrow/settle.js');
  await settleEscrowRun(runId,'ended');
  return {id:runId,status:'ended',...money};
}
