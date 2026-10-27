import {requireAdoptedGuestFunding} from './guest-planning-policy.js';
import {createHash} from 'node:crypto';
// Ciphertext metadata only. Shared by the guest and isolated money service.
export function privateSourceSetDigest(rows){
 return createHash('sha256').update(JSON.stringify(rows.map(r=>({id:r.id,digest:r.digest})).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
}
export async function requirePrivateFundingInputs(tx,run){
 requireAdoptedGuestFunding(run);
 const proof=run.metadata?.privateFundingInputs;
 if(!proof||proof.version!==1||proof.webApproved!==true&&proof.sourceCount<1)throw Error('PRIVATE_FUNDING_INPUTS_REQUIRED');
 const [manifest,sources]=await Promise.all([
  tx.privateClientObject.findFirst({where:{runId:run.id,kind:'manifest',removed:false},select:{digest:true}}),
  tx.privateClientObject.findMany({where:{runId:run.id,kind:'source',removed:false},select:{id:true,digest:true}}),
 ]);
 if(!manifest||manifest.digest!==proof.manifestDigest||sources.length!==proof.sourceCount||privateSourceSetDigest(sources)!==proof.sourceSetDigest)throw Error('PRIVATE_FUNDING_INPUTS_REQUIRED');
}
