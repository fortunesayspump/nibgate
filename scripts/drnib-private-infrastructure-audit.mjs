// Metadata-only accounting for the existing dedicated owner test guest.
import{execFile}from'node:child_process';import{promisify}from'node:util';import{readFile,writeFile,stat}from'node:fs/promises';import{createHash}from'node:crypto';
import{infrastructureBillingWindow,reconcileInfrastructureBilling}from'../dr-nib/tools/private-infrastructure-billing.mjs';
const output=process.argv[2],guardLog=process.argv[3],stopDir=process.argv[4];
if(!/^\/tmp\/drnib-[A-Za-z0-9_.-]+\.log$/.test(guardLog??'')||![4,5].includes(process.argv.length))throw Error('Supply the most recent /tmp/drnib-*.log guard explicitly');if(!/^\/tmp\/drnib-[A-Za-z0-9_.-]+\.json$/.test(output??''))throw Error('Supply a fresh /tmp/drnib-*.json audit output');
if(stopDir!==undefined&&!/^\/tmp\/drnib-[A-Za-z0-9_-]+$/.test(stopDir))throw Error('Supply the recorded dedicated stop directory');
const run=promisify(execFile),window=infrastructureBillingWindow(),id='cvm_YKRNRmKa',app='c6f58feeabbaba0570e18e75ad5c71bc18fce2af';
try{
 const results=await Promise.all([
  run('phala',['api',`/apps/${app}/usage`,'-f','start_date='+window.startDate,'-f','end_date='+window.endDate,'-f','limit=500','--json'],{timeout:25000,maxBuffer:4*1024*1024}),
  run('phala',['cvms','get',id,'--json'],{timeout:25000,maxBuffer:4*1024*1024}),
 ]);
 const response=JSON.parse(results[0].stdout),cvm=JSON.parse(results[1].stdout);
 const observations=(await readFile(guardLog,'utf8')).trim().split('\n').filter(x=>x.trimStart().startsWith('{')).map(x=>JSON.parse(x)).filter(x=>x.checkedAt),last=observations.at(-1);
 if(!last||!Number.isFinite(Date.parse(last.checkedAt))||!Number.isFinite(last.conservativeBoundUsd))throw Error('No valid guard observation');
 if(cvm.app_id!==app||cvm.instance_id!=='58b2a2753f34f581596829685c0062eeeed2d0e4')throw Error('Wrong dedicated guest');
 let stoppedObservation,stopEvidence;
 if(stopDir){
  const files=await Promise.all(['manual-stop.json','cvm-final-status.json'].map(async name=>{const path=stopDir+'/'+name;return {name,raw:await readFile(path,'utf8'),info:await stat(path)}}));
  const request=JSON.parse(files[0].raw),confirmation=JSON.parse(files[1].raw);
  for(const value of [request.cvm,confirmation])if(value?.id!==id||value.app_id!==app||value.instance_id!==cvm.instance_id||value.vm_uuid!==cvm.vm_uuid)throw Error('Stop observation identity mismatch');
  if(request.success!==true||!['stopping','stopped'].includes(request.cvm.status)||confirmation.status!=='stopped')throw Error('Unconfirmed stop');
  stoppedObservation={instanceId:cvm.vm_uuid,state:'stopped',requestedAt:files[0].info.mtime.toISOString(),observedAt:files[1].info.mtime.toISOString()};
  stopEvidence=files.map(f=>({file:f.name,sha256:createHash('sha256').update(f.raw).digest('hex'),recordedAt:f.info.mtime.toISOString()}));
 }
 const audit=reconcileInfrastructureBilling({response,instanceId:cvm.vm_uuid,cvmState:cvm.status,lastGuardAt:new Date(last.checkedAt).toISOString(),carriedMicroUsd:Math.ceil(last.conservativeBoundUsd*1000000),stoppedObservation});
 await writeFile(output,JSON.stringify({...audit,query:window,cvmState:cvm.status,providerRows:response.usage.length,approvedInfrastructureCapMicroUsd:1540000,...(stoppedObservation?{stoppedObservation,stopEvidence}: {})},null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(audit));
}catch{console.error('Infrastructure reconciliation unavailable; no prior reservation was released.');process.exitCode=1;}
