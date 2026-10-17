import {createHash} from 'node:crypto';
import {depthLimits} from '../depth.js';
import {createFullWorkerPrivateContext} from './full-worker-context.js';

// Claim-extraction portion of verifyReport in ../verify.js. That module also
// imports the ordinary Prisma singleton, eventlog, provider and JEV, so it
// cannot be loaded in a private guest. The chunk/sample semantics and prompt
// below follow that existing worker stage. No support verdict is attempted.
const VERIFY_CHUNK_CHARS=10000;
const MAX_VERIFY_CHUNKS=24;
const MAX_REPORT_CHARS=100000;
function denied(){const e=new Error('PRIVATE_VERIFY_UNAVAILABLE');e.code='PRIVATE_VERIFY_UNAVAILABLE';return e;}
function disabled(){throw denied();}
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}

export function privateReportVerificationChunks(markdown,maxChars=VERIFY_CHUNK_CHARS){
  if(!Number.isSafeInteger(maxChars)||maxChars<1||maxChars>VERIFY_CHUNK_CHARS)throw denied();
  const text=String(markdown||''),chunks=[];
  let offset=0;
  while(offset<text.length&&chunks.length<MAX_VERIFY_CHUNKS){
    let end=Math.min(offset+maxChars,text.length);
    if(end<text.length){
      const boundary=text.lastIndexOf('\n\n',end);
      if(boundary>offset+maxChars/2)end=boundary+2;
    }
    chunks.push(text.slice(offset,end));offset=end;
  }
  return {chunks,coveredChars:offset,complete:offset===text.length};
}
export function privateSampleClaimsAcrossChunks(groups,limit){
  const selected=[],seen=new Set();
  const spread=Math.min(groups.length,Math.max(0,limit));
  const preferred=spread===1?[0]:Array.from({length:spread},(_,i)=>Math.round(i*(groups.length-1)/(spread-1)));
  const order=[...preferred,...groups.map((_,i)=>i).filter(i=>!preferred.includes(i))];
  const longest=Math.max(0,...groups.map(group=>group.length));
  for(let row=0;row<longest&&selected.length<limit;row++){
    for(const index of order){
      const claim=groups[index][row];
      if(!claim)continue;
      const key=claim.text.toLowerCase().replace(/\s+/g,' ').trim();
      if(seen.has(key))continue;
      seen.add(key);selected.push(claim);
      if(selected.length>=limit)break;
    }
  }
  return selected;
}
function parseClaims(result,citationCount){
  const text=result?.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim()||text.length>30000)throw denied();
  let parsed;
  try{parsed=JSON.parse(text);}catch{throw denied();}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).join(',')!=='claims'||
     !Array.isArray(parsed.claims)||parsed.claims.length>50)throw denied();
  return parsed.claims.map(claim=>{
    if(!claim||typeof claim!=='object'||Array.isArray(claim)||
       Object.keys(claim).sort().join(',')!=='citations,text'||
       typeof claim.text!=='string'||!claim.text.trim()||claim.text.length>600||
       !Array.isArray(claim.citations)||claim.citations.length>20||
       claim.citations.some(n=>!Number.isSafeInteger(n)||n<1||n>citationCount)||
       new Set(claim.citations).size!==claim.citations.length)throw denied();
    return {text:claim.text.trim(),citations:claim.citations,status:'unknown'};
  });
}
function extractionMessages(chunk){
  return [
    {role:'system',content:'Extract verifiable factual claims. Return JSON only.'},
    {role:'user',content:`List the distinct factual claims made in this part of a longer report that could be checked against sources. One atomic factual statement each; split compound claims rather than bundling several facts. Skip opinions, transitions, and methodology statements. Keep the report citation numbers for each claim. Return JSON: {"claims": [{"text":"...", "citations":[1,2]}]}\n\nReport part:\n${chunk}`},
  ];
}
function snapshot(run,loaded,report){
  const state=loaded?.state,marker=state?.privateWrite;
  if(run.status!=='running'||run.versions!==1||!Number.isSafeInteger(loaded?.revision)||loaded.revision!==3||
     marker?.mode!=='source-only-short'||marker.planAttempt!==1||marker.baseStateRevision!==2||
     marker.sourceRevision!==1||state?.brief?.liveWeb!==false||
     typeof state?.resultRecipientPublicKey!=='string'||
     typeof report?.markdown!=='string'||!report.markdown.trim()||report.markdown.length>MAX_REPORT_CHARS||
     typeof report.inputDigest!=='string'||!/^[0-9a-f]{64}$/.test(report.inputDigest)||
     !Array.isArray(report.citations)||report.citations.length<1||report.citations.length>40)
    throw denied();
  return digest({revision:loaded.revision,brief:state.brief,recipient:state.resultRecipientPublicKey,
    marker,markdown:report.markdown,citations:report.citations,inputDigest:report.inputDigest});
}
async function sourceSnapshot(store,run,marker){
  const rows=await store.listSources(run);
  if(rows.length!==1||rows[0].objectId!==marker.sourceId||rows[0].revision!==marker.sourceRevision||
     rows[0].value?.provider!=='user-upload')throw denied();
}

