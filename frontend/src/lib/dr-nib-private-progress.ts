// Replayed checkpoint observations get fresh presentation timestamps/IDs.
// Match the saved prefix; additional calls and changed results stay visible.
function identity(row:any,decision=false){
 const clean=Object.fromEntries(Object.entries(row).filter(([k])=>!['id','at','createdAt',...(decision?['question']:[])].includes(k)));
 const canonical=(v:any):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
 return canonical(clean);
}
export function mergePrivateProgressRows(saved:any[],incoming:any[],resuming:boolean,decision=false){
 const ids=new Set(saved.map(r=>r.id).filter(Boolean));
 if(!resuming)return [...saved,...incoming.filter(r=>!r.id||!ids.has(r.id))];
 const first=incoming[0]&&identity(incoming[0],decision),start=first?saved.findLastIndex(r=>identity(r,decision)===first):-1;
 const counts=new Map<string,number>();for(const r of saved.slice(start<0?saved.length:start)){const key=identity(r,decision);counts.set(key,(counts.get(key)??0)+1);}
 const fresh=incoming.filter(r=>{if(r.id&&ids.has(r.id))return false;const key=identity(r,decision),count=counts.get(key)??0;if(count){counts.set(key,count-1);return false;}return true;});
 return [...saved,...fresh];
}
