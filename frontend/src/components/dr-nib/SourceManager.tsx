"use client";
import { useEffect, useRef, useState } from 'react';
import { researchSourceApi, uploadResearchSource } from '@/lib/dr-nib-api';

export function SourceManager({runId,readOnly=false,onBusyChange}:{runId:string;readOnly?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [state,setState]=useState<any>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [progress,setProgress]=useState(0);
  const [url,setUrl]=useState('');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{onBusyChange?.(Boolean(busy));return()=>onBusyChange?.(false)},[busy,onBusyChange]);
  async function refresh(){setState(await researchSourceApi.list(runId))}
  useEffect(()=>{let active=true;researchSourceApi.list(runId).then(out=>{if(active)setState(out)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[runId]);
  async function upload(files:FileList|null) {
    if(!files?.length)return;
    setError('');
    try {
      for(const file of Array.from(files)) {
        setBusy(`Uploading ${file.name}`);setProgress(0);
        await uploadResearchSource(runId,file,p=>{setProgress(p);if(p===100)setBusy(`Processing ${file.name}`)});
        await refresh();
      }
    } catch(e:any){setError(e.message);await refresh().catch(()=>{})}
    finally{setBusy('');if(input.current)input.current.value=''}
  }
  const editable=!readOnly && state?.editable;
  return <section aria-label="Your research sources" className="my-4 rounded-2xl border border-dark-gray/50 bg-white p-4 text-left">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">Your sources {state ? `(${state.sources.length}/5)` : ''}</h2><button type="button" disabled={Boolean(busy)} onClick={()=>{setError('');refresh().catch(e=>setError(e.message))}} className="text-xs underline">Refresh sources</button></div>
    {editable && <>
      <p className="mt-2 text-xs leading-5 opacity-70">Upload PDFs with selectable text, Word documents, spreadsheets, CSV, text or Markdown. Up to 5 sources, 2 MB each; PDFs up to 100 pages. Scans need OCR first.</p>
      <p className="mt-2 text-xs leading-5 opacity-70">Originals stay in private R2 storage. Extracted text is analyzed by our AI providers when you start research. Upload only records you’re authorized to process.</p>
      {!state.storageReady ? <p role="status" className="mt-2 text-sm">Private uploads are temporarily unavailable. Refresh to retry; no file has been stored.</p> : null}
      <input ref={input} type="file" multiple accept=".pdf,.docx,.xlsx,.csv,.txt,.md" aria-label="Choose research source files" disabled={Boolean(busy)||!state.storageReady||state.sources.length>=5} onChange={e=>void upload(e.target.files)} className="mt-3 block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-dark-gray/40 file:bg-gray file:px-3 file:py-2 file:text-xs" />
      <div className="mt-3 flex flex-wrap gap-2"><input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" aria-label="Public source link" disabled={Boolean(busy)} className="min-w-0 flex-1 rounded-lg border border-dark-gray/50 bg-white px-3 py-2 text-xs"/><button type="button" disabled={Boolean(busy)||!url.trim()||!state.storageReady||state.sources.length>=5} onClick={async()=>{setBusy('Reading link');setError('');try{await researchSourceApi.addLink(runId,url.trim());setUrl('');await refresh()}catch(e:any){setError(e.message)}finally{setBusy('')}}} className="rounded-lg border border-dark-gray/50 px-3 py-2 text-xs disabled:opacity-40">Add link</button></div>
    </>}
    {busy && <div role="status" aria-live="polite" className="mt-3 text-xs"><p>{busy}{busy.startsWith('Uploading') ? ` · ${progress}%` : '…'}</p>{busy.startsWith('Uploading') ? <progress max={100} value={progress} className="mt-1 w-full" aria-label="Source upload progress"/> : null}</div>}
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    {state?.sources.length===0 ? <p className="mt-3 text-xs opacity-60">No supplied sources yet. Add files here, or research the web.</p> : null}
    <ul className="mt-3 space-y-3">{state?.sources.map((source:any)=><li key={source.id} className="rounded-xl border border-dark-gray/30 bg-gray p-3 text-xs"><p className="break-words font-medium">{source.name}</p><p className="mt-1 opacity-60">Ready · {source.pages ? `${source.pages} pages · ` : ''}{source.characters.toLocaleString()} characters</p>{source.warnings.map((warning:string)=><p key={warning} className="mt-1">{warning}</p>)}<div className="mt-2 flex flex-wrap gap-4"><a href={source.url} target="_blank" rel="noreferrer" className="underline">Preview extracted text</a><a href={source.originalUrl} className="underline">Download original</a>{editable && <button type="button" disabled={Boolean(busy)} className="underline disabled:opacity-40" onClick={async()=>{setBusy('Removing source');setError('');try{await researchSourceApi.remove(runId,source.id);await refresh()}catch(e:any){setError(e.message)}finally{setBusy('')}}}>Remove from research</button>}</div></li>)}</ul>
    {!editable && state?.sources.length>0 ? <p className="mt-2 text-xs opacity-60">Sources are frozen after research starts. Duplicate the project to change the source set.</p> : null}
  </section>;
}
