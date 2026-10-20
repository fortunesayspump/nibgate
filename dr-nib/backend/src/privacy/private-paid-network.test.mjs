import test from 'node:test';
import assert from 'node:assert/strict';
import {NETWORKS} from '@nibgate/internal/networks.js';
import {privatePaidNetwork,privatePaidToolsEnabled} from './private-paid-network.js';
process.env.HUB_DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/never_connect';
process.env.DRNIB_DATABASE_URL=process.env.HUB_DATABASE_URL;
const {createPrivateExternalExecutor}=await import('./private-external-executor.js');
const {readGatewaySettlement}=await import('./private-gateway-settlement.js');
const key='0x'+'1'.repeat(64),env={DRNIB_NETWORK:'mainnet',HUB_API_URL:'https://api.nibgate.xyz',DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_PRIVATE_MAINNET_PAID_TOOLS_ENABLED:'true',DRNIB_PRIVATE_MAINNET_TOOL_MAX_MICRO_USD:'100',DRNIB_AGENT_PRIVATE_KEY:key};
const url='https://public.example.com/api/access',request={tool:'pay_x402',url,maxMicroUsd:100};
test('mainnet needs separate explicit opt-in, canonical Hub and bounded operator ceiling',()=>{
 assert.equal(privatePaidNetwork(env).network.chainId,5042);
 for(const patch of [{DRNIB_PRIVATE_MAINNET_PAID_TOOLS_ENABLED:'false'},{DRNIB_PRIVATE_MAINNET_TOOL_MAX_MICRO_USD:'0'},{DRNIB_PRIVATE_MAINNET_TOOL_MAX_MICRO_USD:'2000001'},{DRNIB_PRIVATE_MAINNET_TOOL_MAX_MICRO_USD:'NaN'},{HUB_API_URL:'https://testnet-api.nibgate.xyz'},{DRNIB_NETWORK:'arbitrary'},{DRNIB_AGENT_PRIVATE_KEY:''}])assert.equal(privatePaidToolsEnabled({...env,...patch}),false);
 assert.equal(privatePaidNetwork({DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_NETWORK:'testnet',DRNIB_AGENT_PRIVATE_KEY:key}).network.chainId,5042002);
});
test('mainnet declines above-cap work before network calls or signing',async()=>{
 let calls=0;const execute=createPrivateExternalExecutor({env,fetchPublic:async()=>{calls++;throw Error('must not fetch')},gatewayClientFactory:()=>assert.fail('must not construct wallet')});
 await assert.rejects(execute({...request,maxMicroUsd:101}),e=>e.privateNotDispatched===true);assert.equal(calls,0);
});
function setup({chainId=5042,wallet=NETWORKS.mainnet.gatewayWallet,offerNetwork='eip155:5042',offerWallet=NETWORKS.mainnet.gatewayWallet,failDelivery=false}={}){
 let sends=0,signs=0,journaled=false;
 const offer={scheme:'exact',network:offerNetwork,asset:NETWORKS.mainnet.usdc,amount:'7',payTo:'0x'+'3'.repeat(40),maxTimeoutSeconds:60,extra:{name:'GatewayWalletBatched',version:'1',verifyingContract:offerWallet}};
 const execute=createPrivateExternalExecutor({env,fetchPublic:async(_url,options)=>{
  sends++;assert.equal(options.redirect,'error');
  if(sends===1)return new Response('',{status:402,headers:{'payment-required':Buffer.from(JSON.stringify({x402Version:2,accepts:[offer]})).toString('base64')}});
  if(sends===2){assert(journaled);assert(options.headers['payment-signature']);if(failDelivery)throw Error('delivery lost');return Response.json({content:'Purchased source'},{headers:{'payment-response':Buffer.from(JSON.stringify({success:true,network:'eip155:5042',transaction:'b3d9d2d5-4c12-4941-a09d-953e82fae2b0'})).toString('base64')}})}
  return Response.json({});
 },gatewayClientFactory:options=>{assert.equal(options.chain,'arc');return {address:'0x'+'4'.repeat(40),chainConfig:{gatewayWallet:wallet},publicClient:{getChainId:async()=>chainId},getBalances:async()=>({wallet:{balance:100n},gateway:{available:100n}}),walletClient:{signTypedData:async args=>{signs++;assert.equal(Number(args.domain.chainId),5042);return '0x'+'1'.repeat(130)}}}},readSettlement:async e=>{assert.equal(e.network,'eip155:5042');assert.equal(e.amount,'7');return {confirmed:true,txHash:'0x'+'5'.repeat(64)}}});
 return {run:()=>execute(request,{onPaymentPrepared:async e=>{assert.equal(e.network,'eip155:5042');assert.match(e.nonce,/^0x[0-9a-f]{64}$/);journaled=true}}),counts:()=>({sends,signs,journaled})};
}
test('mainnet purchase uses exact registry chain/contract, journals before dispatch and reconciles debit',async()=>{
 const t=setup();const result=await t.run();assert.equal(result.pending,false);assert.equal(result.costMicroUsd,7);assert.equal(result.paymentEvidence.network,'eip155:5042');assert.equal(t.counts().signs,1);assert.equal(t.counts().journaled,true);
});
test('wrong RPC chain, Gateway contract or seller offer never signs or dispatches a payment',async()=>{
 for(const patch of [{chainId:5042002},{wallet:NETWORKS.testnet.gatewayWallet},{offerNetwork:'eip155:5042002'},{offerWallet:NETWORKS.testnet.gatewayWallet}]){
  const t=setup(patch);await assert.rejects(t.run(),e=>e.privateNotDispatched===true);assert.deepEqual(t.counts(),{sends:1,signs:0,journaled:false});
 }
});
test('mainnet lost delivery stays uncertain after seller dispatch; it is not automatically replayed',async()=>{
 const t=setup({failDelivery:true});await assert.rejects(t.run(),e=>e.privateNotDispatched!==true);assert.equal(t.counts().sends,2);assert.equal(t.counts().signs,1);
});
test('mainnet receipt lookup uses canonical Circle authority and rejects cross-network evidence',async()=>{
 const e={network:'eip155:5042',token:'USDC',from:'0x'+'1'.repeat(40),to:'0x'+'2'.repeat(40),amount:'7',nonce:'0x'+'3'.repeat(64),transferId:'b3d9d2d5-4c12-4941-a09d-953e82fae2b0'};
 const record={...e,id:e.transferId,status:'confirmed',sendingNetwork:e.network,recipientNetwork:e.network,fromAddress:e.from,toAddress:e.to,txHash:'0x'+'4'.repeat(64)};
 let count=0;const fetchImpl=async url=>{count++;assert.equal(url,NETWORKS.mainnet.gatewayApiV1+'/x402/transfers/'+e.transferId);return Response.json(record)};
 assert.equal((await readGatewaySettlement(e,{fetchImpl})).confirmed,true);
 await assert.rejects(readGatewaySettlement({...e,network:'eip155:1'},{fetchImpl}));assert.equal(count,1);
 await assert.rejects(readGatewaySettlement(e,{fetchImpl:async()=>Response.json({...record,sendingNetwork:'eip155:5042002'})}));
});
