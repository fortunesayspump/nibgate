import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePrivateExternalRequest as check} from '@nibgate/internal/private-tools.js';
import {isFinalizedPrivateToolCharge} from './private-external-receipt.js';
process.env.HUB_DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/never_connect';
process.env.DRNIB_DATABASE_URL=process.env.HUB_DATABASE_URL;
const {createPrivateExternalExecutor}=await import('./private-external-executor.js');
const base={tool:'pay_x402',url:'https://research.example.com/data',maxMicroUsd:100};
test('external approvals bind only relevant exact public fields and bounded amounts',()=>{
 for(const request of [base,{tool:'web_search',query:'public science',maxMicroUsd:0},{tool:'http_request',url:base.url,method:'POST',body:{query:'public'},maxMicroUsd:0},{tool:'rate_content',url:base.url,stars:4,unlockRef:'0x'+'a'.repeat(64),maxMicroUsd:0}])assert.deepEqual(check(request),request);
 for(const extra of [{query:'hidden context'},{headers:{authorization:'secret'}},{method:'POST'},{maxMicroUsd:-1},{maxMicroUsd:2000001},{url:'https://127.0.0.1/data'},{url:'https://metadata.internal/data'},{url:'https://user:pass@example.com'},{body:'arbitrary text'}])assert.throws(()=>check({...base,...extra}),/PRIVATE_TOOL_REQUEST_INVALID/);
 assert.throws(()=>check({tool:'tip_creator',url:base.url,maxMicroUsd:10,query:'hidden'}));
 assert.throws(()=>check({tool:'rate_content',url:base.url,maxMicroUsd:0,stars:5,unlockRef:'0x'+'a'.repeat(64),contentId:{private:'context'}}));
});
test('financial tool finality requires exact integer charge, digest and chain/seller receipt',()=>{
 const row={status:'complete',committedMicroUsd:7,costBasis:'seller-receipt',resultDigest:'a'.repeat(64),txHash:'0x'+'b'.repeat(64)};
 assert.equal(isFinalizedPrivateToolCharge(row),true);
 for(const patch of [{status:'reserved'},{txHash:null},{resultDigest:'bad'},{costBasis:'no-charge'},{committedMicroUsd:-1}])assert.equal(isFinalizedPrivateToolCharge({...row,...patch}),false);
 assert.equal(isFinalizedPrivateToolCharge({status:'failed',committedMicroUsd:0,costBasis:'not-dispatched'}),true);
});
test('rehearsal paid transport refuses a mainnet configuration before any HTTP or payment',async()=>{
 let calls=0;const execute=createPrivateExternalExecutor({env:{DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_NETWORK:'mainnet',DRNIB_AGENT_PRIVATE_KEY:'0x'+'a'.repeat(64)},fetchPublic:async()=>{calls++;throw Error('must not fetch')}});
 await assert.rejects(execute(base),e=>e.message==='PRIVATE_EXTERNAL_EXECUTION_FAILED'&&e.privateNotDispatched===true);assert.equal(calls,0);
});

test('deposit errors and uncredited onchain float cannot become customer purchases or duplicate deposits',async()=>{
 for(const onchain of [0n,7n]){
  let deposits=0,sends=0;
  const wallet='0x0077777d7EBA4688BDeF3E311b846F25870A19B9',offer={scheme:'exact',network:'eip155:5042002',asset:'0x3600000000000000000000000000000000000000',amount:'7',payTo:'0x'+'3'.repeat(40),maxTimeoutSeconds:60,extra:{name:'GatewayWalletBatched',version:'1',verifyingContract:wallet}};
  const execute=createPrivateExternalExecutor({env:{DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_NETWORK:'testnet',DRNIB_AGENT_PRIVATE_KEY:'0x'+'1'.repeat(64)},fetchPublic:async()=>{sends++;return new Response('',{status:402,headers:{'payment-required':Buffer.from(JSON.stringify({x402Version:2,accepts:[offer]})).toString('base64')}})},gatewayClientFactory:()=>({address:'0x'+'4'.repeat(40),chainConfig:{gatewayWallet:wallet},publicClient:{getChainId:async()=>5042002,readContract:async()=>onchain},getBalances:async()=>({wallet:{balance:100n},gateway:{available:0n}}),deposit:async()=>{deposits++;throw Error('Synthetic deposit receipt timeout')},walletClient:{signTypedData:()=>assert.fail('No seller authorization before funding')}})});
  await assert.rejects(execute(base,{onPaymentPrepared:()=>assert.fail('No purchase journal')}),e=>e.privateNotDispatched===true);
  assert.equal(deposits,onchain===0n?1:0);assert.equal(sends,1);
 }
});

