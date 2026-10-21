import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
export function createPublicCreatorDetector({WorkerClass=Worker,startupMs=20000,parseMs=30000}={}){
const cache=new Map(),queue=[];
// Wall-clock bounds include cold module loading on the capped control service.
// Parsing stays isolated with the same heap/stack and queue limits.
const unavailable=(reason='worker-error')=>({source:'extension-page-model',eligible:false,kind:'unknown',unavailable:true,reason});
let worker,ready=false,current,timer,completed=0;
function reset(instance,reason){
 if(worker!==instance)return;
 clearTimeout(timer);worker=undefined;ready=false;completed=0;
 if(current){current.resolve(unavailable(reason));current=undefined;}
 else while(queue.length)queue.shift().resolve(unavailable(reason));
 void instance.terminate();dispatch();
}
function dispatch(){
 if(current||!queue.length){if(worker&&ready&&!current)worker.unref();return;}
 if(!worker){
  let instance;
  try{instance=new WorkerClass(new URL('./public-creator-detection-worker.js',import.meta.url),{env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16,stackSizeMb:2}});}catch{queue.shift().resolve(unavailable('worker-create-error'));dispatch();return;}
  worker=instance;ready=false;timer=setTimeout(()=>reset(instance,'startup-timeout'),startupMs);
  instance.on('error',()=>reset(instance,'worker-error'));instance.on('exit',()=>reset(instance,'worker-exit'));
  instance.on('message',message=>{
   if(worker!==instance)return;
   if(message?.ready===true){clearTimeout(timer);ready=true;dispatch();return;}
   if(!current)return;
   clearTimeout(timer);const job=current;current=undefined;completed++;job.resolve(message);
   if(completed>=16){worker=undefined;ready=false;completed=0;void instance.terminate();}
   dispatch();
  });
  return;
 }
 if(!ready)return;
 current=queue.shift();const instance=worker;instance.ref();timer=setTimeout(()=>reset(instance,'parse-timeout'),parseMs);
 worker.postMessage(current.input);
}
/** One reusable ordinary-process detector, not a second Phala service. Public
 * HTML is parsed without scripts/resources or inherited service credentials.
 * Startup and untrusted parsing have separate deadlines; recycle after 16 pages. */
function evaluate(input){return new Promise(resolve=>{if(queue.length>=16){resolve(unavailable('queue-full'));return;}queue.push({input,resolve});dispatch();});}
/** Cache/coalesce public URL + HTML fingerprints. Only bounded public article text and assessment metadata remain in this
 * cache after parsing; no raw HTML or private project state is retained. */
return async function assessPublicCreatorPage(input){
 const none={source:'extension-page-model',eligible:false,kind:'unknown'};
 if(typeof input?.url!=='string'||typeof input?.html!=='string'||input.html.length>500000)return none;
 let url;try{url=new URL(input.url)}catch{return none;}if(url.protocol!=='https:'||url.username||url.password)return none;
 const now=Date.now(),key=createHash('sha256').update(input.url).update('\0').update(input.html).digest('hex');
 for(const [id,row]of cache)if(row.expires<=now)cache.delete(id);
 if(cache.has(key))return cache.get(key).promise;
 while(cache.size>=128)cache.delete(cache.keys().next().value);
 const promise=evaluate({url:input.url,html:input.html}),row={expires:now+600000,promise};cache.set(key,row);
 void promise.then(value=>{if(value.unavailable&&cache.get(key)===row)row.expires=Date.now()+30000;});return promise;
}
}

export const assessPublicCreatorPage=createPublicCreatorDetector();
