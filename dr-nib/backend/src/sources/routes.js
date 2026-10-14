import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import * as auth from '../auth.js';
import { parseSource, MAX_SOURCE_BYTES } from './parse.js';
import { sourceStorageConfig, putSource, getSource, deleteSource } from './storage.js';
import { directExtract } from '../retrieval/providers/direct.js';
import { recordEvent } from '../eventlog.js';
import { withRunLock } from '../run-lock.js';
import { config } from '../env.js';

export const sources = Router({mergeParams:true});
const EDITABLE = ['intake','intake-done','planned'];
const sourceEditable = run => EDITABLE.includes(run.status) && !run.metadata?.escrow?.jobId;
const lockedMessage = 'Sources are locked after an escrow job is opened or research starts. End and start a new project to use different documents.';
export const sourceSummary = row => ({id:row.id,name:row.output.name,bytes:row.output.bytes,characters:row.output.characters,pages:row.output.pages,warnings:row.output.warnings || [],createdAt:row.createdAt,url:row.output.documents[0].url,originalUrl:`/drnib-api/v1/runs/${row.runId}/sources/${row.id}/original`});
async function owner(req,res) {
  const run=await db.researchRun.findUnique({where:{id:req.params.id}});
  if(!run || !auth.isOwner(req.user,run) || run.deletedAt) {res.status(404).json({error:'project not found'});return null}
  return run;
}
sources.get('/',async(req,res,next)=>{
  try {
    const run=await owner(req,res);if(!run)return;
    const rows=await db.researchStep.findMany({where:{runId:run.id,kind:'input',status:'done'},orderBy:{createdAt:'asc'}});
    res.json({storageReady:Boolean(sourceStorageConfig()),editable:sourceEditable(run),maxFiles:5,maxBytes:MAX_SOURCE_BYTES,sources:rows.map(sourceSummary)});
  }catch(e){next(e)}
});
export async function attachSource(run,body) {
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
