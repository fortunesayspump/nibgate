// Presentation repair only: drop an invalid extra marker when the same citation
// cluster already contains a valid source. Never invent a replacement source.
export function cleanPrivateReportCitations(markdown,total){
 if(typeof markdown!=='string'||!Number.isSafeInteger(total)||total<0)throw Error('PRIVATE_REPORT_CITATION_INVALID');
 const invalid=new Set();
 const text=markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part,index)=>{
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
