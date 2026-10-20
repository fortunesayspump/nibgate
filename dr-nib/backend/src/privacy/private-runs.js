import {Router} from 'express';
import {db} from '../db.js';
import {privateRunCreateAdmission} from './private-run-admission.js';

const unavailable=(_req,res)=>res.status(503).json({code:'PRIVATE_MODE_UNAVAILABLE'});

/** Only opaque project metadata is created on the ordinary API host. The
 * research question remains on the client until a measured guest is verified.
 * The route stays closed until the broker/guest pipeline is deployed. */
export function createPrivateRunsRouter({store=db,enabled=()=>process.env.DRNIB_PRIVATE_ENABLED==='true',ready=async()=>false,
  allowedTenantId,createLimit=async()=>({ok:false}),authenticate=unavailable}={}){
  const router=Router();
  // Unmatched broker paths must not make a redundant Hub auth round trip.
  router.post('/runs',(req,res,next)=>authenticate(req,res,next),async(req,res)=>{
    try{
      if(!enabled())return res.status(503).json({code:'PRIVATE_MODE_UNAVAILABLE'});
      const admitted=await privateRunCreateAdmission({user:req.user,body:req.body,allowedTenantId,createLimit,ready});
      if(admitted.status!==200)return res.status(admitted.status).json({code:admitted.code});
      const row=await store.researchRun.create({data:{userId:req.user.id,walletAddress:req.user.walletAddress||null,title:null,description:null,brief:{encrypted:true},metadata:{privacyMode:'confidential',schemaVersion:1},status:'draft'}});
      return res.status(201).json({id:row.id,tenantId:row.userId,status:'draft'});
    }catch{return res.status(503).json({code:'PRIVATE_MODE_UNAVAILABLE'})}
  });
  return router;
}
