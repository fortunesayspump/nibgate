'use client';
import{useEffect,useState}from'react';
import{drNibWorkDuration}from'@/lib/dr-nib-work-duration';
export function RunWorkDuration({run,workerPaused=false}:{run:any;workerPaused?:boolean}){
 const[now,setNow]=useState(()=>Date.now()),work=drNibWorkDuration(run,now,workerPaused);
 const live=work?.live===true;
 useEffect(()=>{if(!live)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[live]);
 if(!work)return null;
 const paused=run.status==='awaiting'?' · waiting for you':run.status==='paused'||workerPaused&&!['complete','ended','failed'].includes(run.status)?' · paused':'';
 return <p className="mt-1.5 text-xs tabular-nums opacity-60" title="Recorded time while the private research worker is active. Excludes waiting for your answers, user pauses and gaps between worker sessions. Older work before time recording began is not reconstructed.">Agent work · <span>{work.label}</span>{paused}</p>;
}
