// Opt-in integration: real PostgreSQL + Prisma, real EIP-712 signatures and route.
// Facilitator/chain verification and fee-wallet resolution are synthetic. No funds move.
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { privateKeyToAccount } from 'viem/accounts';
const state = vi.hoisted(() => ({ db: null, gateway: vi.fn(), direct: vi.fn(), requirement: null, rpcVerify:vi.fn(), rpcChain:vi.fn(), claimGate:null, uniqueConflicts:0, hosted:vi.fn() }));
vi.mock('viem', async importOriginal=>({...await importOriginal(),createPublicClient:()=>({getChainId:state.rpcChain,verifyTypedData:state.rpcVerify})}));
vi.mock('@nibgate/sdk/server',async importOriginal=>({...await importOriginal(),runHostedPayRequirement:(...args)=>state.hosted(...args)}));
vi.mock('@nibgate/internal/db.js', () => ({ db: new Proxy({}, { get: (_, key) => { const value = state.db[key]; return typeof value === 'function' ? value.bind(state.db) : value; } }) }));
vi.mock('../hub/monitors.js', () => Object.fromEntries(['startVerificationMonitor','startManifestSyncMonitor','startReputationIndexer','startDataIntegrityMonitor','startGscSitemapMonitor','startGscIndexMonitor'].map(k=>[k,vi.fn()])));
vi.mock('../revenue/keeper.js', () => ({ startFeeKeeper: vi.fn() }));
vi.mock('../../../../packages/nibgate/src/server/fee-wallet.js', async importOriginal => {
 const actual = await importOriginal();
 return {...actual,resolvePayTo:async recipient=>recipient,createTransferVerifier:()=>state.direct};
});
vi.mock('../../../../packages/nibgate/src/server/gateway.js', async importOriginal => {
 const actual = await importOriginal();
 return {...actual,runCircleGatewayRequirement:(...args)=>state.gateway(...args)};
});
import { createTipRequirement } from '../../../../packages/nibgate/src/server/tip.js';
import { createCircleGatewayBrowserAdapter } from '../../../../packages/nibgate/src/browser/gateway.js';
import { TIP_CLAIM_PREFIX } from '../hub/tip-idempotency.js';
const decodeClaim=value=>JSON.parse(value.slice(TIP_CLAIM_PREFIX.length));
import { registerHubRoutes } from './hub-routes.js';
const enabled = Boolean(process.env.NIBGATE_INTEGRATION_DATABASE_URL && process.env.NIBGATE_INTEGRATION_PRISMA_CLIENT);
const account = privateKeyToAccount('0x'+'11'.repeat(32)); // public synthetic fixture; never funded
const payee = '0x'+'22'.repeat(20), contract = '0x'+'33'.repeat(20);
const types = {TransferWithAuthorization:[{name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'}]};
const deferred = () => {let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve};};
let handler, holdHandler, payHandler, sequence=0;
async function fixture() {
 const authorization={from:account.address,to:payee,value:'1000000',validAfter:'0',validBefore:'9999999999',nonce:'0x'+(++sequence).toString(16).padStart(64,'0')};
 const signature=await account.signTypedData({domain:{name:'GatewayWalletBatched',version:'1',chainId:5042002,verifyingContract:state.requirement.extra.verifyingContract},types,primaryType:'TransferWithAuthorization',message:{...authorization,value:1000000n,validAfter:0n,validBefore:9999999999n}});
 const paymentSignature=Buffer.from(JSON.stringify({x402Version:2,accepted:state.requirement,payload:{authorization,signature}})).toString('base64');
 return {contentUrl:'https://synthetic.example/post',title:'Synthetic tip',amount:'1',currency:'USDC',network:'testnet',recipient:payee,paymentRail:'gateway',paymentSignature};
}
async function request(body, selectedHandler=handler) {
 // Round-trip the exact JSON wire body rather than reusing mutable objects.
 const req={body:JSON.parse(JSON.stringify(body)),headers:{},method:'POST',protocol:'http',get:()=> 'localhost'};
 const res={statusCode:200,body:null,status(n){this.statusCode=n;return this;},json(v){this.body=JSON.parse(JSON.stringify(v));return this;}};
 await selectedHandler(req,res);return res;
}
describe.skipIf(!enabled)('tip verify real PostgreSQL atomicity (synthetic settlement)',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.NIBGATE_INTEGRATION_DATABASE_URL);
  if(url.hostname!=='127.0.0.1'||url.pathname!=='/nibgate_fixture')throw Error('Only isolated localhost fixture DB is allowed');
  const {PrismaClient}=createRequire(import.meta.url)(process.env.NIBGATE_INTEGRATION_PRISMA_CLIENT);
  state.db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  state.db.$use(async(params,next)=>{if(state.claimGate&&params.model==='PaymentTxClaim'&&params.action==='create')await state.claimGate();try{return await next(params);}catch(error){if(error.code==='P2002')state.uniqueConflicts++;throw error;}});
  process.env.NIBGATE_NETWORK='testnet';process.env.NIBGATE_DISABLE_KEEPER='true';
  const capture=(path,...fns)=>{if(path==='/api/hub/tips/verify')handler=fns.at(-1);if(path==='/api/hub/tips/hold')holdHandler=fns.at(-1);if(path==='/api/hub/pay')payHandler=fns.at(-1);};
  registerHubRoutes({get:()=>{},post:capture,put:()=>{},patch:()=>{},delete:()=>{},options:()=>{},use:()=>{}});
 });
 beforeEach(async()=>{
  state.claimGate=null;state.uniqueConflicts=0;
  await state.db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_claim_completion ON "PaymentTxClaim"');
  await state.db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_refund_finalization ON "TipRefundAuthorization"');
  await state.db.tipRefundAuthorization.deleteMany();await state.db.tipDomainOperation.deleteMany();
  await state.db.tip.deleteMany();await state.db.paymentTxClaim.deleteMany();
  state.requirement=(await createTipRequirement({contentUrl:'https://synthetic.example/post',title:'Synthetic tip',amount:'1',currency:'USDC',recipient:payee},{network:'eip155:5042002',paymentRail:'gateway'})).challenge.accepts[0];
  state.gateway.mockReset().mockResolvedValue({handled:false,payment:{payer:account.address,paymentId:'synthetic-settlement',txHash:null}});
  state.hosted.mockReset();state.direct.mockReset();state.rpcChain.mockReset().mockResolvedValue(5042002);state.rpcVerify.mockReset().mockResolvedValue(false);
 });
 afterAll(async()=>{if(state.db){await state.db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_claim_completion ON "PaymentTxClaim"');await state.db.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_refund_finalization ON "TipRefundAuthorization"');await state.db.$disconnect();}});
 it('accepts a real SDK browser adapter proof and replays its serialized request',async()=>{
  const adapter=await createCircleGatewayBrowserAdapter({signer:account,network:'eip155:5042002'});
  const paid=await adapter.pay({challenge:{x402Version:2,resource:{url:'https://synthetic.example/post'},accepts:[state.requirement]}});
  const body={...(await fixture()),paymentSignature:paid.paymentSignature};
  const first=await request(body);expect(first.statusCode).toBe(200);const second=await request(body);expect(second.body.id).toBe(first.body.id);expect(state.gateway).toHaveBeenCalledTimes(1);
 });
 it('uses the trusted read-only contract-wallet verification fallback',async()=>{
  const body=await fixture();const proof=JSON.parse(Buffer.from(body.paymentSignature,'base64').toString());const wallet='0x'+'44'.repeat(20);proof.payload.authorization.from=wallet;body.paymentSignature=Buffer.from(JSON.stringify(proof)).toString('base64');
  state.rpcVerify.mockResolvedValue(true);state.gateway.mockResolvedValue({handled:false,payment:{payer:wallet,paymentId:'synthetic-contract'}});
  expect((await request(body)).statusCode).toBe(200);expect(state.rpcVerify).toHaveBeenCalledTimes(1);expect(await state.db.tip.count()).toBe(1);
 });
 it('fails closed without reservation when signature-verification RPC fails',async()=>{
  const body=await fixture();const proof=JSON.parse(Buffer.from(body.paymentSignature,'base64').toString());proof.payload.authorization.from='0x'+'44'.repeat(20);body.paymentSignature=Buffer.from(JSON.stringify(proof)).toString('base64');
  state.rpcChain.mockRejectedValue(new Error('synthetic RPC outage'));
  expect((await request(body)).statusCode).toBe(400);expect(await state.db.paymentTxClaim.count()).toBe(0);expect(state.gateway).not.toHaveBeenCalled();
 });
 it('round-trips hold challenge through SDK signing, then rejects replay after terminal status change',async()=>{
  const body={contentUrl:'https://synthetic.example/held',amount:'1',paymentRail:'gateway',network:'testnet'};
  const challenge=await request(body,holdHandler);expect(challenge.body.holdStatus).toBe('challenge');expect(await state.db.paymentTxClaim.count()).toBe(0);
  const adapter=await createCircleGatewayBrowserAdapter({signer:account,network:'eip155:5042002'});const paid=await adapter.pay({challenge:challenge.body});
  const signed={...body,paymentSignature:paid.paymentSignature};const first=await request(signed,holdHandler);expect(first.statusCode).toBe(200);expect(first.body.tip.status).toBe('held');
  const second=await request(signed,holdHandler);expect(second.body.tip).toEqual(first.body.tip);expect(state.gateway).toHaveBeenCalledTimes(1);
  await state.db.tip.update({where:{id:first.body.tip.id},data:{status:'refunded'}});
  expect((await request(signed,holdHandler)).statusCode).toBe(409);expect(state.gateway).toHaveBeenCalledTimes(1);
 });
 it('deduplicates concurrent verified direct-transfer proofs and records the verified payer',async()=>{
  state.direct.mockImplementation(async({payment})=>{payment.transferPayer=account.address;return true;});
  const body={...(await fixture()),paymentRail:'transfer',txHash:'0x'+'77'.repeat(32)};delete body.paymentSignature;
  const results=await Promise.all(Array.from({length:8},()=>request(body)));expect(results.every(r=>[200,409].includes(r.statusCode))).toBe(true);
  expect(await state.db.tip.count()).toBe(1);const row=await state.db.tip.findFirst();expect(row.payerWallet).toBe(account.address.toLowerCase());
  const calls=state.direct.mock.calls.length;expect((await request(body)).body.id).toBe(row.id);expect(state.direct).toHaveBeenCalledTimes(calls+1);
 });
 it('rejects forged complete metadata that points at an unrelated Tip',async()=>{
  const original=await fixture();const first=await request(original);expect(first.statusCode).toBe(200);
  const second=await fixture();const settled=await request(second);expect(settled.statusCode).toBe(200);
  const claims=await state.db.paymentTxClaim.findMany();const claim=claims.find(c=>decodeClaim(c.contentId).tipId===first.body.id);const meta=decodeClaim(claim.contentId);
  await state.db.paymentTxClaim.update({where:{txHash:claim.txHash},data:{contentId:TIP_CLAIM_PREFIX+JSON.stringify({...meta,tipId:settled.body.id})}});
  expect((await request(original)).statusCode).toBe(409);expect(state.gateway).toHaveBeenCalledTimes(2);
 });
 it('rejects the reserved tip namespace and a tip claim presented to the unlock route',async()=>{
  const reserved=TIP_CLAIM_PREFIX+JSON.stringify({v:'tip-v1',state:'complete',tipId:'forged'});
  const rejected=await request({contentId:reserved,recipient:payee,price:1},payHandler);expect(rejected.statusCode).toBe(400);expect(state.hosted).not.toHaveBeenCalled();
  const txHash='0x'+'88'.repeat(32);await state.db.paymentTxClaim.create({data:{txHash,contentId:reserved}});
  state.hosted.mockResolvedValue({handled:false,payment:{txHash,recipient:payee,network:'testnet'}});
  const unlock=await request({contentId:'ordinary-unlock',recipient:payee,price:1,paymentRail:'transfer'},payHandler);expect(unlock.statusCode).toBe(402);expect(unlock.body.reason).toBe('txhash-claimed-elsewhere');expect(await state.db.tip.count()).toBe(0);
 });
 it('enforces real database unique conflicts with Prisma P2002',async()=>{
  await state.db.paymentTxClaim.create({data:{txHash:'unique-fixture',contentId:'one'}});
  await expect(state.db.paymentTxClaim.create({data:{txHash:'unique-fixture',contentId:'two'}})).rejects.toMatchObject({code:'P2002'});
 });
 it('returns the same receipt ID after a completed response is lost, without settlement replay',async()=>{
  const body=await fixture();const first=await request(body);expect(first.statusCode).toBe(200);
  const retry=await request(body);expect(retry.statusCode).toBe(200);expect(retry.body.id).toBe(first.body.id);expect(retry.body.replayed).toBe(true);expect(retry.body.receipt).toEqual(first.body.receipt);
  expect(await state.db.tip.count()).toBe(1);expect(state.gateway).toHaveBeenCalledTimes(1);
 });
 it('serializes concurrent first requests and does not resubmit pending settlement',async()=>{
  const entered=deferred(),release=deferred();state.gateway.mockImplementation(async()=>{entered.resolve();await release.promise;return {handled:false,payment:{payer:account.address,paymentId:'synthetic'}};});
  const body=await fixture();const first=request(body);await entered.promise;
  const contenders=await Promise.all(Array.from({length:8},()=>request(body)));
  release.resolve();const complete=await first;expect(contenders.map(r=>[r.statusCode,r.body.code])).toEqual(Array.from({length:8},()=>[409,'payment-verification-pending']));
  expect(state.gateway).toHaveBeenCalledTimes(1);expect(complete.statusCode).toBe(200);
  expect(await state.db.tip.count()).toBe(1);const replay=await request(body);expect(replay.body.id).toBe(complete.body.id);
 });
 it('races eight first reservations through the real unique index with exactly one settlement',async()=>{
  const barrier=deferred();let arrived=0;state.claimGate=async()=>{if(++arrived===8)barrier.resolve();await barrier.promise;};
  const body=await fixture();const responses=await Promise.all(Array.from({length:8},()=>request(body)));state.claimGate=null;
  expect(responses.filter(r=>r.statusCode===200).length).toBeGreaterThanOrEqual(1);expect(responses.every(r=>[200,409].includes(r.statusCode))).toBe(true);
  expect(state.uniqueConflicts).toBe(7);expect(state.gateway).toHaveBeenCalledTimes(1);expect(await state.db.tip.count()).toBe(1);expect(await state.db.paymentTxClaim.count()).toBe(1);
 });
 it('keeps an ambiguous facilitator result pending across retries',async()=>{
  state.gateway.mockRejectedValue(new Error('synthetic lost facilitator response'));const body=await fixture();await request(body);
  const retry=await request(body);expect(retry.statusCode).toBe(409);expect(retry.body.code).toBe('payment-verification-pending');expect(state.gateway).toHaveBeenCalledTimes(1);expect(await state.db.tip.count()).toBe(0);
 });
 it('does not reserve a proof with an invalid real EIP-712 signature',async()=>{
  const body=await fixture();const proof=JSON.parse(Buffer.from(body.paymentSignature,'base64').toString());proof.payload.authorization.from='0x'+'44'.repeat(20);body.paymentSignature=Buffer.from(JSON.stringify(proof)).toString('base64');
  expect((await request(body)).statusCode).toBe(400);expect(await state.db.paymentTxClaim.count()).toBe(0);expect(state.gateway).not.toHaveBeenCalled();
 });
 it('rejects altered binding before another settlement',async()=>{
  const body=await fixture();expect((await request(body)).statusCode).toBe(200);
  const altered=await request({...body,contentUrl:'https://synthetic.example/other'});expect(altered.statusCode).toBe(409);expect(altered.body.code).toBe('payment-proof-already-used');expect(state.gateway).toHaveBeenCalledTimes(1);expect(await state.db.tip.count()).toBe(1);
 });
 it('rolls back Tip insertion when the claim completion update fails inside PostgreSQL',async()=>{
  await state.db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_tip_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic completion failure'; END $$`);
  await state.db.$executeRawUnsafe('CREATE TRIGGER fail_claim_completion BEFORE UPDATE ON "PaymentTxClaim" FOR EACH ROW EXECUTE FUNCTION fail_tip_completion()');
  const body=await fixture();const result=await request(body);expect(result.statusCode).toBe(409);expect(result.body.code).toBe('payment-verification-pending');expect(await state.db.tip.count()).toBe(0);
  const claims=await state.db.paymentTxClaim.findMany();expect(claims).toHaveLength(1);expect(decodeClaim(claims[0].contentId).state).toBe('pending');
  await state.db.$executeRawUnsafe('DROP TRIGGER fail_claim_completion ON "PaymentTxClaim"');
  expect((await request(body)).body.code).toBe('payment-verification-pending');expect(state.gateway).toHaveBeenCalledTimes(1);
 });
 it('serializes claim/refund work across replicas with the durable domain index',async()=>{
  const attempts=await Promise.allSettled(Array.from({length:8},(_,i)=>state.db.tipDomainOperation.create({data:{domain:'creator.example',network:'testnet',operation:i%2?'refund':'claim'}})));
  expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(attempts.filter(x=>x.status==='rejected'&&x.reason?.code==='P2002')).toHaveLength(7);
 });
 it('keeps a crash-era reservation visible to a fresh Prisma client',async()=>{
  const row=await state.db.tipDomainOperation.create({data:{domain:'crash.example',network:'testnet',operation:'refund',state:'submitted',transactionHash:'0xsynthetic'}});
  const {PrismaClient}=createRequire(import.meta.url)(process.env.NIBGATE_INTEGRATION_PRISMA_CLIENT);
  const fresh=new PrismaClient({datasources:{db:{url:process.env.NIBGATE_INTEGRATION_DATABASE_URL}}});
  try{expect(await fresh.tipDomainOperation.findUnique({where:{id:row.id}})).toMatchObject({state:'submitted',transactionHash:'0xsynthetic'});}
  finally{await fresh.$disconnect();}
 });
 it('accepts a refund authorization digest only once under concurrency',async()=>{
  const data={digest:'a'.repeat(64),network:'testnet',domain:'creator.example',wallet:account.address.toLowerCase(),amountUnits:'2000000',expiresAt:new Date(Date.now()+60000)};
  const attempts=await Promise.allSettled(Array.from({length:8},()=>state.db.tipRefundAuthorization.create({data})));
  expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(attempts.filter(x=>x.status==='rejected'&&x.reason?.code==='P2002')).toHaveLength(7);
 });
 it('atomically preserves a partial held balance and replay receipt link',async()=>{
  const original=await state.db.tip.create({data:{contentUrl:'https://creator.example/post',domain:'creator.example',amount:5,network:'testnet',payerWallet:account.address.toLowerCase(),status:'held'}});
  const operation=await state.db.tipDomainOperation.create({data:{domain:'creator.example',network:'testnet',operation:'refund',state:'confirmed',transactionHash:'0xrefund'}});
  const authorization=await state.db.tipRefundAuthorization.create({data:{digest:'b'.repeat(64),network:'testnet',domain:'creator.example',wallet:account.address.toLowerCase(),amountUnits:'2000000',expiresAt:new Date(Date.now()+60000)}});
  const refund=await state.db.$transaction(async tx=>{
   await tx.tip.update({where:{id:original.id},data:{amount:3}});
   await tx.tip.create({data:{contentUrl:original.contentUrl,domain:original.domain,amount:2,network:'testnet',payerWallet:original.payerWallet,status:'refunded',paymentProvider:'refund-slice',txHash:'0xrefund'}});
   const row=await tx.tip.create({data:{contentUrl:original.contentUrl,domain:original.domain,amount:-2,network:'testnet',payerWallet:original.payerWallet,status:'refunded',paymentProvider:'refund',txHash:'0xrefund'}});
   await tx.tipRefundAuthorization.update({where:{digest:authorization.digest},data:{refundTipId:row.id}});
   await tx.tipDomainOperation.delete({where:{id:operation.id}});return row;
  });
  expect((await state.db.tip.findUnique({where:{id:original.id}})).amount).toBe(3);
  expect((await state.db.tipRefundAuthorization.findUnique({where:{digest:authorization.digest}})).refundTipId).toBe(refund.id);
  expect(await state.db.tipDomainOperation.count()).toBe(0);
  expect((await state.db.tip.aggregate({_sum:{amount:true}}))._sum.amount).toBe(3);
 });
 it('rolls back partial accounting and retains confirmed evidence on finalization failure',async()=>{
  const original=await state.db.tip.create({data:{contentUrl:'https://creator.example/post',domain:'creator.example',amount:5,network:'testnet',payerWallet:account.address.toLowerCase(),status:'held'}});
  const operation=await state.db.tipDomainOperation.create({data:{domain:'creator.example',network:'testnet',operation:'refund',state:'confirmed',transactionHash:'0xrefund'}});
  const authorization=await state.db.tipRefundAuthorization.create({data:{digest:'c'.repeat(64),network:'testnet',domain:'creator.example',wallet:account.address.toLowerCase(),amountUnits:'2000000',expiresAt:new Date(Date.now()+60000)}});
  await state.db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_refund_finalize() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic refund finalization failure'; END $$`);
  await state.db.$executeRawUnsafe('CREATE TRIGGER fail_refund_finalization BEFORE UPDATE ON "TipRefundAuthorization" FOR EACH ROW EXECUTE FUNCTION fail_refund_finalize()');
  await expect(state.db.$transaction(async tx=>{await tx.tip.update({where:{id:original.id},data:{amount:3}});const row=await tx.tip.create({data:{contentUrl:original.contentUrl,amount:-2,status:'refunded'}});await tx.tipRefundAuthorization.update({where:{digest:authorization.digest},data:{refundTipId:row.id}});await tx.tipDomainOperation.delete({where:{id:operation.id}});})).rejects.toThrow(/synthetic refund finalization failure/);
  expect((await state.db.tip.findUnique({where:{id:original.id}})).amount).toBe(5);
  expect(await state.db.tip.count()).toBe(1);
  expect(await state.db.tipDomainOperation.findUnique({where:{id:operation.id}})).toMatchObject({state:'confirmed',transactionHash:'0xrefund'});
  expect((await state.db.tipRefundAuthorization.findUnique({where:{digest:authorization.digest}})).refundTipId).toBeNull();
 });
});
