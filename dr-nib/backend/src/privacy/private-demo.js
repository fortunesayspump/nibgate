import {randomUUID} from 'node:crypto';
import {isConfidentialRun} from './guard.js';
import {openHpkeSource,recipientIdForPublicKey,sealHpkeReport,validateHpkeSourceEnvelope,validateHpkeReportEnvelope} from './source-hpke.js';
import {reportMessages} from '../llm/prompts.js';

/** Minimal single supplied-text-source slice of Dr. Nib's existing writer.
 * Execute only inside a measured guest after client-side attestation and key
 * possession. No retrieval, spending, JEV, legacy worker or fallback model. */
export function createPrivateDemoRunner({aiPort,reportSink,parseDocument=async(name,bytes)=>(await import('../sources/parse.js')).parseSource(name,bytes)}) {
  if(typeof aiPort?.infer!=='function'||typeof reportSink?.save!=='function')throw new Error('PRIVATE_DEMO_UNAVAILABLE');
  return {
    async execute({run,sourceEnvelope,guestPrivateKey,guestPublicKey,model}) {
      try {
        if(!isConfidentialRun(run)||run.deletedAt!=null||typeof run.userId!=='string'||!run.userId)throw new Error('PRIVATE_RUN_UNAVAILABLE');
        validateHpkeSourceEnvelope(sourceEnvelope,{tenantId:run.userId,runId:run.id});
        if(sourceEnvelope.context.recipientId!==recipientIdForPublicKey(guestPublicKey))throw new Error('PRIVATE_RECIPIENT_MISMATCH');
        const inputBytes=await openHpkeSource({recipientPrivateKey:guestPrivateKey,expectedContext:sourceEnvelope.context,envelope:sourceEnvelope});
        let input;
        try {input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(inputBytes));} catch {throw new Error('PRIVATE_INPUT_INVALID');}
        const keys=input&&typeof input==='object'&&!Array.isArray(input)?Object.keys(input).sort().join(','):'';
        const isText=keys==='browserPublicKey,question,sourceText,title';
        const isFile=keys==='browserPublicKey,fileBase64,fileName,question,title';
        if(!isText&&!isFile)throw new Error('PRIVATE_INPUT_INVALID');
        if(
           typeof input.question!=='string'||input.question.length<3||input.question.length>1000||
           typeof input.title!=='string'||input.title.length<1||input.title.length>160||
           (isText&&(typeof input.sourceText!=='string'||input.sourceText.length<1||input.sourceText.length>100000))||
           (isFile&&(typeof input.fileName!=='string'||input.fileName.length<1||input.fileName.length>160||
             !/\.(pdf|docx|xlsx|csv|txt|md|png|jpg|jpeg|webp)$/i.test(input.fileName)||
             typeof input.fileBase64!=='string'||input.fileBase64.length>Math.ceil(2*1024*1024*4/3)+8))||
           typeof input.browserPublicKey!=='string'||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.browserPublicKey))
          throw new Error('PRIVATE_INPUT_INVALID');
        const browserPublicKey=Buffer.from(input.browserPublicKey,'base64');
        if(browserPublicKey.toString('base64')!==input.browserPublicKey)throw new Error('PRIVATE_INPUT_INVALID');
        // Reuse the real Dr. Nib prompt policy, not a parallel research engine.
        let sourceText=input.sourceText;
        let inputTruncated=false;
        if(isFile){
          if(!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.fileBase64))throw new Error('PRIVATE_INPUT_INVALID');
          const file=Buffer.from(input.fileBase64,'base64');
          if(file.length<1||file.length>2*1024*1024||file.toString('base64')!==input.fileBase64)throw new Error('PRIVATE_INPUT_INVALID');
          const parsed=await parseDocument(input.fileName,file);
          if(typeof parsed?.text!=='string'||!parsed.text.trim()||parsed.text.length>100000)throw new Error('PRIVATE_INPUT_INVALID');
          sourceText=parsed.text;
          inputTruncated=parsed.truncated===true;
        }
        // reportMessages excerpts each source at 1,800 characters. Split the
        // existing parser's bounded 100k-character result into smaller source
        // passages so late pages are not silently dropped. One document keeps
        // one citation number, while part labels retain passage order.
        const chunks=sourceText.match(/[\s\S]{1,1700}/g)||[];
        if(chunks.length>59)throw new Error('PRIVATE_INPUT_INVALID');
        const sources=chunks.map((excerpt,i)=>({title:`${input.title} (part ${i+1}/${chunks.length})`,excerpt,citationIndex:1}));
        const messages=reportMessages({brief:{topic:input.question,liveWeb:false},sources,targetWords:250});
        const completion=await aiPort.infer({model,messages});
        let markdown=completion?.choices?.[0]?.message?.content;
        if(typeof markdown!=='string'||!markdown.trim()||markdown.length>100000)throw new Error('PRIVATE_MODEL_OUTPUT_INVALID');
        if(inputTruncated)markdown+='\n\nDocument limit: Only the first 100,000 extracted characters were analyzed. Split the file to cover the rest.';
        const id=randomUUID();
        const context={tenantId:run.userId,runId:run.id,objectId:id,revision:1,purpose:'report',recipientId:recipientIdForPublicKey(browserPublicKey)};
        const envelope=await sealHpkeReport({recipientPublicKey:browserPublicKey,context,plaintext:new TextEncoder().encode(JSON.stringify({markdown}))});
        await reportSink.save(run,{id,version:1,envelope});
        return {id,version:1,encrypted:true};
      } catch {
        // Never bubble model/source text through the existing worker's error
        // persistence, HTTP error response or ordinary logs.
        const error=new Error('Private demo unavailable');
        error.code='PRIVATE_DEMO_UNAVAILABLE';
        throw error;
      }
    },
  };
}

/** Ciphertext-only write using the existing ResearchReport schema. */
export function createCiphertextReportSink(db) {
  if(typeof db?.researchReport?.create!=='function')throw new Error('PRIVATE_REPORT_SINK_UNAVAILABLE');
  return {save:async(run,{id,version,envelope})=>db.researchReport.create({data:{id,runId:run.id,version,markdown:JSON.stringify({encrypted:true,format:'hpke-report-v2',envelope}),citations:[]}})};
}

/** Guest-side authenticated retrieval: no plaintext markdown leaves Prisma. */
export function createCiphertextReportReader(db){
  if(typeof db?.researchRun?.findUnique!=='function'||typeof db?.researchReport?.findFirst!=='function')throw new Error('PRIVATE_REPORT_READER_UNAVAILABLE');
  return async({tenantId,runId,reportId})=>{
    try{
      const run=await db.researchRun.findUnique({where:{id:runId}});
      if(!isConfidentialRun(run)||run.deletedAt!=null||run.userId!==tenantId)return null;
      const row=await db.researchReport.findFirst({where:{id:reportId,runId}});
      if(!row||typeof row.markdown!=='string')return null;
      const stored=JSON.parse(row.markdown);
      if(!stored||Object.keys(stored).sort().join(',')!=='encrypted,envelope,format'||stored.encrypted!==true||stored.format!=='hpke-report-v2')return null;
      validateHpkeReportEnvelope(stored.envelope,{tenantId,runId});
      if(stored.envelope.context.objectId!==reportId)return null;
      return stored.envelope;
    }catch{return null}
  };
}
