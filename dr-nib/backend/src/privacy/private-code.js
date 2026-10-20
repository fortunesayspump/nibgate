import {Worker} from 'node:worker_threads';

let active=0;
/** Model code executes in a disposable QuickJS WebAssembly instance inside
 * the confidential guest, never Node eval/vm, a shell or an external sandbox.
 * The only inputs/outputs crossing that interpreter are bounded JSON. */
export async function runPrivateCode(input){
 if(!input||Object.keys(input).some(k=>!['code','language','data'].includes(k))||
    !['javascript','node'].includes(input.language??'javascript')||typeof input.code!=='string'||!input.code.trim()||Buffer.byteLength(input.code)>16000)throw Error('PRIVATE_CODE_INPUT_INVALID');
 let data;try{data=JSON.stringify(input.data??null);}catch{throw Error('PRIVATE_CODE_INPUT_INVALID');}
 if(Buffer.byteLength(data)>64000)throw Error('PRIVATE_CODE_INPUT_INVALID');
 if(active>=2)throw Error('PRIVATE_CODE_BUSY');
 active++;
 try{return await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./private-code-worker.js',import.meta.url),{workerData:{code:input.code,data},env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:32,maxYoungGenerationSizeMb:8,stackSizeMb:2}});
  let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate().then(()=>error?reject(Error(error)):resolve(value),()=>reject(Error('PRIVATE_CODE_FAILED')));};
  // Also terminates pathological builtins that cannot reach a QuickJS
  // instruction interrupt. Never leave the main worker event loop blocked.
  const timer=setTimeout(()=>finish('PRIVATE_CODE_TIMEOUT'),5000);
  worker.once('message',message=>{
   if(message?.ok!==true||typeof message.json!=='string'||Buffer.byteLength(message.json)>32000)return finish(message?.error==='PRIVATE_CODE_TIMEOUT'?'PRIVATE_CODE_TIMEOUT':'PRIVATE_CODE_FAILED');
   try{finish(null,{result:JSON.parse(message.json),runtime:'quickjs-wasm',network:false,costUsd:0});}catch{finish('PRIVATE_CODE_FAILED');}
  });
  worker.once('error',()=>finish('PRIVATE_CODE_FAILED'));
  worker.once('exit',()=>{if(!done)finish('PRIVATE_CODE_FAILED')});
 });}finally{active--;}
}
