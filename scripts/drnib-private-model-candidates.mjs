// Owner workstation, metadata only: no inference or automatic replay.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {availablePrivateModels,PRIVATE_MODEL_CANDIDATES} from '../dr-nib/tools/private-model-catalog.mjs';
import {privateModelSessionMatches} from '../dr-nib/backend/src/privacy/private-model-session.js';
const require=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url));
const output=process.argv[2],source=process.env.DRNIB_MODEL_REVIEW_ENV_FILE;
if(!/^\/tmp\/drnib-[\w.-]+\.json$/.test(output??'')||!source?.startsWith('/'))throw Error('Supply a fresh /tmp/drnib-*.json output and absolute owner environment file');
const env=require('dotenv').parse(await readFile(source,'utf8'));
const remainingMicroUsd=Number(process.env.DRNIB_MODEL_REVIEW_REMAINING_MICRO_USD);
const qualityApproved=String(process.env.DRNIB_MODEL_QUALITY_APPROVED??'').split(',').filter(Boolean);
if(qualityApproved.some(id=>!PRIVATE_MODEL_CANDIDATES.some(m=>m.id===id)))throw Error('Unknown quality approval');
const {connectAci}=await import(require.resolve('@phala/aci-verifier/runtime'));
let aci;
try{
 aci=await connectAci({baseURL:env.PRIVATE_ACI_GATEWAY_BASE_URL,timeoutMs:20000,policy:{requireProductionOs:true,acceptedComposeHashes:[env.PRIVATE_ACI_COMPOSE_HASH]}});
 if(aci.identity.transcript.verdict.verified!==true||aci.identity.composeHash!==env.PRIVATE_ACI_COMPOSE_HASH||!aci.identity.transcript.lines?.some(x=>x.id==='policy-os'&&x.status==='pass'))throw Error('Private model metadata identity unavailable');
 const base=env.PRIVATE_ACI_GATEWAY_BASE_URL.replace(/\/v1\/?$/,'').replace(/\/+$/,'');
 const responses=await Promise.all(['/v1/models',...PRIVATE_MODEL_CANDIDATES.map(candidate=>'/v1/aci/sessions?model='+encodeURIComponent(candidate.id))].map(path=>aci.fetch(base+path,{headers:{authorization:'Bearer '+env.PRIVATE_AI_API_KEY},signal:AbortSignal.timeout(20000)})));
 if(responses.some(r=>!r.ok))throw Error('Private model metadata unavailable');
 const [catalog,...modelSessions]=await Promise.all(responses.map(r=>r.json()));
 const serving={sessions:[...new Map(modelSessions.flatMap(body=>body.sessions??[]).map(session=>[session.session_id,session])).values()]};
 const eligible=availablePrivateModels({models:catalog.data,sessions:serving.sessions,qualityApproved,remainingMicroUsd,inputTokens:120000,outputTokens:8192});
 const servingReview=PRIVATE_MODEL_CANDIDATES.map(candidate=>({model:candidate.id,
  teeCatalogEntry:catalog.data.some(model=>model.id===candidate.id&&model.is_tee===true),
  currentCanonicalSessions:serving.sessions.filter(session=>privateModelSessionMatches(session,candidate.id)&&/^[0-9a-f]{64}$/.test(session.session_id??'')&&Number.isSafeInteger(session.expires_at)&&session.expires_at*1000>Date.now()+5000).length,
  qualityApproved:qualityApproved.includes(candidate.id)}));
 const report={status:'candidate-requires-review',checkedAt:new Date().toISOString(),gatewayComposeHash:aci.identity.composeHash,qualityApproved,remainingMicroUsd,reviewedCandidates:PRIVATE_MODEL_CANDIDATES,servingReview,eligible,selected:eligible[0]??null,notice:'Metadata-only selection. Inference must still verify the selected session and signed response. No uncertain action may be replayed.'};
 await writeFile(output,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({eligible:eligible.map(m=>m.id),selected:report.selected?.id??null,inferenceCalls:0}));
}finally{await aci?.close()}
