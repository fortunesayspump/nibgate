'use client';
import {useEffect, useState, useSyncExternalStore} from 'react';
import {Check, Loader2, ShieldCheck} from 'lucide-react';
import {getPrivateConnection, getServerPrivateConnection, subscribePrivateConnection} from '@/lib/dr-nib-private-connection';

const labels = {
  connecting: 'Connecting to private worker…',
  starting: 'Waking private worker…',
  draining: 'Waiting for private worker to restart…',
  verifying: 'Verifying secure connection…',
};
const steps = ['Connect', 'Start worker', 'Verify'];
export default function PrivateWorkerStatus() {
  const connection = useSyncExternalStore(subscribePrivateConnection, getPrivateConnection, getServerPrivateConnection);
  const [now, setNow] = useState(()=>Date.now());
  useEffect(()=>{
    if(!connection)return;
    setNow(Date.now());
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[connection?.startedAt]);
  if (!connection) return null;
  const elapsed=Math.max(0,Math.floor((now-connection.startedAt)/1000));
  const current=connection.phase==='connecting'?0:connection.phase==='verifying'?2:1;
  const time=elapsed<60?`${elapsed}s`:`${Math.floor(elapsed/60)}m ${String(elapsed%60).padStart(2,'0')}s`;
  const detail=connection.phase==='verifying'?'Checking the worker identity before releasing your project keys.':connection.phase==='draining'?'Finishing the previous worker session. Your request stays queued.':connection.phase==='starting'?(elapsed>=120?'Still checking startup. Your saved request will continue when the worker is ready.':elapsed>=30?'Cold starts can take a few minutes. Your request is saved; no need to submit it again.':'Starting the worker and checking that its services are ready.'):'Checking the connection and preparing your saved request.';
  return <section style={{color:'var(--nib-page-fg)'}} aria-label="Private worker startup" className="mx-auto mb-4 w-full max-w-xl rounded-2xl border border-dark-gray/20 px-4 py-3 text-xs">
    <div className="flex items-center justify-between gap-3">
      <div role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 font-medium">
        {connection.phase==='verifying'?<ShieldCheck size={15} className="shrink-0 motion-safe:animate-pulse" aria-hidden="true"/>:<Loader2 size={15} className="shrink-0 motion-safe:animate-spin" aria-hidden="true"/>}
        <p>{labels[connection.phase]}</p>
      </div>
      <span role="timer" aria-label="Elapsed connection time" aria-live="off" className="shrink-0 tabular-nums opacity-65">{time}</span>
    </div>
    <div role="progressbar" aria-label="Connection milestones" aria-valuemin={0} aria-valuemax={3} aria-valuenow={current} aria-valuetext={`Step ${current+1} of 3: ${steps[current]}`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-current/10">
      <div className="h-full rounded-full bg-current transition-[width] duration-500 motion-reduce:transition-none" style={{width:`${current/3*100}%`}}/>
    </div>
    <ol aria-label="Startup steps" className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
      {steps.map((step,index)=><li key={step} aria-current={index===current?'step':undefined} className={`flex items-center gap-1.5 ${index===current?'font-semibold':index>current?'opacity-40':'opacity-70'}`}>{index<current?<Check size={11} aria-hidden="true"/>:<span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${index===current?'bg-current motion-safe:animate-pulse':'border border-current'}`}/>}<span>{step}</span></li>)}
    </ol>
    <p className="mt-2 text-[11px] leading-relaxed opacity-65">{detail}</p>
  </section>;
}
