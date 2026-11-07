import {parseJsonReply} from '../llm/provider.js';
import {PRIVATE_USAGE} from './phala-ai-port.js';

// Only structure and receipt-bound routing metadata enter the encrypted state.
// Never copy prompts, response text, arbitrary object keys or provider errors.
export function privateIntakeDiagnostic(result) {
 const choice=result?.choices?.[0],content=choice?.message?.content,usage=result?.[PRIVATE_USAGE];
 const model=typeof usage?.model==='string'&&/^[a-zA-Z0-9/_:.-]{3,120}$/.test(usage.model)?usage.model:'unknown';
 const diagnostic={model,route:usage?.privacy==='hosted-provider-visible'?'hosted':typeof usage?.receiptId==='string'&&typeof usage?.responseDigest==='string'?'receipt-verified':'unknown',finish:['stop','length','content_filter','tool_calls'].includes(choice?.finish_reason)?choice.finish_reason:'other',characters:typeof content==='string'?content.length:0,json:'invalid',questions:-1,choiceQuestions:0,usablePrompts:0,usableOptions:0};
 try {
  const data=parseJsonReply(content);diagnostic.json=Array.isArray(data)?'array':data&&typeof data==='object'?'object':'scalar';
  if(Array.isArray(data?.questions)){
   const qs=data.questions.slice(0,5);diagnostic.questions=data.questions.length;
   diagnostic.choiceQuestions=qs.filter(q=>['pick_one','pick_any'].includes(q?.type)).length;
   diagnostic.usablePrompts=qs.filter(q=>typeof q?.prompt==='string'&&q.prompt.trim().length>=12).length;
   diagnostic.usableOptions=qs.filter(q=>Array.isArray(q?.options)&&q.options.filter(o=>typeof o?.label==='string'&&o.label.trim().length>=2).length>=2).length;
  }
 }catch{}
 return diagnostic;
}
