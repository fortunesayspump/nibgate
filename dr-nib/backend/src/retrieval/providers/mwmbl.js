// Optional keyless web index for creator-aware discovery. Run in the shared
// public-tools process; do not query the same engine through SearXNG as well.
export async function mwmblSearch({query,maxResults=8}={}, {fetchImpl=fetch}={}) {
  const count=Math.min(20,Math.max(1,Number(maxResults)||8));
  const response=await fetchImpl(`https://api.mwmbl.org/api/v1/search/?s=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error(`mwmbl HTTP ${response.status}`);
  const reader=response.body?.getReader();let text='';
  if(reader){
    const decoder=new TextDecoder();let bytes=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576)throw Error('mwmbl response too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
    finally{await reader.cancel().catch(()=>{});}
  }else{text=await response.text();if(Buffer.byteLength(text)>1048576)throw Error('mwmbl response too large');}
  const data=JSON.parse(text);
  if(!Array.isArray(data))throw Error('mwmbl response invalid');
  const flatten=(parts,limit)=>Array.isArray(parts)?parts.map(p=>typeof p?.value==='string'?p.value:'').join('').slice(0,limit):'';
  const results=data.slice(0,100).flatMap(row=>{
    let url;try{url=new URL(row.url);if(url.protocol!=='https:'||url.username||url.password)return [];}catch{return [];}
    const title=flatten(row.title,300).trim();if(!title)return [];
    return [{url:url.href,title,snippet:flatten(row.extract,2000),content:'',provider:'mwmbl',score:0.5,costUsd:0,publishedDate:null}];
  }).slice(0,count);
  return {results,costUsd:0,raw:{count:data.length}};
}