/** Test-only protected claim extraction, the first pass of the existing
 * verifyReport stage. The sealed checkpoint contains candidate claims, all
 * marked unknown. It neither uses ordinary JEV nor asserts support/coverage
 * verification, and current source-only report release does not call it. */
export function createPrivateVerifyExtractionRunner({store,events,aiPort,model}={}){
  if(typeof store?.loadRun!=='function'||typeof store?.getRunState!=='function'||
     typeof store?.getReport!=='function'||typeof store?.listSources!=='function'||typeof events?.emitFixed!=='function'||
     typeof aiPort?.infer!=='function'||aiPort.privateVerifiedTransport!=='phala-aci-v1'||
     typeof model!=='string'||!model)throw denied();
  const ai={generate:messages=>aiPort.infer({model,messages}),verify:disabled};
  const context=createFullWorkerPrivateContext({store,events,ai,
    judge:{sourceBatch:disabled,choice:disabled},tools:{run:disabled},billing:{meter:disabled}});
  return Object.freeze({
    async run(runId){
      try{
        const run=await store.loadRun(runId),loaded=await store.getRunState(run);
        const report=await store.getReport(run,run.versions);
        const reportDigest=snapshot(run,loaded,report);
        await sourceSnapshot(store,run,loaded.state.privateWrite);
        const coverage=privateReportVerificationChunks(report.markdown);
        if(!coverage.complete||coverage.chunks.length<1)throw denied();
        const output=await context.stage(runId,'verify',run.versions,async({ai})=>{
          const groups=[];
          for(const chunk of coverage.chunks){
            // A long report takes several paid extraction calls. Stop before
            // the next one if its sealed input changed during the prior call.
            const current=await store.loadRun(runId),currentState=await store.getRunState(current);
            const currentReport=await store.getReport(current,current.versions);
            if(snapshot(current,currentState,currentReport)!==reportDigest)throw denied();
            await sourceSnapshot(store,current,currentState.state.privateWrite);
            groups.push(parseClaims(await ai.generate(extractionMessages(chunk)),report.citations.length));
          }
          const claims=privateSampleClaimsAcrossChunks(groups,depthLimits(loaded.state.brief.depth).claims);
          return {scope:'extraction-only',verified:false,reason:'support-judge-not-configured',
            reportDigest,extractedClaims:groups.reduce((n,group)=>n+group.length,0),
            reportChunks:coverage.chunks.length,coveredChars:coverage.coveredChars,
            reportCoverageComplete:coverage.complete,claims};
        });
        if(output?.scope!=='extraction-only'||output.verified!==false||output.reportDigest!==reportDigest||
           output.reason!=='support-judge-not-configured'||
           !Array.isArray(output.claims)||output.claims.some(c=>c.status!=='unknown'))throw denied();
        const fresh=await store.loadRun(runId),freshLoaded=await store.getRunState(fresh);
        const freshReport=await store.getReport(fresh,fresh.versions);
        if(snapshot(fresh,freshLoaded,freshReport)!==reportDigest)throw denied();
        await sourceSnapshot(store,fresh,freshLoaded.state.privateWrite);
        return output;
      }catch{throw denied();}
    },
  });
}
