import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Router } from 'express';
import { validEnvelope, createPrivateRecordsRouter } from './private-record-routes.js';
import { createPrivateBrokerRouter } from './private-broker.js';
import { ciphertextDigest } from './ciphertext-digest.js';
import { privateTenantAllowed } from './private-tenant-access.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const hash=v=>createHash('sha256').update(v).digest('hex');
const fault=(status,code)=>Object.assign(Error(code),{status,code});
const options={timeout:20000,maxWait:5000};
const lock=async(tx,key)=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS locked`;};
export function guestPlanningSettings(env=process.env){
 const bounded=(name,fallback,max)=>{const n=Number(env[name]??fallback);if(!Number.isSafeInteger(n)||n<1||n>max)throw Error('GUEST_PLANNING_CONFIG_INVALID');return n;};
 const trustedProxyAddresses=(env.DRNIB_GUEST_TRUSTED_PROXY_IPS??'').split(',').map(v=>v.trim()).filter(Boolean);
 if(trustedProxyAddresses.length>16||trustedProxyAddresses.some(v=>!isIP(v)))throw Error('GUEST_PLANNING_PROXY_CONFIG_INVALID');
 return {trustedProxyAddresses,recordsEnabled:env.DRNIB_PRIVATE_RECORDS_ENABLED==='true',enabled:env.DRNIB_GUEST_PLANNING_ENABLED==='true',workerReviewed:env.DRNIB_GUEST_WORKER_REVIEWED==='true',maxCostMicroUsd:bounded('DRNIB_GUEST_MAX_COST_MICRO_USD',100000,100000),maxSessionsPerDay:bounded('DRNIB_GUEST_MAX_SESSIONS_PER_DAY',100,1000),maxSessionsPerIpHour:bounded('DRNIB_GUEST_MAX_SESSIONS_PER_IP_HOUR',3,10),maxActions:16,maxReplans:3,planTtlMs:1800000,ttlMs:7200000,maxRequests:4096};
}
/** Only configured exact transport peers may supply a forwarding chain. Walk
 * from the transport end and stop at the first untrusted address, never use
 * Express req.ip (the app's generic trust-proxy setting is not this policy). */
export function guestNetworkIdentity(req,settings){
 const normalize=value=>value?.startsWith('::ffff:')&&isIP(value.slice(7))===4?value.slice(7):String(value??'').toLowerCase();
 const peer=normalize(req.socket?.remoteAddress),trusted=new Set((settings.trustedProxyAddresses??[]).map(normalize));
 if(!isIP(peer)||!trusted.has(peer))return peer||'unknown';
 const raw=req.get('x-forwarded-for');
 if(typeof raw!=='string'||raw.length>2048)return peer;
 const chain=raw.split(',').map(v=>normalize(v.trim()));
 if(!chain.length||chain.length>16||chain.some(v=>!isIP(v)))return peer;
 chain.push(peer);let i=chain.length-1;while(i>=0&&trusted.has(chain[i]))i--;
 return i<0?peer:chain[i];
}
export function validGuestOrigin(req,origins){
 // Same-origin frontend proxies preserve Origin. Never trust arbitrary forwarded
 // host/IP headers: deployment must explicitly allow the browser origin.
 return typeof req.get('origin')==='string'&&origins.includes(req.get('origin'))&&req.get('sec-fetch-site')!=='cross-site'&&req.is('application/json');
}
export function createGuestPlanningService({store,settings,now=Date.now}){
 async function rate(tx,id,limit,expiresAt){const value=await tx.guestPlanningRateWindow.upsert({where:{id},create:{id,count:1,expiresAt},update:{count:{increment:1}}});if(value.count>limit)throw fault(429,'GUEST_RATE_LIMIT');}
 async function session(tx,token,{claimed=false,expired=false}={}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fault(401,'GUEST_SESSION_REQUIRED');
  const row=await tx.guestPlanningSession.findUnique({where:{tokenHash:hash(token)}});
  if(!row||!expired&&new Date(row.expiresAt).getTime()<=now()||!claimed&&row.status!=='active')throw fault(401,'GUEST_SESSION_EXPIRED');
  return row;
 }
 return {
  async issue(networkIdentity){
   const token=randomBytes(32).toString('hex'),id=randomUUID(),runId=randomUUID(),vaultId=randomUUID(),expiresAt=new Date(now()+settings.ttlMs);
   const policy={sessionId:id,expiresAt:expiresAt.toISOString(),maxActions:settings.maxActions,maxReplans:settings.maxReplans,maxCostMicroUsd:settings.maxCostMicroUsd,planTtlMs:settings.planTtlMs,frozen:false,adopted:false};
   await store.$transaction(async tx=>{
    await lock(tx,'guest-planning:issuance');
    // Bound ciphertext retention without discarding accounting receipts. The
    // compute lease expired days ago; token removal prevents later adoption.
    await tx.guestPlanningRateWindow.deleteMany({where:{expiresAt:{lt:new Date(now())}}});
    const old=await tx.guestPlanningSession.findMany({where:{expiresAt:{lt:new Date(now()-7*86400000)}},take:20});
    for(const item of old){
     await tx.privateClientObject.deleteMany({where:{runId:item.runId}});
     await tx.privateVaultRecord.deleteMany({where:{userId:item.tenantId}});
     await tx.researchRun.updateMany({where:{id:item.runId},data:{deletedAt:new Date(now())}});
     await tx.guestPlanningSession.deleteMany({where:{id:item.id}});
    }
    const day=Math.floor(now()/86400000),hour=Math.floor(now()/3600000);
    await rate(tx,`guest:day:${day}`,settings.maxSessionsPerDay,new Date((day+2)*86400000));
    await rate(tx,`guest:ip:${hash(String(networkIdentity))}:${hour}`,settings.maxSessionsPerIpHour,new Date((hour+2)*3600000));
    await tx.guestPlanningSession.create({data:{id,tokenHash:hash(token),tenantId:`guest:${id}`,runId,vaultId,expiresAt,policy}});
   },options);
   return {token,sessionId:id,tenantId:`guest:${id}`,runId,vaultId,expiresAt:expiresAt.toISOString(),limits:policy};
  },
  async authorize(token,{adoption=false,read=false}={}){
   return store.$transaction(async tx=>{
    const row=await session(tx,token,{claimed:adoption||read,expired:adoption||read});
    if(!adoption&&row.status==='adopted')throw fault(401,'GUEST_SESSION_ADOPTED');
    await lock(tx,`guest:requests:${row.id}`);
    const updated=await tx.guestPlanningSession.update({where:{id:row.id},data:{requests:{increment:1}}});
    if(updated.requests>settings.maxRequests&&!adoption&&!(read&&row.status==='claimed'))throw fault(429,'GUEST_REQUEST_LIMIT');
    const minute=Math.floor(now()/60000),saving=adoption||read&&row.status==='claimed';
    // Saving a quiescent draft is independent of exhausted guest operation
    // quotas, but has its own bounded window (and account auth at adoption).
    await rate(tx,`guest:${saving?'adoption':'request'}:${row.id}:${minute}`,saving?30:90,new Date((minute+2)*60000));
    return row;
   },options);
  },
  async bootstrap(token,b){
   return store.$transaction(async tx=>{
    const g=await session(tx,token);await lock(tx,g.runId);
    if(!exact(b,'manifestEnvelope,manifestId,projectKeysEnvelope,vaultRecoveryEnvelope')||!UUID.test(b.manifestId)||b.manifestId===g.runId||
     !validEnvelope(b.vaultRecoveryEnvelope,{tenantId:g.tenantId,vaultId:g.vaultId,runId:null,kind:'vault-recovery',revision:1})||
     !validEnvelope(b.projectKeysEnvelope,{tenantId:g.tenantId,vaultId:g.vaultId,runId:g.runId,kind:'project-keys',revision:1})||
     !validEnvelope(b.manifestEnvelope,{tenantId:g.tenantId,vaultId:g.vaultId,runId:g.runId,objectId:b.manifestId,kind:'manifest',revision:1}))throw fault(400,'GUEST_BOOTSTRAP_INVALID');
    const prior=await tx.researchRun.findUnique({where:{id:g.runId}});
    if(prior){const objects=await tx.privateClientObject.findMany({where:{runId:g.runId,kind:{in:['manifest','project-keys']},removed:false}});if(objects.length!==2||objects.some(o=>o.digest!==ciphertextDigest(o.kind==='manifest'?b.manifestEnvelope:b.projectKeysEnvelope)))throw fault(409,'GUEST_BOOTSTRAP_CONFLICT');return {id:g.runId,tenantId:g.tenantId};}
    await tx.privateVaultRecord.create({data:{userId:g.tenantId,vaultId:g.vaultId,recoveryEnvelope:b.vaultRecoveryEnvelope}});
    await tx.researchRun.create({data:{id:g.runId,userId:g.tenantId,walletAddress:null,title:null,description:null,brief:{encrypted:true},status:'draft',metadata:{privacyMode:'confidential',schemaVersion:1,guestPlanning:g.policy}}});
    for(const [kind,objectId,envelope] of [['project-keys',g.runId,b.projectKeysEnvelope],['manifest',b.manifestId,b.manifestEnvelope]])await tx.privateClientObject.create({data:{runId:g.runId,vaultId:g.vaultId,objectId,kind,revision:1,envelope,digest:ciphertextDigest(envelope)}});
    return {id:g.runId,tenantId:g.tenantId};
   },options);
  },
  async prepare(token,user,adoptionId){
   if(!UUID.test(adoptionId))throw fault(400,'GUEST_ADOPTION_INVALID');
   return store.$transaction(async tx=>{
    let g=await session(tx,token,{claimed:true,expired:true});await lock(tx,g.runId);g=await session(tx,token,{claimed:true,expired:true});
    if(g.adoption){
     if(g.adoption.userId!==user.id||g.adoption.adoptionId!==adoptionId)throw fault(409,'GUEST_ADOPTION_CLAIMED');
     if(g.adoption.state==='committed')return {state:'committed',id:g.adoption.targetRunId,tenantId:user.id,adoptionId};
     if(new Date(g.adoption.expiresAt).getTime()<=now()){
      const a=g.adoption,run=await tx.researchRun.findUnique({where:{id:g.runId}}),manifest=await tx.privateClientObject.findUnique({where:{runId_objectId:{runId:g.runId,objectId:a.manifestId}}});
      if(g.status!=='claimed'||!run?.metadata?.guestPlanning?.frozen||run.metadata.guestPlanning.adopted||!manifest||manifest.revision!==a.manifestRevision||manifest.digest!==a.manifestDigest||await tx.privateActionReceipt.count({where:{runId:g.runId,status:{in:['processing','uncertain']}}}))throw fault(409,'GUEST_ADOPTION_CONFLICT');
      // Crash/redirect recovery renews only the same frozen intent and target.
      // No new target, account, plaintext, model call or money authorization.
      const renewed={...a,expiresAt:new Date(now()+1800000).toISOString()};
      await tx.guestPlanningSession.update({where:{id:g.id},data:{adoption:renewed}});return renewed;
     }
     return g.adoption;
    }
    // Expired sessions can still save already completed ciphertext, never infer.
    const run=await tx.researchRun.findUnique({where:{id:g.runId}});
    if(!run||run.userId!==g.tenantId||run.deletedAt||!['draft','planned'].includes(run.status)||await tx.privateActionReceipt.count({where:{runId:g.runId,status:{in:['processing','uncertain']}}}))throw fault(409,'GUEST_ACTION_UNRESOLVED');
    const manifest=await tx.privateClientObject.findFirst({where:{runId:g.runId,kind:'manifest',removed:false}});
    if(!manifest||manifest.objectKey||await tx.privateClientObject.count({where:{runId:g.runId,kind:'source',removed:false}}))throw fault(409,'GUEST_ADOPTION_INVALID');
    const adoption={state:'prepared',adoptionId,userId:user.id,tenantId:user.id,sourceRunId:g.runId,sourceVaultId:g.vaultId,manifestId:manifest.objectId,manifestRevision:manifest.revision,manifestDigest:manifest.digest,targetRunId:randomUUID(),expiresAt:new Date(now()+1800000).toISOString(),guestPlan:run.metadata?.guestPlan??null};
    await tx.researchRun.update({where:{id:g.runId},data:{metadata:{...run.metadata,guestPlanning:{...run.metadata.guestPlanning,frozen:true}}}});
    await tx.guestPlanningSession.update({where:{id:g.id},data:{status:'claimed',adoption}});return adoption;
   },options);
  },
  async cancel(token,user,adoptionId){return store.$transaction(async tx=>{
   let g=await session(tx,token,{claimed:true,expired:true});await lock(tx,g.runId);g=await session(tx,token,{claimed:true,expired:true});
   if(g.adoption?.userId!==user.id||g.adoption?.adoptionId!==adoptionId||g.adoption?.state!=='prepared')throw fault(409,'GUEST_ADOPTION_CONFLICT');
   const run=await tx.researchRun.findUnique({where:{id:g.runId}});await tx.researchRun.update({where:{id:g.runId},data:{metadata:{...run.metadata,guestPlanning:{...run.metadata.guestPlanning,frozen:false}}}});
   await tx.guestPlanningSession.update({where:{id:g.id},data:{status:'active',adoption:null}});return {cancelled:true};
  },options);},
  async commit(token,user,b){return store.$transaction(async tx=>{
   let g=await session(tx,token,{claimed:true,expired:true});await lock(tx,g.runId);g=await session(tx,token,{claimed:true,expired:true});
   const a=g.adoption;if(!a||a.userId!==user.id||a.adoptionId!==b?.adoptionId)throw fault(409,'GUEST_ADOPTION_CONFLICT');
   if(a.state==='committed')return {state:'committed',id:a.targetRunId,tenantId:user.id,adoptionId:a.adoptionId};
   if(new Date(a.expiresAt).getTime()<=now())throw fault(409,'GUEST_ADOPTION_EXPIRED');
   if(!exact(b,'adoptionId,expectedVaultRevision,id,manifestEnvelope,manifestId,projectKeysEnvelope,vaultId')||b.id!==a.targetRunId||![b.id,b.manifestId,b.vaultId].every(v=>UUID.test(v))||b.id===b.manifestId||
    !validEnvelope(b.projectKeysEnvelope,{tenantId:user.id,vaultId:b.vaultId,runId:b.id,kind:'project-keys',revision:1})||!validEnvelope(b.manifestEnvelope,{tenantId:user.id,vaultId:b.vaultId,runId:b.id,objectId:b.manifestId,kind:'manifest',revision:1}))throw fault(400,'GUEST_ADOPTION_INVALID');
   await lock(tx,user.id);
   const vault=await tx.privateVaultRecord.findUnique({where:{userId:user.id}}),source=await tx.privateClientObject.findUnique({where:{runId_objectId:{runId:g.runId,objectId:a.manifestId}}}),run=await tx.researchRun.findUnique({where:{id:g.runId}});
   if(!['draft','planned'].includes(run?.status)||!vault||vault.vaultId!==b.vaultId||vault.revision!==b.expectedVaultRevision||!source||source.revision!==a.manifestRevision||source.digest!==a.manifestDigest||!run?.metadata?.guestPlanning?.frozen||await tx.privateActionReceipt.count({where:{runId:g.runId,status:{in:['processing','uncertain']}}}))throw fault(409,'GUEST_ADOPTION_CONFLICT');
   if(await tx.researchRun.count({where:{userId:user.id,deletedAt:null,metadata:{path:['privacyMode'],equals:'confidential'}}})>=100)throw fault(429,'PRIVATE_LIMIT');
   const metadata={privacyMode:'confidential',schemaVersion:1,guestAdoption:{adoptionId:a.adoptionId,sourceRunId:g.runId,sourceManifestDigest:a.manifestDigest,validationRequired:Boolean(a.guestPlan)},...(a.guestPlan?{guestPlan:a.guestPlan}:{})};
   await tx.researchRun.create({data:{id:b.id,userId:user.id,walletAddress:user.walletAddress??null,title:null,description:null,brief:{encrypted:true},status:run.status,budgetCap:run.budgetCap,metadata}});
   for(const [kind,objectId,envelope] of [['project-keys',b.id,b.projectKeysEnvelope],['manifest',b.manifestId,b.manifestEnvelope]])await tx.privateClientObject.create({data:{runId:b.id,vaultId:b.vaultId,objectId,kind,revision:1,envelope,digest:ciphertextDigest(envelope)}});
   await tx.researchRun.update({where:{id:g.runId},data:{metadata:{...run.metadata,guestPlanning:{...run.metadata.guestPlanning,frozen:true,adopted:true}}}});
   await tx.guestPlanningSession.update({where:{id:g.id},data:{status:'adopted',adoption:{...a,state:'committed'}}});
   return {state:'committed',id:b.id,tenantId:user.id,adoptionId:a.adoptionId};
  },options);},
 };
}

export function createGuestPlanningRouter({store,storage,broker,authenticate,settings=guestPlanningSettings(),allowedOrigins=[]}){
 const router=Router(),service=createGuestPlanningService({store,settings});
 const ready=async()=>settings.enabled&&settings.recordsEnabled&&settings.workerReviewed&&broker.accessMode==='authenticated'&&await broker.ready()===true&&await broker.workflowReady()===true&&typeof broker.guestPlanningReady==='function'&&await broker.guestPlanningReady()===true;
 const sendError=(res,error)=>res.status(error?.status??503).json({code:error?.code??'GUEST_PLANNING_UNAVAILABLE'});
 const token=req=>{const a=req.get('authorization')??'';return a.startsWith('Bearer ')?a.slice(7):'';};
 router.get('/capabilities',async(_req,res)=>{res.set('Cache-Control','no-store');try{const enabled=await ready();res.json({enabled,guestPlanning:enabled,textOnly:true,limits:{maxActions:settings.maxActions,maxReplans:settings.maxReplans,maxCostMicroUsd:settings.maxCostMicroUsd,ttlMs:settings.ttlMs,planTtlMs:settings.planTtlMs}});}catch{res.json({enabled:false,guestPlanning:false,textOnly:true});}});
 router.use(async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{if(!settings.enabled)throw fault(503,'GUEST_PLANNING_UNAVAILABLE');if(req.method!=='GET'&&!validGuestOrigin(req,allowedOrigins))throw fault(403,'GUEST_ORIGIN_REJECTED');next();}catch(e){sendError(res,e);}});
 router.post('/session',async(req,res)=>{try{if(!exact(req.body,'')||!await ready())throw fault(503,'GUEST_PLANNING_UNAVAILABLE');res.status(201).json(await service.issue(guestNetworkIdentity(req,settings)));}catch(e){sendError(res,e);}});
 router.use(async(req,res,next)=>{try{req.guestPlanning=await service.authorize(token(req),{adoption:req.path.startsWith('/adoption/'),read:req.method==='GET'});next();}catch(e){sendError(res,e);}});
 router.post('/bootstrap',async(req,res)=>{try{res.status(201).json(await service.bootstrap(token(req),req.body));}catch(e){sendError(res,e);}});
 for(const name of ['prepare','commit','cancel'])router.post('/adoption/'+name,(req,res,next)=>authenticate(req,res,next),async(req,res)=>{try{if(!privateTenantAllowed(req.user?.id,broker)||req.user.id.startsWith('guest:'))throw fault(403,'GUEST_ACCOUNT_REQUIRED');if(name!=='commit'&&!exact(req.body,'adoptionId'))throw fault(400,'GUEST_ADOPTION_INVALID');const result=name==='commit'?await service.commit(token(req),req.user,req.body):await service[name](token(req),req.user,req.body.adoptionId);res.json(result);}catch(e){sendError(res,e);}});
 // A verified anonymous capability only enters this narrow route allowlist.
 // It never reaches ordinary private account, upload, funding or execute APIs.
 router.use(async(req,res,next)=>{
  const g=req.guestPlanning,id=g.runId;
  const record=req.method==='GET'&&(['/identity','/vault'].includes(req.path)||new RegExp(`^/runs/${id}/(?:objects(?:/[0-9a-f-]{36})?|actions(?:/[0-9a-f-]{36})?)$`).test(req.path));
  const wake=['GET','POST'].includes(req.method)&&req.path===`/runs/${id}/wake`;
  const sessionPost=req.method==='POST'&&(req.path==='/sessions'||/^\/sessions\/[0-9a-f-]{36}\/(prove|action)$/.test(req.path))&&req.body?.runId===id;
  if(!record&&!wake&&!sessionPost)return res.status(403).json({code:'GUEST_CAPABILITY_DENIED'});
  if(req.method!=='GET'&&g.status!=='active')return res.status(409).json({code:'GUEST_ADOPTION_FROZEN'});
  if(req.method!=='GET'){try{if(!await ready())return res.status(503).json({code:'GUEST_PLANNING_UNAVAILABLE'});}catch{return res.status(503).json({code:'GUEST_PLANNING_UNAVAILABLE'});}}
  req.user={id:g.tenantId,walletAddress:null};next();
 });
 const guestAuth=(_req,_res,next)=>next();
 router.use(createPrivateRecordsRouter({store,storage,authenticate:guestAuth,enabled:()=>true,workflowEnabled:()=>true,accessMode:'authenticated'}));
 router.use(createPrivateBrokerRouter({...broker,store,authenticate:guestAuth,accessMode:'authenticated',isOwner:(user,run)=>user?.id===run?.userId&&Boolean(run?.metadata?.guestPlanning),money:null}));
 router.use((_req,res)=>res.status(403).json({code:'GUEST_CAPABILITY_DENIED'}));
 return router;
}
