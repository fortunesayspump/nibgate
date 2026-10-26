import {Router} from 'express';
import {PrismaClient} from '@prisma/client';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let archiveStore;

function configuredStore(){
  if(archiveStore)return archiveStore;
  const raw=process.env.DRNIB_LEGACY_ARCHIVE_DATABASE_URL;
  if(!raw)throw Error('Legacy archive database unavailable');
  const url=new URL(raw);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.railway.internal')||
    url.pathname!=='/railway'||url.searchParams.get('schema')!=='drnib'||
    decodeURIComponent(url.username)!=='drnib_legacy_archive_reader'||url.hash)
    throw Error('Invalid legacy archive database binding');
  archiveStore=new PrismaClient({datasourceUrl:raw});
  return archiveStore;
}

const ordinary=run=>run?.metadata&&typeof run.metadata==='object'&&!Array.isArray(run.metadata)&&
  (!Object.hasOwn(run.metadata,'privacyMode')||run.metadata.privacyMode==='legacy');
const unavailable=res=>res.status(503).json({code:'LEGACY_ARCHIVE_UNAVAILABLE'});

/** Read-only historical plaintext. This route never uses the confidential
 * worker, its vault, model or money paths; a separate SELECT-only DB role
 * protects the old database even if an application route regresses. */
export function createLegacyArchiveRouter({store,authenticate,enabled=()=>false}={}){
  const router=Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');if(!enabled())return res.status(404).json({code:'LEGACY_ARCHIVE_NOT_FOUND'});next()});
  router.use((req,res,next)=>authenticate(req,res,next));
  router.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD')return res.status(405).json({code:'LEGACY_ARCHIVE_READ_ONLY'});next()});
  const db=()=>store??configuredStore();

  router.get('/runs',async(req,res)=>{
    try{
      const rows=await db().researchRun.findMany({where:{userId:req.user.id},orderBy:{updatedAt:'desc'},take:200,
        select:{id:true,userId:true,title:true,brief:true,status:true,createdAt:true,updatedAt:true,settledAt:true,deletedAt:true,metadata:true}});
      return res.json({runs:rows.filter(ordinary).map(({metadata,userId,brief,...run})=>({...run,topic:typeof brief?.topic==='string'?brief.topic:null}))});
    }catch{return unavailable(res)}
  });

  router.get('/runs/:id',async(req,res)=>{
    if(!UUID.test(req.params.id))return res.status(404).json({code:'LEGACY_ARCHIVE_NOT_FOUND'});
    try{
      const run=await db().researchRun.findFirst({where:{id:req.params.id,userId:req.user.id},
        select:{id:true,userId:true,title:true,brief:true,status:true,createdAt:true,updatedAt:true,settledAt:true,deletedAt:true,metadata:true,budgetCap:true}});
      if(!ordinary(run))return res.status(404).json({code:'LEGACY_ARCHIVE_NOT_FOUND'});
      const [reports,ledger]=await Promise.all([
        db().researchReport.findMany({where:{runId:run.id},orderBy:{version:'desc'},take:100,select:{version:true,createdAt:true}}),
        db().budgetLedger.findMany({where:{runId:run.id},orderBy:{createdAt:'asc'},take:1000,select:{kind:true,amount:true,txRef:true,createdAt:true}}),
      ]);
      const {metadata,userId,brief,...summary}=run;
      return res.json({run:{...summary,topic:typeof brief?.topic==='string'?brief.topic:null},reports,ledger});
    }catch{return unavailable(res)}
  });

  router.get('/runs/:id/report',async(req,res)=>{
    if(!UUID.test(req.params.id))return res.status(404).json({code:'LEGACY_ARCHIVE_NOT_FOUND'});
    const version=req.query.version;
    if(version!==undefined&&(typeof version!=='string'||!/^[1-9][0-9]{0,8}$/.test(version)))return res.status(400).json({code:'LEGACY_ARCHIVE_INVALID_VERSION'});
    try{
      const run=await db().researchRun.findFirst({where:{id:req.params.id,userId:req.user.id},select:{id:true,metadata:true}});
      if(!ordinary(run))return res.status(404).json({code:'LEGACY_ARCHIVE_NOT_FOUND'});
      const report=await db().researchReport.findFirst({where:{runId:run.id,...(version?{version:Number(version)}:{})},orderBy:{version:'desc'},
        select:{version:true,markdown:true,citations:true,createdAt:true}});
      return report?res.json({report}):res.status(404).json({code:'LEGACY_ARCHIVE_REPORT_NOT_FOUND'});
    }catch{return unavailable(res)}
  });
  return router;
}
