/** Owner-only display derived from decrypted control intents. Never copy model
 * responses, keys or tool receipts into a steering message. */
export function privateGuidanceEvent(objectId:string,value:any,received=false){
 if(value?.format!=='drnib-control-v1'||value.command!=='guidance'||typeof value.text!=='string'||!value.text.trim()||value.text.length>8000)return null;
 if(!/^[0-9a-f-]{36}$/i.test(objectId)||!/^[0-9a-f-]{36}$/i.test(value.targetRequestId??''))return null;
 const at=typeof value.submittedAt==='string'&&Number.isFinite(Date.parse(value.submittedAt))?value.submittedAt:undefined;
 return {id:`private-guidance:${objectId}`,type:'guidance.queued',at,guidance:{text:value.text.trim()},delivery:received?'received':'queued',historyNoTimestamp:!at};
}

export function privateGuidanceConsumption(journal:any):string[]{
 if(journal?.format!=='drnib-checkpoint-v1'||!Array.isArray(journal.consumed)||journal.consumed.length>128)return [];
 return journal.consumed.filter((id:any)=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id));
}

export function mergeGuidanceEvents(events:any[],guidance:any[]){
 const byId=new Map(events.map(e=>[e.id??e,e]));
 for(const e of guidance)if(e){const prior=byId.get(e.id);byId.set(e.id,{...prior,...e,delivery:prior?.delivery==='received'?'received':e.delivery});}
 return [...byId.values()];
}