test('a failure after journaled seller dispatch remains uncertain and is never labeled not-dispatched',async()=>{
 let sends=0,journaled=false;
 const wallet='0x0077777d7EBA4688BDeF3E311b846F25870A19B9',offer={scheme:'exact',network:'eip155:5042002',asset:'0x3600000000000000000000000000000000000000',amount:'7',payTo:'0x'+'3'.repeat(40),maxTimeoutSeconds:60,extra:{name:'GatewayWalletBatched',version:'1',verifyingContract:wallet}};
 const execute=createPrivateExternalExecutor({env:{DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_NETWORK:'testnet',DRNIB_AGENT_PRIVATE_KEY:'0x'+'1'.repeat(64)},fetchPublic:async(_url,options)=>{sends++;if(sends===2){assert(journaled);assert(options.headers['payment-signature']);throw Error('Synthetic unknown purchase outcome')}return new Response('',{status:402,headers:{'payment-required':Buffer.from(JSON.stringify({x402Version:2,accepts:[offer]})).toString('base64')}})},gatewayClientFactory:()=>({address:'0x'+'4'.repeat(40),chainConfig:{gatewayWallet:wallet},publicClient:{getChainId:async()=>5042002},getBalances:async()=>({wallet:{balance:100n},gateway:{available:100n}}),walletClient:{signTypedData:async()=> '0x'+'1'.repeat(130)}})});
 await assert.rejects(execute(base,{onPaymentPrepared:async e=>{assert.match(e.nonce,/^0x[0-9a-f]{64}$/);journaled=true}}),e=>e.privateNotDispatched!==true);
 assert.equal(sends,2);assert(journaled);
});

test('legacy creator SDK body receipt is Circle-bound and its proof is redeemed without another payment',async()=>{
 const article='https://public.example.com/article',url='https://public.example.com/api/nibgate/access?path=%2Farticle',wallet='0x0077777d7EBA4688BDeF3E311b846F25870A19B9',transferId='b3d9d2d5-4c12-4941-a09d-953e82fae2b0';
 const offer={scheme:'exact',network:'eip155:5042002',asset:'0x3600000000000000000000000000000000000000',amount:'7',payTo:'0x'+'3'.repeat(40),maxTimeoutSeconds:60,extra:{name:'GatewayWalletBatched',version:'1',verifyingContract:wallet}};let sends=0,journaled=false,verified=false;
 const execute=createPrivateExternalExecutor({env:{DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_NETWORK:'testnet',DRNIB_AGENT_PRIVATE_KEY:'0x'+'1'.repeat(64)},gatewayClientFactory:()=>({address:'0x'+'4'.repeat(40),chainConfig:{gatewayWallet:wallet},publicClient:{getChainId:async()=>5042002},getBalances:async()=>({wallet:{balance:100n},gateway:{available:100n}}),walletClient:{signTypedData:async()=> '0x'+'1'.repeat(130)}}),readSettlement:async e=>{assert(journaled);assert.equal(e.transferId,transferId);assert.equal(e.amount,'7');verified=true;return {confirmed:true,txHash:'0x'+'5'.repeat(64)}},fetchPublic:async(target,options)=>{
  sends++;assert.equal(options.redirect,'error');
  if(sends===1)return new Response('',{status:402,headers:{'payment-required':Buffer.from(JSON.stringify({x402Version:2,resource:{url:'/article'},accepts:[offer]})).toString('base64')}});
  if(sends===2){assert(journaled);assert(options.headers['payment-signature']);return Response.json({unlockProof:'synthetic-access-proof',payment:{paymentProvider:'circle-gateway',verified:true,network:offer.network,txHash:transferId}})}
  if(sends===3){assert.equal(target,url);assert.equal(options.headers['payment-signature'],undefined);assert.equal(options.headers['x-nibgate-payment-proof'],'synthetic-access-proof');return Response.json({content:'Actual purchased article evidence.'})}
  assert.equal(target,article);return Response.json({});
 }});
 const result=await execute({tool:'unlock_content',url,maxMicroUsd:100},{onPaymentPrepared:async()=>{journaled=true}});
 assert(verified);assert.equal(sends,4);assert.equal(result.pending,false);assert.equal(result.costMicroUsd,7);assert.equal(result.output.sources[0].url,article);assert.equal(result.output.sources[0].text,'Actual purchased article evidence.');assert(!JSON.stringify(result).includes('synthetic-access-proof'));
});

