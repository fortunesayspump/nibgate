/** Public money metadata only. Durable terminal runs are the retry queue;
 * neither a browser reply nor the document worker is needed to refund. */
export function startPrivateSettlementReconciler({db,funding,tenantId,accessMode='owner',intervalMs=15000,onError=()=>{}}){
 if(!['owner','authenticated'].includes(accessMode)||!tenantId||!funding?.settle)throw Error('PRIVATE_RECONCILER_UNAVAILABLE');
 let stopped=false,timer,cursor;
 const tick=async()=>{
  try{
   const runs=await db.researchRun.findMany({where:{...(accessMode==='owner'?{userId:tenantId}:{}),deletedAt:null,settledAt:null,AND:[{metadata:{path:['privacyMode'],equals:'confidential'}}],OR:[{status:{in:['complete','ended','failed']}},{metadata:{path:['privateCancellation','reason'],equals:'owner-ended'}}],metadata:{path:['privateEscrow','jobId'],string_starts_with:''}},select:{id:true,userId:true,metadata:true},orderBy:{id:'asc'},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{})});
   cursor=runs.length===100?runs.at(-1).id:undefined;
   for(const run of runs){
    if(stopped)break;
    if(!run.metadata?.privateEscrow)continue;
    try{await funding.settle(run.id,{id:run.userId});}catch(error){onError('PRIVATE_SETTLEMENT_RETRY_PENDING',error);}
   }
  }catch{onError('PRIVATE_SETTLEMENT_SCAN_UNAVAILABLE');}
  finally{if(!stopped){timer=setTimeout(tick,intervalMs);timer.unref?.();}}
 };
 timer=setTimeout(tick,0);timer.unref?.();
 return ()=>{stopped=true;clearTimeout(timer);};
}
