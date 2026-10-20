// Separate test-broker entrypoint. It deliberately does not import the normal
// server, queue, worker, retrieval, export, object-store, escrow, payment or
// settlement modules.
import '../env.js';

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import {config} from '../env.js';
import {db} from '../db.js';
import {createPrivateRecordsRouter} from './private-record-routes.js';
import {createPrivateRecordStorage} from './private-record-storage.js';
import {createPrivateRunsRouter} from './private-runs.js';
import {createPrivateBrokerRouter} from './private-broker.js';
import {configuredPrivateBroker} from './private-broker-config.js';
import {createPrivateBrokerAuth} from './private-broker-auth.js';

export async function createPrivateBrokerOnlyApp({store=db,broker,privateWakeController}={}){
  if(process.env.DRNIB_PRIVATE_BROKER_ONLY!=='true')throw new Error('Private broker-only mode required');
  const privateBroker=broker??await configuredPrivateBroker(process.env,{wakeController:privateWakeController});
  const authenticate=createPrivateBrokerAuth();
  const createLimit=async userId=>{
    const count=await store.researchRun.count({where:{userId,metadata:{path:['privacyMode'],equals:'confidential'},deletedAt:null}});
    return {ok:count<20};
  };
  const app=express();
  app.set('trust proxy',true);
  app.use(express.json({limit:'5mb'}));
  app.use(cors({origin:config.corsOrigins,credentials:true}));
  app.use(cookieParser());
  app.get('/health',(_req,res)=>res.json({ok:true,mode:'private-broker-only',privateEnabled:process.env.DRNIB_PRIVATE_ENABLED==='true'}));
  app.use('/v1/private',createPrivateRecordsRouter({store:store,storage:createPrivateRecordStorage(),authenticate:authenticate,
    enabled:()=>process.env.DRNIB_PRIVATE_RECORDS_ENABLED==='true',workflowEnabled:()=>process.env.DRNIB_PRIVATE_WORKFLOW_ENABLED==='true',publicRetrievalEnabled:()=>process.env.DRNIB_PRIVATE_WEB_ENABLED==='true',allowedTenantId:privateBroker.allowedTenantId}));
  app.use('/v1/private',createPrivateRunsRouter({store,ready:privateBroker.ready,
    allowedTenantId:privateBroker.allowedTenantId,createLimit,authenticate}));
  app.use('/v1/private',createPrivateBrokerRouter({...privateBroker,store,authenticate,
    isOwner:(user,run)=>Boolean(user)&&Boolean(run)&&user.id===run.userId}));
  app.use((_req,res)=>res.status(404).json({code:'PRIVATE_ROUTE_NOT_FOUND'}));
  app.use((_err,_req,res,_next)=>res.status(503).json({code:'PRIVATE_BROKER_UNAVAILABLE'}));
  return app;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  createPrivateBrokerOnlyApp().then(app=>app.listen(config.port,()=>console.log('[dr-nib-private] broker-only ready')))
    .catch(()=>{console.error('[dr-nib-private] broker-only unavailable');process.exitCode=1});
}
