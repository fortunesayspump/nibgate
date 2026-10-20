// A failed serving check is not a successful inference receipt. Accept it only
// as proof that this exact request was refused before any upstream forwarding.
export const PRIVATE_ACI_REFUSAL=Symbol('nibgate.privateAciRefusal');
export const PRIVATE_ACI_FAILURE=Symbol('nibgate.privateAciFailure');
export function verifiedAciRefusal(audit,{receiptId,requestDigest,model,status}){
 if(status!==412||typeof receiptId!=='string'||!/^[A-Za-z0-9_:.-]{1,160}$/.test(receiptId)||
    audit?.receiptId!==receiptId||audit.exchange?.status!==status||audit.exchange?.responseComplete!==true||audit.exchange?.responseError||
    audit.receipt?.model!==model||audit.receipt?.receipt_id!==receiptId||
    !['receipt-1','receipt-2','receipt-3','receipt-4'].every(id=>audit.transcript?.lines?.some(l=>l.id===id&&l.status==='pass')))throw Error('PRIVATE_ACI_REFUSAL_UNVERIFIED');
 const events=audit.receipt.event_log;
 if(!Array.isArray(events)||events.some(e=>typeof e?.type!=='string'||e.type.includes('forward')||e.type==='upstream.verified'&&e.result!=='failed'))throw Error('PRIVATE_ACI_REFUSAL_UNVERIFIED');
 const requests=events.filter(e=>e.type==='request.received'),responses=events.filter(e=>e.type==='response.returned'),upstream=events.filter(e=>e.type==='upstream.verified');
 if(requests.length!==1||requests[0].body_hash!=='sha256:'+requestDigest||responses.length!==1||!/^sha256:[0-9a-f]{64}$/.test(responses[0].body_hash??'')||!upstream.length||upstream.some(e=>e.required!==true||e.result!=='failed'))throw Error('PRIVATE_ACI_REFUSAL_UNVERIFIED');
 return Object.freeze({format:'drnib-aci-refusal-v1',receiptId,requestDigest,responseDigest:responses[0].body_hash.slice(7),model,httpStatus:status,reason:'session_not_accepted',receipt:structuredClone(audit.receipt)});
}
