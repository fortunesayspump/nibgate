export type ExpenseLine={id:string;model:string;category?:string;status:string;chargedUsd:string;usageUsd:string|null;inputTokens?:number;outputTokens?:number};
const micros=(value:string)=>{if(!/^\d+\.\d{6}$/.test(value))throw Error('Invalid expense amount');return BigInt(value.replace('.',''));};
const dollars=(value:bigint)=>`${value/BigInt(1000000)}.${String(value%BigInt(1000000)).padStart(6,'0')}`;
/** Preserve per-call records for audit; display each exact model/tool once. */
export function summarizePrivateExpenses(lines:ExpenseLine[]){
 const groups=new Map<string,{id:string;model:string;calls:number;statuses:Record<string,number>;charged:bigint;usage:bigint;usageKnown:boolean;inputTokens:number;outputTokens:number;tokenCalls:number}>();
 for(const line of lines){
  const key=JSON.stringify([line.category??'ai',line.model]);
  const group=groups.get(key)??{id:key,model:line.model,calls:0,statuses:{},charged:BigInt(0),usage:BigInt(0),usageKnown:false,inputTokens:0,outputTokens:0,tokenCalls:0};
  group.calls++;group.statuses[line.status]=(group.statuses[line.status]??0)+1;group.charged+=micros(line.chargedUsd);
  if(line.usageUsd!==null){group.usage+=micros(line.usageUsd);group.usageKnown=true;}
  if(Number.isSafeInteger(line.inputTokens)&&Number.isSafeInteger(line.outputTokens)){group.inputTokens+=line.inputTokens!;group.outputTokens+=line.outputTokens!;group.tokenCalls++;}
  groups.set(key,group);
 }
 return [...groups.values()].map(({charged,usage,...group})=>({...group,chargedUsd:dollars(charged),usageUsd:group.usageKnown?dollars(usage):null}));
}

export type PrintablePrivateReceipt={runId:string;currency:string;settlement:string;receiptId?:string;generatedAt?:string;notice?:string;lines:ExpenseLine[];
 totals:{depositedUsd:string;chargedUsd:string;refundedUsd:string;balanceUsd:string;includedPlatformShareUsd:string;unitemizedChargedUsd:string};
 infrastructure:{description:string};tools:{description:string};proof?:{jobId:string;completeTx:string|null;splitTx:string|null;splitConfirmed:boolean}|null};
/** Local-only printable financial metadata. No prompts, report or upload data. */
export function printablePrivateReceipt(receipt:PrintablePrivateReceipt){
 const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const money=(value:string)=>'$'+escape(value);
 const rows=summarizePrivateExpenses(receipt.lines).map(row=>`<tr><td>${escape(row.model)}<small>${row.calls} calls · ${escape(Object.entries(row.statuses).map(([k,v])=>`${v} ${k}`).join(' · '))}</small></td><td>${money(row.chargedUsd)}</td><td>${row.usageUsd===null?'Unresolved':money(row.usageUsd)}</td></tr>`).join('');
 const totals=[['Deposited',receipt.totals.depositedUsd],['Charged',receipt.totals.chargedUsd],['Refunded',receipt.totals.refundedUsd],['Remaining balance',receipt.totals.balanceUsd],['Platform share (included in charged)',receipt.totals.includedPlatformShareUsd],['Other recorded ledger charges',receipt.totals.unitemizedChargedUsd]].map(([label,value])=>`<tr><th>${escape(label)}</th><td>${money(value)}</td></tr>`).join('');
 const proof=receipt.proof?`<h2>Settlement evidence</h2><p>Job ${escape(receipt.proof.jobId)} · ${receipt.proof.splitConfirmed?'Split confirmed':'Split not confirmed'}</p><p>Completion: ${escape(receipt.proof.completeTx??'Pending')}<br>Split/refund: ${escape(receipt.proof.splitTx??'Pending')}</p>`:'';
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Dr. Nib expense receipt</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#171717}h1{font-size:26px}h2{font-size:18px;margin-top:28px}table{width:100%;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px 8px;overflow-wrap:anywhere}small{display:block;color:#555}p{overflow-wrap:anywhere}@media print{body{margin:0;font-size:11px}tr{break-inside:avoid}}</style><h1>Dr. Nib expense receipt</h1><p>${escape(receipt.receiptId??receipt.runId)}<br>Project: ${escape(receipt.runId)}<br>${escape(receipt.generatedAt??'')} · ${escape(receipt.currency)} · Settlement ${escape(receipt.settlement)}</p><p>${escape(receipt.notice??'Owner-test expense receipt. Test escrow assets are not real USD payments. This is not a tax invoice.')}</p><h2>Cumulative model and tool expenses</h2><table><thead><tr><th>Model / tool</th><th>Charged</th><th>Recorded usage</th></tr></thead><tbody>${rows}</tbody></table><h2>Project totals</h2><table>${totals}</table><p>Recorded usage includes sponsored or pending amounts; it is not an additional charge. Unresolved attempts have not been debited. The platform share is included, not added again.</p><h2>Compute and tools</h2><p>${escape(receipt.infrastructure.description)} ${escape(receipt.tools.description)}</p>${proof}<p>Use your browser’s Print → Save as PDF to retain a printable copy. The JSON receipt preserves individual call records.</p></html>`;
}
