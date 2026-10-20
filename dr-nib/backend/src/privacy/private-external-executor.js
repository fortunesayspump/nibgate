import {privatePaidResourceUrl} from './private-paid-resource.js';
import {privatePaidContent} from './private-paid-content.js';
import {assessPublicCreatorPage} from './public-creator-detection.js';
import {GatewayClient,BatchEvmScheme} from '@circle-fin/x402-batching/client';
import {validatePrivateExternalRequest} from '@nibgate/internal/private-tools.js';
import {publicFetch,httpRequest} from '../tools/http.js';
import {directExtract} from '../retrieval/providers/direct.js';
import {createPrivatePublicRetrieval} from './private-public-retrieval.js';
import {paidEvidenceText} from '../paid-evidence.js';
import {spendChain} from '../spend/chain.js';
import {executePublicTip} from '../spend/tips.js';
import {executePublicRating} from '../spend/ratings.js';
import {formatUnits,parseAbi} from 'viem';
import {readGatewaySettlement} from './private-gateway-settlement.js';

const fail=()=>Error('PRIVATE_EXTERNAL_EXECUTION_FAILED');
const gatewayBalanceAbi=parseAbi(['function availableBalance(address token,address depositor) view returns (uint256)']);
/** Real public transports and existing Hub payment rails. Signing keys stay
 * in this isolated process. Paid payloads never follow a redirect or retry. */
