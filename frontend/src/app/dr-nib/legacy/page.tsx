"use client";

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {PageHeader} from '@/components/dr-nib/common';
import {ReportArticle} from '@/components/dr-nib/ReportMarkdown';

type LegacyRun={id:string;title:string|null;topic:string|null;status:string;createdAt:string;updatedAt:string;settledAt:string|null;deletedAt:string|null};
type LegacyDetail={run:LegacyRun&{budgetCap:string};reports:{version:number;createdAt:string}[];ledger:{kind:string;amount:string;txRef:string|null;createdAt:string}[]};
type LegacyReport={version:number;markdown:string;citations:{url?:string}[];createdAt:string};
const base='/drnib-private-api/v1/legacy-archive';
const testnet=(process.env.NEXT_PUBLIC_NIBGATE_NETWORK||'testnet').toLowerCase()!=='mainnet';

async function readArchive<T>(path:string,signal?:AbortSignal):Promise<T>{
  const response=await fetch(base+path,{credentials:'include',cache:'no-store',redirect:'error',signal});
  if(response.status===401)throw Error('Sign in to Nibgate to read your legacy history.');
  if(response.status===404)throw Error('That legacy record is unavailable for this account.');
  if(!response.ok)throw Error('Legacy history is temporarily unavailable. Retry later.');
  return response.json();
}

export default function LegacyHistoryPage(){
  const [runs,setRuns]=useState<LegacyRun[]|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<LegacyDetail|null>(null);
  const [report,setReport]=useState<LegacyReport|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!testnet)return;
    const controller=new AbortController();
    readArchive<{runs:LegacyRun[]}>('/runs',controller.signal).then(value=>setRuns(value.runs)).catch(reason=>{
      if(!controller.signal.aborted)setError(reason.message);
    });
    return()=>controller.abort();
  },[]);
  async function openRun(id:string,version?:number){
    setBusy(true);setError('');setSelected(id);setReport(null);
    try{
      const current=detail?.run.id===id?detail:(await readArchive<LegacyDetail>(`/runs/${id}`));
      setDetail(current);
      try{
        const value=await readArchive<{report:LegacyReport}>(`/runs/${id}/report${version?`?version=${version}`:''}`);
        setReport(value.report);
      }catch(reason){
        if(current.reports.length)throw reason;
      }
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not open this legacy record.');}
    finally{setBusy(false)}
  }
  function download(){
    if(!report||!selected)return;
    const url=URL.createObjectURL(new Blob([report.markdown],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`dr-nib-legacy-${selected}-v${report.version}.md`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div>
    <PageHeader eyebrow="Dr. Nib" title="Legacy history" desc="Read-only access to ordinary testnet research saved before the private cutover." action={<Link href="/dr-nib/projects" className="rounded-full border border-dark-gray/50 px-5 py-3">Private projects</Link>}/>
    {!testnet?<p role="note">Legacy history is available only on the testnet site.</p>:<>
      <p className="mb-6 text-sm leading-6 opacity-70">These older reports are plaintext history. They do not have the current private vault encryption contract. This archive cannot start research, change budgets, or move money.</p>
      {error?<p role="alert" className="mb-4 text-sm text-red-700">{error}</p>:null}
      {runs===null&&!error?<p role="status">Loading your history…</p>:null}
      {runs?.length===0?<p>No legacy projects were found for this account.</p>:null}
      {runs&&runs.length>0?<div className="grid gap-2 sm:grid-cols-2" aria-label="Legacy projects">{runs.map(run=><button key={run.id} type="button" onClick={()=>void openRun(run.id)} aria-pressed={selected===run.id} className="rounded-xl border border-dark-gray/40 p-4 text-left hover:border-black">
        <span className="block font-medium">{run.title||run.topic||'Untitled project'}</span>
        <span className="mt-1 block text-xs opacity-65">{run.status} · {new Date(run.updatedAt).toLocaleDateString()}</span>
      </button>)}</div>:null}
      {busy?<p role="status" className="mt-6">Opening legacy record…</p>:null}
      {detail&&selected===detail.run.id&&!busy?<section aria-label="Selected legacy project" className="mt-8 border-t border-dark-gray/30 pt-6">
        <h2 className="text-xl font-medium">{detail.run.title||detail.run.topic||'Untitled project'}</h2>
        <p className="mt-2 text-sm opacity-70">Status: {detail.run.status}. {detail.run.settledAt?'Settlement recorded.':'No final settlement timestamp recorded.'}</p>
        {detail.ledger.length?<details className="mt-4 rounded-lg border border-dark-gray/30 p-3"><summary className="cursor-pointer font-medium">Historical ledger ({detail.ledger.length})</summary><ul className="mt-3 space-y-1 text-sm">{detail.ledger.map((row,index)=><li key={index}>{row.kind}: ${Number(row.amount).toFixed(6)}{row.txRef?' · reference recorded':''}</li>)}</ul></details>:null}
        {detail.reports.length?<div className="mt-5 flex flex-wrap gap-2" aria-label="Report versions">{detail.reports.map(item=><button key={item.version} type="button" onClick={()=>void openRun(detail.run.id,item.version)} aria-pressed={report?.version===item.version} className="rounded border border-dark-gray/40 px-3 py-1.5 text-sm">Version {item.version}</button>)}</div>:<p className="mt-5 text-sm opacity-70">No report was saved for this project.</p>}
        {report?<div className="mt-6"><button type="button" onClick={download} className="mb-4 rounded border border-dark-gray/40 px-3 py-1.5 text-sm">Download Markdown</button><ReportArticle full markdown={report.markdown} sources={Array.isArray(report.citations)?report.citations:[]}/></div>:null}
      </section>:null}
    </>}
  </div>;
}
