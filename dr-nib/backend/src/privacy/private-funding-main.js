// Separate from the ciphertext broker and measured document worker. This
// process holds only public payment configuration and the keeper credential.
import '../env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import {db} from '../db.js';
import {escrowConfig,createParams,assertEscrowOperational,jobStatus,submitAndComplete,relaySplit} from '../escrow/jobs.js';
import {createPrivateBrokerAuth} from './private-broker-auth.js';
import {createPrivateFunding,createPrivateFundingRouter} from './private-funding.js';
import {privateKeyToAccount} from 'viem/accounts';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startPrivateSettlementReconciler} from './private-settlement-reconciler.js';
import {createPrivateExternalTools,createPrivateExternalToolsRouter} from './private-external-tools.js';
import {createPrivateExternalExecutor} from './private-external-executor.js';
import {privateFundingListener} from './private-listener.js';

export function createPrivateFundingApp({store=db,env=process.env,funding,authenticate}={}){
 const app=express();app.use(express.json({limit:'24kb'}));app.use(cookieParser());
 const enabled=env.DRNIB_PRIVATE_PAYMENTS_ENABLED==='true';
 if(enabled&&!funding){
  const cfg=escrowConfig(env),operator=env.ESCROW_OPERATOR;
  funding=createPrivateFunding({db:store,settings:{core:cfg.core,splitter:cfg.splitter,evaluator:privateKeyToAccount(cfg.keeperKey).address,token:cfg.chain.usdc,operator},
   prepare:async args=>{await assertEscrowOperational({env});return createParams(args,{env})},readJob:id=>jobStatus(id,{env}),
   completeAndSplit:async args=>{const completed=await submitAndComplete(args,{env}),split=await relaySplit(args,{env});return {...completed,...split,splitConfirmed:!!split.splitTx||split.alreadySplit===true};}});
 }
 app.get('/health',(_req,res)=>res.json({ok:true,payments:enabled&&!!funding,externalTools:enabled&&env.DRNIB_PRIVATE_EXTERNAL_TOOLS_ENABLED==='true',paidToolsTestnet:enabled&&env.DRNIB_PRIVATE_EXTERNAL_TOOLS_ENABLED==='true'&&env.DRNIB_PRIVATE_PAID_TOOLS_ENABLED==='true'&&env.DRNIB_NETWORK==='testnet'&&/^0x[0-9a-f]{64}$/i.test(env.DRNIB_AGENT_PRIVATE_KEY??''),mode:'private-funding-only'}));
 if(enabled)app.use('/v1/private',createPrivateFundingRouter({funding,authenticate:authenticate??createPrivateBrokerAuth({env}),allowedTenantId:env.DRNIB_PRIVATE_TEST_TENANT_ID}));
 if(enabled&&env.DRNIB_PRIVATE_EXTERNAL_TOOLS_ENABLED==='true')app.use('/v1/private',createPrivateExternalToolsRouter({tools:createPrivateExternalTools({db:store,execute:createPrivateExternalExecutor({env})}),authenticate:authenticate??createPrivateBrokerAuth({env}),allowedTenantId:env.DRNIB_PRIVATE_TEST_TENANT_ID}));
 app.use((_req,res)=>res.status(503).json({code:'PRIVATE_FUNDING_UNAVAILABLE'}));
 app.locals.startSettlementReconciler=()=>enabled&&funding?startPrivateSettlementReconciler({db:store,funding,tenantId:env.DRNIB_PRIVATE_TEST_TENANT_ID,onError:(code,error)=>console.warn(code,/^P\d{4}$/.test(error?.code??'')?error.code:'retryable')}):()=>{};
 return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const {port,host}=privateFundingListener();const app=createPrivateFundingApp();app.listen(port,host,()=>{app.locals.startSettlementReconciler();console.log('Private funding boundary ready');});}
 catch{console.error('Private funding boundary unavailable');process.exitCode=1;}
}
