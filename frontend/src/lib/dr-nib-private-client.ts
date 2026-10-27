'use client';
import {isGuestRun} from './dr-nib-guest-planning';
import {cleanPrivateReportCitations} from '@nibgate/internal/private-report-citations.js';
import { createEncryptedProject, getPrivateManifest, privateRecordRequest, privateFundingEnabled, requirePrivateInputs,queuePrivateControl } from './dr-nib-private-records';
import { configuredPrivateVerification } from './dr-nib-private-verification';
import { privateAction } from './dr-nib-private-actions';
import {privateDiscussionShape} from './dr-nib-private-discussion';
import {canCheckPrivateRecovery,admitAutomaticPrivateRecovery} from './dr-nib-private-checkpoint-recovery';
import {privateFundingShape} from './dr-nib-private-funding';
import {approvePrivateExternalTool} from './dr-nib-private-external-tools';
import {notifyPrivateActionUpdate} from './dr-nib-private-action-updates';
function cleanReport(r:any,sources:any[]){return {...r,markdown:cleanPrivateReportCitations(r.markdown,(r.citations??sources).length).markdown};}
function runShape(s: any) { return { ...s,reports:s.reports?.map((r:any)=>cleanReport(r,s.sources??[])), versions: s.reports?.length ?? 0, metadata: { ...s.metadata, discuss:privateDiscussionShape(s.metadata?.discuss), privacyMode: 'confidential' }, sources: s.sources ?? [], claims: s.claims ?? [], decisions: s.decisions ?? [], steps: s.steps ?? [] }; }
const denied = () => { throw Error('This capability is not available in the private rehearsal. No ordinary request was sent.'); };
const privateFundedBuild=privateFundingEnabled;
// Route changes keep the request alive. Failure remains visible on the run
// page; reconnects only read the durable receipt, never replay inference.
const approvals=new Map<string,{pending:boolean,error?:string}>();
async function fundingRequest(path:string,method='GET',body?:unknown){
    if(!privateFundedBuild())return denied();
    const response=await fetch('/drnib-private-funding-api'+path,{method,credentials:'include',cache:'no-store',redirect:'error',headers:{'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body??{})}:{}),signal:AbortSignal.timeout(path.includes('/tools')?120000:30000)});
    if(!response.ok)throw Error('Private funding is unavailable. Any existing deposit remains in escrow; research content was not sent.');
    return privateFundingShape(await response.json());
}
/** Setup approval covers only these exact public bytes, never a new query,
 * paid call, URL, body, upload or private discussion. */
export function isPreapprovedPublicResearch(state:any){
 const request=state?.pendingQuestion?.externalRequest,approved=state?.brief?.publicResearch;
 return state?.status==='awaiting'&&state.brief?.liveWeb===true&&state.brief?.searchEnabled!==false&&approved?.approved===true&&typeof approved.brief==='string'&&request?.tool==='web_search'&&request.query===approved.brief&&request.maxMicroUsd===0&&Object.keys(request).every(k=>['tool','query','maxMicroUsd','preferCreators'].includes(k))&&(request.preferCreators===undefined||typeof request.preferCreators==='boolean')&&(request.preferCreators===true)===(state.brief.tipCreators===true);
}
function trackBackgroundAction(id:string,approval:{pending:boolean,error?:string},work:Promise<any>){
 void work.then(async result=>{
  for(let n=0;isPreapprovedPublicResearch(result);n++){
   if(approvals.get(id)!==approval)return;
   if(n>=12)throw Error('The public research continuation limit was reached. Review the saved request.');
   const proof=await approvePrivateExternalTool(id,result.pendingQuestion,fundingRequest);
   result=await privateAction(id,'answer',{...proof,optionId:'approve',questionId:result.pendingQuestion.id});
  }
  if(approvals.get(id)===approval)approvals.delete(id);
  if(privateFundedBuild()&&['complete','failed','ended'].includes(result?.status))await fundingRequest(`/v1/private/runs/${id}/escrow/complete`,'POST');
 }).catch(error=>{if(approvals.get(id)===approval)approvals.set(id,{pending:false,error:error instanceof Error?error.message:'The private action could not be confirmed. Refresh to read its saved state before retrying.'})}).finally(()=>notifyPrivateActionUpdate(id));
}
async function fundedShape(state:any){
    const run=runShape(state);if(await isGuestRun(run.id))return {...run,metadata:{...run.metadata,guestPlanning:true}};if(!privateFundedBuild())return run;
    const status=await fundingRequest(`/v1/private/runs/${run.id}/escrow`).catch(()=>null);
    // Reading a saved project never starts work. Automatic recovery belongs
    // only to an operation explicitly started in this browser session.
    if(approvals.has(run.id)&&canCheckPrivateRecovery(run,status)&&!approvals.get(run.id)?.pending&&typeof window!=='undefined'){
        const capabilities=await privateRecordRequest('/capabilities').catch(()=>null);
        if(capabilities?.actions===true&&admitAutomaticPrivateRecovery(localStorage,run.id,run.metadata.privateRecoveryRequestId)){
            const next={pending:true};approvals.set(run.id,next);
            trackBackgroundAction(run.id,next,privateAction(run.id,'recover',{requestId:run.metadata.privateRecoveryRequestId}));
        }
    }
    const approval=approvals.get(run.id);
    if(approval?.pending)run.metadata={...run.metadata,privateActionPending:true,privateActionError:null};
    if(['complete','ended'].includes(run.status))approvals.delete(run.id);
    return {...run,...(status?.ledger??{}),expenseReceipt:status?.expenseReceipt,settledAt:status?.settledAt??run.settledAt,...(approval?.pending&&['planned','paused','awaiting'].includes(run.status)?{status:'running'}:{}),...(status?.cancelled||status?.job?.cancelled?{status:'ended'}:{}),metadata:{...run.metadata,...(status?.job?{escrow:status.job}:{}),privateActionError:run.status==='complete'?null:approval?.error??run.metadata?.privateActionError,privateFundingUnavailable:!status}};
}
/** Shapes an already authenticated, decrypted polling snapshot in this browser. */
export function privateSnapshotRun(state:any){if(!state||typeof state.id!=='string'||!/^[0-9a-f-]{36}$/i.test(state.id))throw Error('Invalid private snapshot.');return fundedShape(state);}
const answerShape = (s: any) => ({ project: runShape(s), done: s.status === 'intake-done', next: s.questions ?? [], thinkings: s.thinking ? [{ thinking: s.thinking }] : [] });
/** Explicit private-build dispatch. Every unmatched path fails closed. */
export async function privateClientRequest(path: string, opts: RequestInit = {}) {
    const method = opts.method ?? 'GET';let body = opts.body ? JSON.parse(String(opts.body)) : {};
    if (path === '/health') {
        const c = await privateRecordRequest('/capabilities');
        const reviewed=configuredPrivateVerification()!==null;
        const funding=privateFundedBuild()?await fundingRequest('/health'):null;
        return { ok: true, privateEnabled: c.records===true, publicRetrieval:c.publicRetrieval===true, workflowRehearsal: !privateFundedBuild(), settlementConfigured: funding?.payments===true,research:{acceptingRuns:c.records===true&&c.actions===true&&reviewed&&(!privateFundedBuild()||funding?.payments===true),reason:c.records!==true?'private-setup-paused':c.actions!==true?'private-worker-paused':!reviewed?'private-release-unreviewed':funding&&funding.payments!==true?'private-funding-unavailable':null} };
    }
    if (path.startsWith('/v1/runs?') || path === '/v1/runs' && method === 'GET') {
        const listed = await privateRecordRequest(`/projects${path.includes('deleted=1') ? '?deleted=1' : ''}`);
        // Deleted projects stay opaque until restored, retaining all encrypted data.
        return { runs: await Promise.all(listed.runs.map(async (r: any) => r.deletedAt ? { ...r, title: 'Deleted private project', brief: {} } : runShape({...(await getPrivateManifest(r.id)).value,...(r.cancelled?{status:'ended'}:{})}))) };
    }
    if (path === '/v1/runs' && method === 'POST') {
        if (!configuredPrivateVerification())
            throw Error('The reviewed private worker is not configured. No ordinary processing was started.');
        const s = await createEncryptedProject(body.topic);
        try{return runShape(await privateAction(s.id, 'intake'));}
        catch(error){if(error instanceof Error)Object.defineProperty(error,'privateRunId',{value:s.id});throw error;}
    }
    const match = path.match(/^\/v1\/runs\/([0-9a-f-]{36})(.*)$/);
    if (!match)
        return denied();
    const [, id, tail] = match;
    const guestPlanning = await isGuestRun(id);
    if (guestPlanning && !((!tail && method === 'GET') || ['/answers','/answers/batch','/intake/finish','/configure','/plan'].includes(tail))) throw Error('Sign in and save this guest plan before adding files, preparing escrow or starting research.');
    if (!tail && method === 'GET')
        return fundedShape((await getPrivateManifest(id,true)).value);
    if (!tail && method === 'DELETE')
        return privateRecordRequest(`/projects/${id}`, { method: 'DELETE' });
    if (tail === '/restore')
        return privateRecordRequest(`/projects/${id}/restore`, { method: 'POST' });
    if(tail==='/escrow'&&method==='POST')await requirePrivateInputs(id);
    if(/^\/escrow(?:\/(?:register|complete|cancel))?$/.test(tail)&&privateFundedBuild())return fundingRequest(`/v1/private/runs/${id}${tail}`,method,body);
    if (tail === '/escrow' && method === 'GET')
        return { configured: false, privateRehearsal: true, job: null };
    if (tail.startsWith('/report') && method === 'GET') {
        const s = (await getPrivateManifest(id)).value, version = new URLSearchParams(tail.split('?')[1] ?? '').get('version');
        const report = version ? s.reports?.find((r: any) => r.version === Number(version)) : s.reports?.at(-1);
        if (!report)
            throw Error('No private report is available yet.');
        return cleanReport(report,s.sources??[]);
    }
    if(tail==='/end'&&method==='POST'&&privateFundedBuild()){await fundingRequest(`/v1/private/runs/${id}/escrow/cancel`,'POST');return fundedShape((await getPrivateManifest(id)).value);}
    if((tail==='/pause'||tail==='/guidance')&&method==='POST'){
        const queued=await queuePrivateControl(id,tail==='/pause'?'pause':'guidance',body?.text);
        if(queued)return queued;
    }
    if (tail === '/answers/batch' || tail === '/answers')
        return answerShape(await privateAction(id, 'answers', { answers: tail.endsWith('/batch') ? body.answers : [body] }));
    if(tail==='/discuss'&&method==='POST'){
        const out=await privateAction(id,'discuss',body),state=(await getPrivateManifest(id)).value;
        const {max,used,remaining}=privateDiscussionShape(state.metadata?.discuss);
        return {...out,max,used,remaining};
    }
    const actions: Record<string, string> = { '/intake/finish': 'finish-intake', '/configure': 'configure', '/approve': 'execute', '/pause': 'pause', '/resume': 'resume', '/awaiting/answer':'answer', '/end': 'end', '/guidance': 'guidance', '/revise': 'revise', '/plan': 'edit-plan', '/discuss': 'discuss', '/exports': 'export' };
    if (actions[tail] && ['POST', 'PATCH'].includes(method)){
        if(tail==='/configure'&&!guestPlanning)await requirePrivateInputs(id,body);
        if(tail==='/approve')await requirePrivateInputs(id);
        if(tail==='/approve'||tail==='/resume'||tail==='/awaiting/answer'){
            const active=tail==='/resume'?await privateRecordRequest(`/runs/${id}/actions`):null;
            if(approvals.get(id)?.pending&&!(['processing','uncertain'].includes(active?.state)&&active.recoveryAvailable===true))throw Error('A private action is already running.');
            const action=['processing','uncertain'].includes(active?.state)&&active.recoveryAvailable===true?'recover':tail==='/resume'?'resume':tail==='/awaiting/answer'?'answer':'execute';
            if(action==='answer'){
                const state=(await getPrivateManifest(id)).value;
                if(state.status!=='awaiting'||!state.pendingQuestion?.id)throw Error('This project is not waiting for that answer. Refresh before continuing.');
                if(state.pendingQuestion.externalRequest&&body.optionId==='approve')body={...body,...await approvePrivateExternalTool(id,state.pendingQuestion,fundingRequest)};
                body={...body,questionId:state.pendingQuestion.id};
            }
            const approval={pending:true};approvals.set(id,approval);
            trackBackgroundAction(id,approval,privateAction(id,action,action==='recover'?{requestId:active.requestId}:body));
            return {id,status:'running'};
        }
        const result=await privateAction(id, actions[tail], body);
        if(privateFundedBuild()&&['execute','resume','revise','end'].includes(actions[tail]))await fundingRequest(`/v1/private/runs/${id}/escrow/complete`,'POST').catch(()=>null);
        return result;
    }
    return denied();
}
