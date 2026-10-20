export const PRIVATE_DISCUSSION_MAX=50;
/** Rehydrate the encrypted worker's paired messages for the existing UI. */
export function privateDiscussionShape(messages:unknown){
 const rows=Array.isArray(messages)?messages:[],used=Math.min(PRIVATE_DISCUSSION_MAX,Math.ceil(rows.length/2));
 const log:{q:string;a:string;model?:string;usage?:{costUsd:number;billingKind:string}}[]=[];
 for(let i=0;i+1<rows.length;i+=2){const q=rows[i],a=rows[i+1];if(q?.role==='user'&&a?.role==='assistant'&&typeof q.content==='string'&&typeof a.content==='string')log.push({q:q.content,a:a.content,...(typeof a.model==='string'?{model:a.model}:{}),...(typeof a.usage?.costUsd==='number'&&Number.isFinite(a.usage.costUsd)&&a.usage.costUsd>=0&&typeof a.usage.billingKind==='string'?{usage:{costUsd:a.usage.costUsd,billingKind:a.usage.billingKind}}:{})});}
 return {max:PRIVATE_DISCUSSION_MAX,used,remaining:Math.max(0,PRIVATE_DISCUSSION_MAX-used),log};
}
