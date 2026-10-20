/** Optional wallet methods must never turn a successful RPC read into failure. */
export async function readEscrowWalletDiagnostics(request:(input:any)=>Promise<any>,address:string,balanceData:string,timeoutMs=9000){
 const read=async(input:any)=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([Promise.resolve().then(()=>request(input)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Wallet connection check timed out.')),timeoutMs)})]);}finally{if(timer)clearTimeout(timer);}};
 const blockNumber=await read({method:'eth_blockNumber'});
 if(typeof blockNumber!=='string'||!/^0x[0-9a-f]+$/i.test(blockNumber))throw Error('Invalid wallet block response.');
 const optional=(input:any)=>read(input).catch(()=>null);
 const [syncing,gas,usdc]=await Promise.all([optional({method:'eth_syncing'}),optional({method:'eth_getBalance',params:[address,'latest']}),optional({method:'eth_call',params:[{to:'0x3600000000000000000000000000000000000000',data:balanceData},'latest']})]);
 return {blockNumber,syncing,gas,usdc};
}
