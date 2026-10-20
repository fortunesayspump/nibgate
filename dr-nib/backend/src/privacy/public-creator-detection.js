import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
const cache=new Map(),queue=[];
const unavailable=()=>({source:'extension-page-model',eligible:false,kind:'unknown',unavailable:true});
let worker,ready=false,current,timer,completed=0;
function reset(instance){
 if(worker!==instance)return;
 clearTimeout(timer);worker=undefined;ready=false;completed=0;
 if(current){current.resolve(unavailable());current=undefined;}
 void instance.terminate();dispatch();
}
function dispatch(){
 if(current||!queue.length){if(worker&&ready&&!current)worker.unref();return;}
 if(!worker){
  let instance;
  try{instance=new Worker(new URL('./public-creator-detection-worker.js',import.meta.url),{env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16,stackSizeMb:2}});}catch{queue.shift().resolve(unavailable());dispatch();return;}
  worker=instance;ready=false;timer=setTimeout(()=>reset(instance),8000);
  instance.on('error',()=>reset(instance));instance.on('exit',()=>reset(instance));
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
 current=queue.shift();const instance=worker;instance.ref();timer=setTimeout(()=>reset(instance),3000);
 worker.postMessage(current.input);
}
/** One reusable ordinary-process detector, not a second Phala service. Public
 * HTML is parsed without scripts/resources or inherited service credentials.
 * Startup and untrusted parsing have separate deadlines; recycle after 16 pages. */
function evaluate(input){return new Promise(resolve=>{if(queue.length>=16){resolve(unavailable());return;}queue.push({input,resolve});dispatch();});}
/** Cache/coalesce public URL + HTML fingerprints. Only bounded public article text and assessment metadata remain in this
 * cache after parsing; no raw HTML or private project state is retained. */
export async function assessPublicCreatorPage(input){
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
