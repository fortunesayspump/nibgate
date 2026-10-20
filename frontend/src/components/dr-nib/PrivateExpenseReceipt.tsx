import {summarizePrivateExpenses,printablePrivateReceipt,type PrintablePrivateReceipt} from '@/lib/dr-nib-expense-summary';
type ExpenseReceipt=PrintablePrivateReceipt&{format:'drnib-expense-receipt-v1'};

export function PrivateExpenseReceipt({receipt}:{receipt?:ExpenseReceipt}){
 if(receipt?.format!=='drnib-expense-receipt-v1')return null;
 const download=(printable=false)=>{
  const url=URL.createObjectURL(new Blob([printable?printablePrivateReceipt(receipt):JSON.stringify(receipt,null,2)],{type:printable?'text/html;charset=utf-8':'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`dr-nib-expenses-${receipt.runId}.${printable?'html':'json'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium">Expense breakdown</summary>
  <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><caption className="sr-only">Cumulative private research expenses in USD</caption><thead><tr><th className="py-2 pr-3">Model / tool</th><th className="text-right">Charged</th></tr></thead>
   <tbody>{summarizePrivateExpenses(receipt.lines).map(line=><tr key={line.id} className="border-t border-dark-gray/20"><td className="py-3 pr-3"><span className="break-words">{line.model}</span><span className="mt-1 block text-[10px] leading-4 opacity-60">{line.calls} calls · {Object.entries(line.statuses).map(([status,count])=>`${count} ${status.replaceAll('-',' ')}`).join(' · ')}</span>{line.tokenCalls?<span className="block text-[10px] leading-4 opacity-60">Tokens: {line.inputTokens} in / {line.outputTokens} out{line.tokenCalls<line.calls?` (${line.tokenCalls} calls with counts)`:''}</span>:null}</td><td className="py-3 text-right align-top"><span className="whitespace-nowrap">${line.chargedUsd}</span>{line.usageUsd!==null&&line.usageUsd!==line.chargedUsd?<span className="block text-[10px] leading-4 opacity-60">Recorded usage ${line.usageUsd}</span>:null}</td></tr>)}</tbody></table></div>
  <p className="mt-2 opacity-60">Cumulative totals per model and tool across this project. Download the receipt for every individual call.</p>
  <p className="mt-3 leading-5">{receipt.infrastructure.description} {receipt.tools.description}</p>
  <p className="mt-2 leading-5">Unresolved usage is not a bill. Pending usage has not been debited. Sponsored and platform-covered calls cost you $0. The platform share is included in the charged total.</p>
  {Number(receipt.totals.unitemizedChargedUsd)>0?<p className="mt-2">Other recorded ledger charges: ${receipt.totals.unitemizedChargedUsd}.</p>:null}
  <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>download()} className="rounded-lg border border-current px-3 py-2">Download expense receipt (JSON)</button>
  <button onClick={()=>download(true)} className="rounded-lg border border-current px-3 py-2">Download printable receipt (HTML)</button></div>
 </details>;
}
