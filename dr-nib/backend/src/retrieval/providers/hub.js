// Reuse the public Hub discovery endpoint. Only an already-public query is
// accepted; membership is discovery metadata, never an evidence endorsement.
export async function hubSearch({query,maxResults=8}={}, {fetchImpl=fetch}={}) {
  if(typeof query!=='string'||query.trim().length<3||query.length>400)throw Error('hub query invalid');
  const configured=process.env.HUB_API_URL;
  const origin=configured?new URL(configured).origin:process.env.DRNIB_NETWORK==='testnet'?'https://testnet-api.nibgate.xyz':'https://api.nibgate.xyz';
  if(!['https://api.nibgate.xyz','https://testnet-api.nibgate.xyz'].includes(origin))throw Error('hub discovery origin invalid');
  const count=Math.min(12,Math.max(1,Number(maxResults)||8));
  const url=new URL('/hub/explore/content',origin);
  url.searchParams.set('q',query);url.searchParams.set('limit',String(count));
  const response=await fetchImpl(url.href,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error(`hub HTTP ${response.status}`);
  let text='';const reader=response.body?.getReader();
  if(reader){const decoder=new TextDecoder();let bytes=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576)throw Error('hub response too large');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
    finally{await reader.cancel().catch(()=>{});}
  }else{text=await response.text();if(Buffer.byteLength(text)>1048576)throw Error('hub response too large');}
  const data=JSON.parse(text);
  if(data.success!==true||!Array.isArray(data.content))throw Error('hub response invalid');
  const results=data.content.slice(0,count).flatMap(row=>{
    let page;try{page=new URL(row.url);if(page.protocol!=='https:'||page.username||page.password)return [];}catch{return [];}
    if(typeof row.title!=='string'||!row.title.trim())return [];
    return [{url:page.href,title:row.title.slice(0,300),snippet:String(row.description??'').slice(0,2000),content:'',provider:'nibgate-hub',score:0.5,costUsd:0,publishedDate:null}];
  });
  return {results,costUsd:0};
}
