/** Only repeat reads. A failed mutation may already have committed remotely. */
export async function privateRecordFetch(url:string,options:RequestInit,fetcher:typeof fetch=fetch,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<Response>{
 const read=(options.method??'GET').toUpperCase()==='GET';
 for(let attempt=0;;attempt++){
  let response:Response;
  try{response=await fetcher(url,options);}catch(error){
   if(!read||attempt>=2||options.signal?.aborted)throw error;
   await wait(300*(attempt+1));continue;
  }
  let retry=[502,504].includes(response.status);
  if(read&&response.status===503){
   try{const body=await response.clone().text();retry=body.length<1024&&JSON.parse(body).code==='account_unavailable';}catch{}
  }
  if(!read||!retry||attempt>=2||options.signal?.aborted)return response;
  await wait(300*(attempt+1));
 }
}
