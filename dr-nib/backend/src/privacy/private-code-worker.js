import {parentPort,workerData} from 'node:worker_threads';
import {getQuickJS} from 'quickjs-emscripten';

// Trusted interpreter loader only. No host callbacks, module loader, filesystem,
// network, process/environment, dstack socket or wallet API is given to QuickJS.
let runtime,context;
try{
 const module=await getQuickJS();runtime=module.newRuntime();
 runtime.setMemoryLimit(16*1024*1024);runtime.setMaxStackSize(256*1024);
 const deadline=Date.now()+2000;let interrupted=false;
 runtime.setInterruptHandler(()=>{interrupted=Date.now()>deadline;return interrupted;});
 context=runtime.newContext();
 const source=`(function(){'use strict';const encode=JSON.stringify;const data=JSON.parse(${JSON.stringify(workerData.data)});const output=(function(data){'use strict';\n${workerData.code}\n})(data);return encode(output===undefined?null:output);})()`;
 const result=context.evalCode(source,'private-research.js',{type:'global'});
 if(result.error){result.error.dispose();parentPort.postMessage({ok:false,error:interrupted?'PRIVATE_CODE_TIMEOUT':'PRIVATE_CODE_FAILED'});}
 else{try{const json=context.getString(result.value);parentPort.postMessage(json.length<=32000?{ok:true,json}:{ok:false,error:'PRIVATE_CODE_FAILED'});}finally{result.value.dispose();}}
}catch{parentPort.postMessage({ok:false,error:'PRIVATE_CODE_FAILED'});}
finally{try{context?.dispose();runtime?.dispose();}catch{}parentPort.close();}
