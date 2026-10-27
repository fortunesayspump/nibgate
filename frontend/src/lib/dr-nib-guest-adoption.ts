import { createPrivateProjectKeys, type PrivateVault } from './dr-nib-private-vault';
import { openPrivateObject, sealPrivateObject, type PrivateObjectContext, type PrivateObjectEnvelope } from './dr-nib-private-objects';
const canonical=(value:unknown):string=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
export async function guestCiphertextDigest(value:unknown){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
/** New tenant, vault, run, object and key material. Changing owner IDs on old
 * ciphertext or merely rewrapping the old key is intentionally insufficient. */
export async function reencryptGuestManifest(input:{sourceKey:Uint8Array;sourceContext:PrivateObjectContext;sourceEnvelope:PrivateObjectEnvelope;sourceDigest:string;targetVault:PrivateVault;targetRunId:string;manifestId?:string}){
  if(!input.sourceContext.tenantId.startsWith('guest:')||input.targetVault.tenantId.startsWith('guest:')||input.sourceContext.runId===input.targetRunId||!/^[0-9a-f]{64}$/.test(input.sourceDigest)||await guestCiphertextDigest(input.sourceEnvelope)!==input.sourceDigest)throw Error('Guest adoption source changed. Reload before saving it.');
  const plain=await openPrivateObject(input.sourceKey,input.sourceContext,input.sourceEnvelope);
  let manifest:Record<string,unknown>;
  try{manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));}finally{plain.fill(0);}
  if(manifest.id!==input.sourceContext.runId)throw Error('Guest manifest identity changed.');
  manifest.id=input.targetRunId;
  delete manifest.privateCheckpoint;
  const keys=await createPrivateProjectKeys(input.targetVault,input.targetRunId),manifestId=input.manifestId??crypto.randomUUID();
  try{
    const manifestEnvelope=await sealPrivateObject(keys.secrets.workerStateKey,{tenantId:input.targetVault.tenantId,vaultId:input.targetVault.vaultId,runId:input.targetRunId,objectId:manifestId,purpose:'manifest',revision:1},new TextEncoder().encode(JSON.stringify(manifest)));
    return {manifestId,manifestEnvelope,projectKeysEnvelope:keys.envelope};
  }finally{keys.secrets.workerStateKey.fill(0);keys.secrets.reportKeySeed.fill(0);}
}
