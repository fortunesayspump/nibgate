/** Poll only lifecycle state. A request arriving during an idle shutdown must
 * wait for the confirmed stop, then request one fresh wake. Never retry a
 * quarantined/failed start or send inference from this helper. */
/** @param {{start:()=>Promise<{phase?:string}>, status:()=>Promise<{phase?:string}>, onPhase?:(phase:'starting'|'draining')=>void, now?:()=>number, wait?:(ms:number)=>Promise<void>, timeoutMs?:number}} options */
export async function pollPrivateWake({start,status,onPhase=()=>{},now=()=>Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=300000}){
 const deadline=now()+timeoutMs;let value=await start(),sawDraining=false,restarted=false;
 while(value.phase!=='ready'){
  if(now()>=deadline)throw Error('Private worker startup needs recovery. Your saved work and escrow are preserved.');
  if(value.phase==='stopped'&&sawDraining&&!restarted){restarted=true;value=await start();continue;}
  if(!['starting','draining'].includes(value.phase??''))throw Error('Private worker startup needs recovery. Your saved work and escrow are preserved.');
  if(value.phase==='draining')sawDraining=true;
  onPhase(value.phase);await wait(1000);value=await status();
 }
}
