import {createHash} from 'node:crypto';
import {reportEvidence} from '../report-evidence.js';
import {reportMessages,deepenMessages} from '../llm/prompts.js';
import {countWords,resolveLength,FLOOR_RATIO} from '../length.js';
import {createFullWorkerPrivateContext} from './full-worker-context.js';

// Short-report branch of the existing Dr. Nib writer, with only private ports.
// No import of generate.js, provider.js, worker.js, Prisma, JEV, eventlog,
// memory or global agent lessons. Long sectioned writing is not enabled here.
const MAX_PROMPT_CHARS=145000;
const MAX_REPORT_CHARS=100000;
const CHUNK_CHARS=1700; // below reportMessages' per-evidence 1800-char cap
const MAX_CHUNKS=70;
const NOTICE='> Note: this is research, not advice. It cites what the evidence supports; it does not tell you what to buy, take, or sign.';
const SENSITIVE=/(financ|invest|funds?|stock|trading|portfolio|retire|mortgage|loan|debt|credit|bank|medic|health|drug|pharma|law|legal|tax|insur|diagnos|therap|surgery|mental health)/i;
function denied(){const error=new Error('PRIVATE_WRITE_UNAVAILABLE');error.code='PRIVATE_WRITE_UNAVAILABLE';return error;}
function disabled(){throw denied();}
function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function textCompletion(result){
  const text=result?.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim()||text.length>MAX_REPORT_CHARS)throw denied();
  return text.trim();
}
function bibliography(sources){
  const seen=new Set(),lines=[];
  for(const source of sources){
    if(seen.has(source.url))continue;
    seen.add(source.url);
    const title=String(source.title||source.url).replace(/[#*\[\]]/g,'').slice(0,140);
    const domain=source.domain?` ${source.domain}.`:'';
    lines.push(`[${lines.length+1}] ${title}.${domain} ${source.url}`);
  }
  return lines.length?`## References\n\n${lines.join('\n')}`:'';
}
function sourceOrder(a,b){
  return (Number(b.trust)||0)-(Number(a.trust)||0)||
    (Number(b.relevance)||0)-(Number(a.relevance)||0)||a.id.localeCompare(b.id);
}
function evidenceFromSealedSources(rows){
  if(!Array.isArray(rows)||rows.length<1||rows.length>40)throw denied();
  const sources=rows.map(row=>{
    const s=row?.value;
    if(typeof row?.objectId!=='string'||!s||typeof s!=='object'||Array.isArray(s)||
       s.provider!=='user-upload'||typeof s.url!=='string'||!s.url||s.url.length>1000||
       typeof s.title!=='string'||!s.title||s.title.length>160||
       typeof s.text!=='string'||!s.text.trim()||s.text.length>100000)throw denied();
    return {id:row.objectId,url:s.url,title:s.title,domain:s.domain||null,
      relevance:Number.isFinite(s.relevance)?s.relevance:null,trust:Number.isFinite(s.trust)?s.trust:null,text:s.text};
  }).sort(sourceOrder);
  if(new Set(sources.map(s=>s.url)).size!==sources.length)throw denied();
  const evidence=reportEvidence(sources,[{output:{documents:sources.map(s=>({url:s.url,text:s.text}))}}]);
  const prompts=[];
  for(const source of evidence){
    const pieces=source.excerpt.match(new RegExp(`[\\s\\S]{1,${CHUNK_CHARS}}`,'g'))||[];
    for(const [i,excerpt] of pieces.entries()){
      prompts.push({...source,title:pieces.length>1?`${source.title} (part ${i+1}/${pieces.length})`:source.title,excerpt});
      if(prompts.length>MAX_CHUNKS)throw denied();
    }
  }
  return {sources,evidence,prompts};
}
function validateState(loaded){
  const state=loaded?.state,brief=state?.brief,marker=state?.privateWrite;
  if(!Number.isSafeInteger(loaded?.revision)||loaded.revision<1||!brief||
     typeof brief.topic!=='string'||brief.topic.trim().length<3||brief.topic.length>1000||
     brief.liveWeb!==false||state?.pendingGuidance!=null||
     typeof state?.resultRecipientPublicKey!=='string'||
     !marker||Object.keys(marker).sort().join(',')!=='baseStateRevision,mode,planAttempt,sourceId,sourceRevision'||
     marker.mode!=='source-only-short'||marker.baseStateRevision+1!==loaded.revision||
     !Number.isSafeInteger(marker.sourceRevision)||marker.sourceRevision<1)return false;
  return true;
}
function messagesWithinLimit(messages){
  if(messages.reduce((sum,m)=>sum+m.content.length,0)>MAX_PROMPT_CHARS)throw denied();
  return messages;
}
function fingerprint(brief,plan,recipient,sources){
  return hash({brief,plan,recipient,sources:sources.map(({id,url,title,domain,relevance,trust,text})=>
    ({id,url,title,domain,relevance,trust,text}))});
}

/** A private, source-only short-report stage. It requires sealed sources from
 * an earlier measured ingestion path and persists no plaintext ResearchReport
 * row. Browser HPKE release and verification are separate blocked stages. */
export function createPrivateWriteRunner({store,events,aiPort,model}={}){
  if(typeof store?.getRunState!=='function'||typeof store?.listSources!=='function'||
     typeof store?.commitReport!=='function'||
     typeof events?.emitFixed!=='function'||typeof aiPort?.infer!=='function'||
     aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof model!=='string'||!model)throw denied();
  const ai={generate:messages=>aiPort.infer({model,messages}),verify:disabled};
  const context=createFullWorkerPrivateContext({store,events,ai,judge:{sourceBatch:disabled,choice:disabled},
    tools:{run:disabled},billing:{meter:disabled}});
  return Object.freeze({
    async run(runId){
      try{
        const run=await store.loadRun(runId);
        if(run.status!=='running'||!Number.isSafeInteger(run.versions)||run.versions<1)throw denied();
        const state=await store.getRunState(run);
        if(!validateState(state))throw denied();
        const target=resolveLength({length:state.state.brief.length,lengthWords:state.state.brief.lengthWords});
        if(target.words>1200)throw denied(); // long branch needs sectioned migration
        const sourceRows=await store.listSources(run);
        const sourceVersions=sourceRows.map(({objectId,revision})=>({objectId,revision}));
        const {sources,evidence,prompts}=evidenceFromSealedSources(sourceRows);
        if(state.state.privateWrite.planAttempt!==run.versions||
           sourceVersions.length!==1||sourceVersions[0].objectId!==state.state.privateWrite.sourceId||
           sourceVersions[0].revision!==state.state.privateWrite.sourceRevision)throw denied();
        const inputDigest=fingerprint(state.state.brief,state.state.plan,state.state.resultRecipientPublicKey,sources);
        const output=await context.stage(runId,'write',run.versions,async({ai})=>{
          const targetWords=Math.max(150,target.words-175);
          const messages=messagesWithinLimit(reportMessages({brief:state.state.brief,sources:prompts,targetWords}));
          let markdown=textCompletion(await ai.generate(messages));
          const floor=Math.round(targetWords*FLOOR_RATIO);
          if(countWords(markdown)<floor){
            const deep=messagesWithinLimit(deepenMessages({brief:state.state.brief,
              section:state.state.brief.topic,existing:markdown,targetWords:Math.max(200,Math.round(target.words/3)),sources:prompts}));
            const added=textCompletion(await ai.generate(deep));
            if(added==='NOTHING_NEW')throw denied();
            markdown+=`\n\n${added}`;
          }
          if(countWords(markdown)<floor)throw denied();
          if(SENSITIVE.test(state.state.brief.topic)&&!markdown.includes('not advice'))markdown=`${NOTICE}\n\n${markdown}`;
          const refs=bibliography(evidence);
          if(refs)markdown+=`\n\n${refs}`;
          if(markdown.length>MAX_REPORT_CHARS)throw denied();
          return {markdown,citations:evidence.map(({excerpt,...source})=>source),source:'llm',model,
            verification:{status:'unverified'},inputDigest};
        });
        if(output?.inputDigest!==inputDigest)throw denied();
        const fresh=await store.loadRun(runId),freshState=await store.getRunState(fresh);
        if(fresh.status!=='running'||!validateState(freshState)||
           fingerprint(freshState.state.brief,freshState.state.plan,freshState.state.resultRecipientPublicKey,
             evidenceFromSealedSources(await store.listSources(fresh)).sources)!==inputDigest)throw denied();
        await store.commitReport(fresh,{version:run.versions,stateRevision:state.revision,sourceVersions,report:output});
        return output;
      }catch{throw denied();}
    },
  });
}