export function createPrivateExternalExecutor({env=process.env,fetchPublic=publicFetch,gatewayClientFactory=options=>new GatewayClient(options),readSettlement=readGatewaySettlement}={}){
 const execute=async (value,{onPaymentPrepared=async()=>{}}={})=>{
  const request=validatePrivateExternalRequest(value);let mayHavePaid=false;
  try{
   if(request.tool==='web_search')return {costMicroUsd:0,costBasis:'no-charge',output:{sources:await createPrivatePublicRetrieval()({brief:request.query,...(request.preferCreators?{preferCreators:true}:{})})}};
   if(request.tool==='web_fetch'){
    const out=await directExtract({urls:[request.url],maxChars:24000,timeoutMs:6000},{assessPage:assessPublicCreatorPage,fetchImpl:(url,opts)=>fetchPublic(url,{...opts,signal:AbortSignal.any([AbortSignal.timeout(12000),...(opts?.signal?[opts.signal]:[])])})});
    return {costMicroUsd:0,costBasis:'no-charge',output:out};
   }
   if(request.tool==='http_request'){
    const out=await httpRequest({url:request.url,method:request.method??'GET',body:request.body?JSON.stringify(request.body):null,maxBytes:24000,timeoutMs:10000,followRedirects:false,headers:request.body?{'content-type':'application/json'}:{}});
    if(out.status>=300)throw fail();return {costMicroUsd:0,costBasis:'no-charge',output:{url:out.url,text:out.body,status:out.status,truncated:out.truncated}};
   }
   // This rehearsal must not sign a mainnet payment by inherited config.
   if(env.DRNIB_PRIVATE_PAID_TOOLS_ENABLED!=='true'||env.DRNIB_NETWORK!=='testnet'||!/^0x[0-9a-f]{64}$/i.test(env.DRNIB_AGENT_PRIVATE_KEY??''))throw fail();
   if(request.tool==='tip_creator'){
    mayHavePaid=true;const out=await executePublicTip({contentUrl:request.url,amount:request.maxMicroUsd/1000000});
    return {costMicroUsd:request.maxMicroUsd,costBasis:'chain-receipt',txHash:out.txHash,output:{tipped:true,url:request.url,txHash:out.txHash,held:out.held}};
   }
   if(request.tool==='rate_content'){
    mayHavePaid=true;const out=await executePublicRating({url:request.url,contentId:request.contentId,stars:request.stars,unlockRef:request.unlockRef});
    if(out.indexed!==true)throw fail();
    return {costMicroUsd:0,costBasis:'chain-receipt',txHash:out.txHash,output:{rated:true,url:request.url,stars:request.stars,txHash:out.txHash,indexed:out.indexed}};
   }
   const host=new URL(request.url).hostname,self=(env.DRNIB_SELF_HOST||'drnib.nibgate.xyz').toLowerCase();
   if(host===self||host.endsWith('.'+self))throw fail();
   const method=request.body?'POST':'GET',body=request.body?JSON.stringify(request.body):undefined;
   const send=headers=>fetchPublic(request.url,{method,body,headers:{'content-type':'application/json','x-nibgate-actor':'agent',...headers},redirect:'error',signal:AbortSignal.timeout(15000)});
   const initial=await send({});
   if(initial.ok){const text=await initial.text();return {costMicroUsd:0,costBasis:'no-charge',output:{url:request.url,text:text.slice(0,24000)}};}
   if(initial.status!==402)throw fail();
   const raw=initial.headers.get('payment-required');if(!raw||raw.length>16000)throw fail();
   const challenge=JSON.parse(Buffer.from(raw,'base64').toString('utf8'));
   if(challenge.x402Version!==2)throw fail();
   const resourceUrl=privatePaidResourceUrl(request.url,challenge.resource?.url);
   const chain=spendChain('testnet'),client=gatewayClientFactory({chain:chain.gatewayChain,privateKey:env.DRNIB_AGENT_PRIVATE_KEY,rpcUrl:chain.rpcUrl});
   const actualChain=await client.publicClient.getChainId();if(actualChain!==chain.chainId)throw fail();
   const offer=challenge.accepts?.find(o=>o.scheme==='exact'&&o.network===`eip155:${chain.chainId}`&&o.asset?.toLowerCase()===chain.usdc.toLowerCase()&&o.extra?.name==='GatewayWalletBatched'&&o.extra?.version==='1'&&o.extra?.verifyingContract?.toLowerCase()===client.chainConfig.gatewayWallet.toLowerCase());
   if(!offer||!/^\d{1,16}$/.test(offer.amount??'')||BigInt(offer.amount)<=0n||BigInt(offer.amount)>BigInt(request.maxMicroUsd)||!/^0x[0-9a-f]{40}$/i.test(offer.payTo??''))throw fail();
   const amount=BigInt(offer.amount),balance=await client.getBalances(),available=BigInt(balance.gateway?.available??0);
   if(available<amount){
    const onchain=await client.publicClient.readContract({address:client.chainConfig.gatewayWallet,abi:gatewayBalanceAbi,functionName:'availableBalance',args:[chain.usdc,client.address]});
    if(BigInt(onchain)>=amount)throw fail(); // credit/batch pending: never deposit the same float again
    const shortage=amount-available;if(BigInt(balance.wallet?.balance??0)<shortage)throw fail();
    await client.deposit(formatUnits(shortage,6));
    if(BigInt((await client.getBalances()).gateway?.available??0)<amount)throw fail();
   }
   const scheme=new BatchEvmScheme({address:client.address,signTypedData:args=>client.walletClient.signTypedData(args)});
   const payload=await scheme.createPaymentPayload(challenge.x402Version??2,offer);
   const auth=payload.payload?.authorization;
   const paymentEvidence={network:`eip155:${chain.chainId}`,token:'USDC',from:client.address,to:offer.payTo,amount:offer.amount,nonce:auth?.nonce};
   if(!/^0x[0-9a-f]{64}$/i.test(paymentEvidence.nonce??''))throw fail();
   // Journal attribution before dispatch. Never persist the signed authorization.
   await onPaymentPrepared(paymentEvidence);
   const signature=Buffer.from(JSON.stringify({...payload,resource:challenge.resource,accepted:offer})).toString('base64');
   // Gateway deposits replenish operator float; they do not purchase content.
   // Only dispatch of the journaled seller authorization can create a customer
   // purchase. Before this point a failure can safely release its reservation.
   mayHavePaid=true;
   const response=await send({'payment-signature':signature});
   if(!response.ok)throw fail();
   const rawText=await response.text();let data;try{data=JSON.parse(rawText)}catch{data=rawText;}
   const receiptRaw=response.headers.get('payment-response');if(receiptRaw?.length>16000)throw fail();
   // Older creator SDK accessResponse drops the middleware response header but
   // includes the same settlement UUID in payment.txHash. It is only a lookup
   // hint: authoritative Circle attribution/finality is still mandatory.
   const receipt=receiptRaw?JSON.parse(Buffer.from(receiptRaw,'base64').toString('utf8')):
    data?.payment?.paymentProvider==='circle-gateway'&&data.payment.verified===true?
     {success:true,network:data.payment.network,transaction:data.payment.txHash}:null;
   if(receipt?.success!==true||receipt.network!==paymentEvidence.network||!/^[-0-9a-f]{36}$/i.test(receipt.transaction??''))throw fail();
   paymentEvidence.transferId=receipt.transaction;
   const content=await privatePaidContent(data,proof=>send({'x-nibgate-payment-proof':proof}));
   data=content.data;
   const settlement=await readSettlement(paymentEvidence).catch(()=>null);
   // Use the same public-page detector as ordinary retrieval. This GET carries
   // no purchased content or private research context and cannot redirect.
   // Detection failure must not discard an already purchased result.
   let creatorAssessment;
   try{
    const page=await fetchPublic(resourceUrl,{redirect:'error',signal:AbortSignal.timeout(6000)});
    if(page.ok&&/text\/html/i.test(page.headers.get('content-type')??'')){
     const html=await page.text();
     if(html.length<=500000){const {readableText,...assessment}=await assessPublicCreatorPage({url:resourceUrl,html});creatorAssessment=assessment;}
    }
   }catch{}
   // The measured worker already accepts sources[]; preserve the validated
   // canonical article rather than falling back to the payment API URL.
   return {costMicroUsd:Number(amount),costBasis:'gateway-confirmed',pending:!settlement?.confirmed,txHash:settlement?.txHash??null,paymentEvidence,output:{sources:content.contentUnavailable?[]:[{url:resourceUrl,title:resourceUrl,text:paidEvidenceText(data).slice(0,24000),...(creatorAssessment?{creatorAssessment}:{})}],...(content.contentUnavailable?{contentUnavailable:true,notice:'Payment was accepted but the purchased content could not be retrieved. Do not purchase it again or treat payment metadata as article evidence.'}:{}),settlementId:paymentEvidence.transferId}};
  }catch{
   const error=fail();if(!mayHavePaid)error.privateNotDispatched=true;throw error;
  }
 };
 execute.reconcile=readSettlement;return execute;
}
