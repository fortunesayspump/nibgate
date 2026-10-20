/** Build display-only questions from the owner's decrypted journal. Never copy
 * tool results, model responses, payment proofs or keys into the chat history. */
export function formatDrNibAnswer(d:any):string{
 const a=d.answer;if(a==null)return '';
 const options=Array.isArray(d.question?.options)?d.question.options:[];
 const label=(id:string)=>options.find((o:any)=>o.id===id)?.label??id;
 const ids=Array.isArray(a.optionIds)?a.optionIds.map(label):[];
 if(typeof a.text==='string'&&a.text.trim())return [...ids,`"${a.text.trim()}"`].join(', ');
 if(typeof a.label==='string'&&a.label.trim())return a.label;
 if(ids.length)return ids.join(', ');
 if(typeof a.optionId==='string')return label(a.optionId);
 if(typeof a.picked==='string')return label(a.picked);
 if(Array.isArray(a.picked))return a.picked.map(label).join(', ');
 return typeof a==='string'?a:'';
}

export function privateJournalQuestions(journal:any){
 if(journal?.format!=='drnib-checkpoint-v1'||!Array.isArray(journal.entries)||journal.entries.length>128)throw Error('Invalid private question history.');
 return journal.entries.filter((entry:any)=>entry.kind==='owner-answer'&&entry.state==='complete'&&typeof entry.question?.id==='string'&&typeof entry.question?.prompt==='string').map((entry:any)=>{
  const q=entry.question,a=entry.result?.value;
  if(!a||typeof a!=='object')throw Error('Invalid saved owner answer.');
  return {id:`private-question:${q.id}`,kind:'question',step:'midrun',questionId:q.id,prompt:q.prompt,
   question:{id:q.id,prompt:q.prompt,options:Array.isArray(q.options)?q.options.map((o:any)=>({id:o.id,label:o.label})):[],...(q.externalRequest?{externalRequest:q.externalRequest}:{})},
   answer:{...(typeof a.text==='string'?{text:a.text}:{}),...(typeof a.optionId==='string'?{optionIds:[a.optionId]}:{}),...(typeof a.label==='string'?{label:a.label}:{})},historyNoTimestamp:true};
 });
}

export function mergePrivateQuestionHistory(decisions:any[],history:any[],events:any[]){
 const ids=new Set(decisions.map(d=>d.id));
 return [...decisions,...history.filter(d=>!ids.has(d.id)).map(d=>{
  const asked=events.find(e=>e.type==='awaiting'&&e.question?.id===d.questionId);
  const request=d.question.externalRequest;
  const tool=request&&events.find(e=>e.type==='tool.call'&&e.tool===request.tool&&(request.url?e.input?.url===request.url:e.input?.query===request.query));
  return {...d,createdAt:asked?.at??tool?.at,historyNoTimestamp:!asked?.at};
 })];
}