const {readGatewaySettlement}=await import('./private-gateway-settlement.js');
const evidence={network:'eip155:5042002',token:'USDC',from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),amount:'100',nonce:'0x'+'3'.repeat(64),transferId:'b3d9d2d5-4c12-4946-a09d-953e82fae2b0'};
const transfer={id:evidence.transferId,status:'confirmed',token:'USDC',sendingNetwork:evidence.network,recipientNetwork:evidence.network,fromAddress:evidence.from,toAddress:evidence.to,amount:evidence.amount,nonce:evidence.nonce,txHash:'0x'+'4'.repeat(64)};
test('Circle confirmation binds the exact authorization and uses a fixed authority',async()=>{
 const fetchImpl=async(url,options)=>{assert.equal(url,`https://gateway-api-testnet.circle.com/v1/x402/transfers/${evidence.transferId}`);assert.equal(options.redirect,'error');assert.equal(options.method,undefined);return Response.json(transfer)};
 assert.deepEqual(await readGatewaySettlement(evidence,{fetchImpl}),{confirmed:true,txHash:transfer.txHash});
 for(const patch of [{fromAddress:evidence.to},{toAddress:evidence.from},{amount:'99'},{nonce:'0x'+'5'.repeat(64)},{sendingNetwork:'eip155:1'},{recipientNetwork:'eip155:1'},{id:'bad'},{txHash:null},{status:'unknown'},{token:'EURC'}])await assert.rejects(readGatewaySettlement(evidence,{fetchImpl:async()=>Response.json({...transfer,...patch})}),/PRIVATE_GATEWAY_SETTLEMENT_INVALID/);
});
test('Circle received/batched states reserve the budget without claiming finality',async()=>{
 for(const status of ['received','batched'])assert.deepEqual(await readGatewaySettlement(evidence,{fetchImpl:async()=>Response.json({...transfer,status,txHash:null})}),{confirmed:false});
 assert.deepEqual(await readGatewaySettlement(evidence,{fetchImpl:async()=>Response.json({...transfer,status:'failed',txHash:null})}),{confirmed:false,failed:true});
 const {transferId,...journal}=evidence;
 assert.deepEqual(await readGatewaySettlement(journal,{fetchImpl:async url=>{assert.ok(url.endsWith(`?nonce=${evidence.nonce}`));return Response.json({transfers:[transfer]})}}),{confirmed:true,txHash:transfer.txHash});
 assert.equal(isFinalizedPrivateToolCharge({status:'reserved',costBasis:'gateway-pending',committedMicroUsd:100,resultDigest:'a'.repeat(64),txHash:null}),false);
});
