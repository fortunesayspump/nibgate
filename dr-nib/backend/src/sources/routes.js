import { Router } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { db } from '../db.js';
import * as auth from '../auth.js';
import { parseSource, MAX_SOURCE_BYTES } from './parse.js';
import { sourceStorageConfig, putSource, getSource, deleteSource } from './storage.js';
import { directExtract } from '../retrieval/providers/direct.js';
import { recordEvent } from '../eventlog.js';
import { withRunLock } from '../run-lock.js';
import { config } from '../env.js';
import { assertConventionalPath, isConfidentialRun } from '../privacy/guard.js';
import { createEncryptedSourceAdapter } from '../privacy/encrypted-source.js';
import { verifyRecipientForPrivateSource } from '../privacy/attestation.js';

export const sources = Router({mergeParams:true});
const EDITABLE = ['intake','intake-done','planned'];
const sourceEditable = run => EDITABLE.includes(run.status) && !run.metadata?.escrow?.jobId;
const lockedMessage = 'Sources are locked after an escrow job is opened or research starts. End and start a new project to use different documents.';
export const sourceSummary = row => ({id:row.id,name:row.output.name,bytes:row.output.bytes,characters:row.output.characters,pages:row.output.pages,warnings:row.output.warnings || [],createdAt:row.createdAt,url:row.output.documents[0].url,originalUrl:`/drnib-api/v1/runs/${row.runId}/sources/${row.id}/original`});
async function owner(req,res) {
  const run=await db.researchRun.findUnique({where:{id:req.params.id}});
  if(!run || !auth.isOwner(req.user,run) || run.deletedAt) {res.status(404).json({error:'project not found'});return null}
  try { assertConventionalPath(run); }
  catch (error) { res.status(error.status).json({error:error.message,code:error.code}); return null; }
  return run;
}
async function confidentialOwner(req,res) {
  const run=await db.researchRun.findUnique({where:{id:req.params.id}});
  if (!run || !auth.isOwner(req.user,run) || run.deletedAt) {res.status(404).json({error:'project not found'});return null;}
  if (!isConfidentialRun(run)) {res.status(409).json({error:'Project is not a confidential run.'});return null;}
  return run;
}
const encryptedSources=createEncryptedSourceAdapter({
  verifyRecipient:verifyRecipientForPrivateSource,
  storage:{put:putSource,remove:deleteSource},
  repository:{create:async(run,item)=>withRunLock(run.id,async tx=>{
    const current=await tx.researchRun.findUniqueOrThrow({where:{id:run.id}});
    if (!isConfidentialRun(current) || !sourceEditable(current)) throw Object.assign(new Error(lockedMessage),{status:409});
    if (await tx.researchStep.count({where:{runId:run.id,kind:'input',status:'done'}})>=5) throw Object.assign(new Error('A project supports up to 5 supplied sources.'),{status:409});
    await tx.researchStep.create({data:{id:item.id,runId:run.id,kind:'input',status:'done',endedAt:new Date(),output:{encrypted:true,format:'sealed-source-hpke-v2',key:item.key,sha256:item.sha256,bytes:item.bytes,recipientId:item.recipientId}}});
  })},
});
sources.get('/',async(req,res,next)=>{
  try {
    const run=await owner(req,res);if(!run)return;
    const rows=await db.researchStep.findMany({where:{runId:run.id,kind:'input',status:'done'},orderBy:{createdAt:'asc'}});
    res.json({storageReady:Boolean(sourceStorageConfig()),editable:sourceEditable(run),maxFiles:5,maxBytes:MAX_SOURCE_BYTES,sources:rows.map(sourceSummary)});
  }catch(e){next(e)}
});
export async function attachSource(run,body) {
    // attachSource is also called directly from elsewhere; guard before URL
    // fetch, base64 decode, parsing, R2 storage or checkpoint creation.
    assertConventionalPath(run);
    if(!sourceEditable(run))throw Object.assign(new Error(lockedMessage),{status:409});
    if(!sourceStorageConfig())throw Object.assign(new Error('Private R2 uploads are temporarily unavailable. Your file was not stored.'),{status:503});
    if(await db.researchStep.count({where:{runId:run.id,kind:'input',status:'done'}})>=5)throw new Error('A project supports up to 5 supplied sources.');
    let name=String(body?.name || '').replace(/[\r\n\\/]/g,'_').slice(0,160), buffer, parsed;
    if(body?.url) {
      const url=new URL(String(body.url));
      if(url.protocol!=='https:' || url.username || url.password)throw new Error('Use a public HTTPS URL without credentials.');
      const out=await directExtract({urls:[url.toString()],maxChars:100000});
      const doc=out.documents[0];
      if(!doc?.text)throw new Error(`This link could not be read: ${out.skipped[0]?.reason || 'no text'}.`);
      name=(doc.title || url.hostname).slice(0,150)+'.txt';buffer=Buffer.from(doc.text);
      parsed={text:doc.text,pages:doc.pages || null,characters:doc.text.length,warnings:[],truncated:false};
    } else {
      if(!name || typeof body?.contentBase64!=='string' || body.contentBase64.length>Math.ceil(MAX_SOURCE_BYTES*4/3)+8)throw new Error('Choose a named file no larger than 2 MB.');
      buffer=Buffer.from(body.contentBase64,'base64');
      parsed=await parseSource(name,buffer);
    }
    const id=randomUUID(), key=`${config.network}/${run.id}/${id}`;
    try {await putSource(key,buffer)} catch {throw Object.assign(new Error('Private storage could not accept this file. Please retry.'),{status:503})}
    let row;
    try {
      row=await withRunLock(run.id,async tx=>{
        const current=await tx.researchRun.findUniqueOrThrow({where:{id:run.id}});
        assertConventionalPath(current);
        if(!sourceEditable(current))throw Object.assign(new Error(lockedMessage),{status:409});
        if(await tx.researchStep.count({where:{runId:run.id,kind:'input',status:'done'}})>=5)throw new Error('Project changed while uploading. Retry after checking its status.');
        if(current.status==='planned')await tx.researchRun.update({where:{id:run.id},data:{status:'intake-done',plan:null}});
        return tx.researchStep.create({data:{id,runId:run.id,kind:'input',status:'done',endedAt:new Date(),output:{name,key,bytes:buffer.length,...parsed,documents:[{url:`/drnib-api/v1/runs/${run.id}/sources/${id}`,title:name,text:parsed.text,relevance:1,provider:'user-upload'}]}}});
      });
    } catch(e) {await deleteSource(key).catch(()=>{});throw e}
    await recordEvent(run.id,{type:'source.attached',name,characters:parsed.characters,warnings:parsed.warnings});
    return sourceSummary(row);
}
sources.post('/',async(req,res,next)=>{
  try {
    const run=await owner(req,res);if(!run)return;
    res.status(201).json(await attachSource(run,req.body));
  }catch(e){if(e.status || e.name==='Error' || e.name==='TypeError')return res.status(e.status || 400).json({error:e.message});next(e)}
});
// A caller supplies ciphertext produced after independently verified attestation.
// Today verifyRecipientForPrivateSource always fails: this endpoint cannot be
// enabled by an environment flag or a caller-supplied "verified" boolean.
sources.post('/encrypted',async(req,res,next)=>{
  try {
    const run=await confidentialOwner(req,res);if(!run)return;
    const body=req.body;
    if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).sort().join(',')!=='attestationEvidence,clientNonce,envelope,proofOfPossession')
      return res.status(400).json({error:'Expected sealed envelope and attestation handshake.'});
    res.status(201).json(await encryptedSources.attach(run,body.envelope,body.attestationEvidence,body.proofOfPossession,body.clientNonce));
  }catch(e){
    // Attestation/storage/DB exceptions may contain user or provider text.
    // Only the fixed fail-closed availability code is safe to disclose.
    if(e?.code==='CONFIDENTIAL_BOUNDARY_UNAVAILABLE')return res.status(503).json({error:'Confidential processing is unavailable.',code:e.code});
    return res.status(400).json({error:'Confidential upload rejected.',code:'CONFIDENTIAL_UPLOAD_REJECTED'});
  }
});
sources.get('/:sourceId/encrypted',async(req,res,next)=>{
  try {
    const run=await confidentialOwner(req,res);if(!run)return;
    const row=await db.researchStep.findFirst({where:{id:req.params.sourceId,runId:run.id,kind:'input',status:'done'}});
    if (!row?.output?.encrypted || row.output.format!=='sealed-source-hpke-v2') return res.status(404).json({error:'source not found'});
    const bytes=await getSource(row.output.key);
    if (createHash('sha256').update(bytes).digest('hex')!==row.output.sha256)
      return res.status(503).json({error:'Sealed source integrity check failed.'});
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).type('application/json').send(bytes);
  }catch(e){next(e)}
});
sources.get('/:sourceId',async(req,res,next)=>{
  try {
    const run=await owner(req,res);if(!run)return;
    const row=await db.researchStep.findFirst({where:{id:req.params.sourceId,runId:run.id,kind:'input',status:'done'}});
    if(!row)return res.status(404).json({error:'source not found'});
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).type('text/plain').send(`${row.output.name}\n\n${row.output.text}`);
  }catch(e){next(e)}
});
sources.get('/:sourceId/original',async(req,res,next)=>{
  try {
    const run=await owner(req,res);if(!run)return;
    const row=await db.researchStep.findFirst({where:{id:req.params.sourceId,runId:run.id,kind:'input',status:'done'}});
    if(!row)return res.status(404).json({error:'source not found'});
    const bytes=await getSource(row.output.key);
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.output.name)}`}).type('application/octet-stream').send(bytes);
  }catch(e){next(e)}
});
sources.delete('/:sourceId',async(req,res,next)=>{
  try {
    const run=await owner(req,res);if(!run)return;
    await withRunLock(run.id,async tx=>{
      const current=await tx.researchRun.findUniqueOrThrow({where:{id:run.id}});
      assertConventionalPath(current);
      if(!sourceEditable(current))throw Object.assign(new Error(lockedMessage),{status:409});
      const row=await tx.researchStep.findFirst({where:{id:req.params.sourceId,runId:run.id,kind:'input',status:'done'}});
      if(!row)throw Object.assign(new Error('source not found'),{status:404});
      // Soft removal preserves the original for project history.
      await tx.researchStep.update({where:{id:row.id},data:{status:'removed'}});
      if(current.status==='planned')await tx.researchRun.update({where:{id:run.id},data:{status:'intake-done',plan:null}});
    });
    res.json({removed:true});
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}
});
