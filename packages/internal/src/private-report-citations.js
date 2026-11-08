// Some reasoning-model routes emit an implicit opening think token and put the
// closing token in content. Treat those protocol markers as a boundary, never
// as report prose. Code examples and already structured replies stay intact.
export function cleanPrivateModelOutput(content){
 if(typeof content!=='string')throw Error('PRIVATE_MODEL_OUTPUT_INVALID');
 const start=content.trimStart();
 if(/^[\[{]/.test(start))return content;
 let offset=0,lastClose=-1,unclosed=false;
 for(const [index,part] of content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).entries()){
  if(index%2===0)for(const match of part.matchAll(/<\/?think>/gi)){
   if(/^<\/think>$/i.test(match[0])){lastClose=offset+match.index+match[0].length;unclosed=false;}
   else unclosed=true;
  }
  offset+=part.length;
 }
 if(unclosed)throw Error('PRIVATE_MODEL_OUTPUT_INVALID');
 if(lastClose<0)return content;
 const answer=content.slice(lastClose).trim();
 if(!answer)throw Error('PRIVATE_MODEL_OUTPUT_INVALID');
 return answer;
}
// Presentation repair only: drop an invalid extra marker when the same citation
// cluster already contains a valid source. Never invent a replacement source.
export function cleanPrivateReportCitations(markdown,total){
 if(typeof markdown!=='string'||!Number.isSafeInteger(total)||total<0)throw Error('PRIVATE_REPORT_CITATION_INVALID');
 const invalid=new Set();
 const text=cleanPrivateModelOutput(markdown).split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part,index)=>{
  if(index%2)return part;
  const cleaned=part.replace(/\[\d+(?:\s*,\s*\d+)*\](?:[ \t,;]*\[\d+(?:\s*,\s*\d+)*\])*/g,(cluster,offset,input)=>{
   if(input[offset+cluster.length]==='(')return cluster;
   const ids=[...cluster.matchAll(/\d+/g)].map(m=>Number(m[0])),valid=ids.filter(n=>n>=1&&n<=total);
   return valid.length&&valid.length!==ids.length?'['+[...new Set(valid)].join(', ')+']':cluster;
  });
  for(const match of cleaned.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g))for(const id of match[1].split(',').map(Number))if(id<1||id>total)invalid.add(id);
  return cleaned;
 }).join('');
 return {markdown:text,invalid:[...invalid]};
}
