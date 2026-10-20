import {NETWORKS} from '@nibgate/internal/networks.js';
const address=/^0x[0-9a-f]{40}$/i,nonce=/^0x[0-9a-f]{64}$/i,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid=()=>Error('PRIVATE_GATEWAY_SETTLEMENT_INVALID');
/** Circle is queried directly, never a seller-supplied facilitator URL. A
 * seller's success header is not proof of a debit. No signed payload is sent. */
export async function readGatewaySettlement(evidence,{fetchImpl=fetch}={}){
 const network=Object.values(NETWORKS).find(net=>evidence?.network===`eip155:${net.chainId}`);
 if(!network||evidence.token!=='USDC'||!address.test(evidence.from??'')||!address.test(evidence.to??'')||!nonce.test(evidence.nonce??'')||!/^\d{1,16}$/.test(evidence.amount??'')||BigInt(evidence.amount)<=0n||BigInt(evidence.amount)>2000000n||evidence.transferId&&!uuid.test(evidence.transferId))throw invalid();
 const query=evidence.transferId?`/${evidence.transferId}`:`?nonce=${encodeURIComponent(evidence.nonce)}`;
 const response=await fetchImpl(`${network.gatewayApiV1}/x402/transfers${query}`,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{accept:'application/json'}});
 if(!response.ok)throw invalid();
 const text=await response.text();if(text.length>32000)throw invalid();
 const body=JSON.parse(text),transfer=evidence.transferId?body:body.transfers?.[0];
 if(!transfer)return {confirmed:false};
 if(!uuid.test(transfer.id??'')||evidence.transferId&&transfer.id!==evidence.transferId||transfer.token!=='USDC'||transfer.sendingNetwork!==evidence.network||transfer.recipientNetwork!==evidence.network||transfer.fromAddress?.toLowerCase()!==evidence.from.toLowerCase()||transfer.toAddress?.toLowerCase()!==evidence.to.toLowerCase()||transfer.amount!==evidence.amount||transfer.nonce?.toLowerCase()!==evidence.nonce.toLowerCase())throw invalid();
 if(transfer.status==='failed')return {confirmed:false,failed:true};
 if(['received','batched'].includes(transfer.status))return {confirmed:false};
 if(!['confirmed','completed'].includes(transfer.status)||!nonce.test(transfer.txHash??''))throw invalid();
 return {confirmed:true,txHash:transfer.txHash};
}
