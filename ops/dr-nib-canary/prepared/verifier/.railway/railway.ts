// Review-only owner canary. Apply/upload requires separate approval.
// No Git source: upload the exact reviewed local snapshot after approval.
import {defineRailway, service, empty} from 'railway/iac';
const deploy={numReplicas:1,sleepApplication:false,restartPolicyType:'ON_FAILURE',restartPolicyMaxRetries:3};
const limits={ 'private-broker':[0.5,512], 'private-funding':[1,768], 'private-watchdog':[0.25,256], 'private-verifier':[1,1024], 'private-verifier-gateway':[0.25,128] };
const resources=name=>({containers:{cpu:limits[name][0],memoryBytes:limits[name][1]*1024*1024}});
const app=(name,command,health=true)=>service(name,{source:empty(),build:{builder:'RAILPACK',watchPatterns:['dr-nib/**','packages/**','package.json','pnpm-lock.yaml']},deploy:{...deploy,limitOverride:resources(name),startCommand:command,...(health?{healthcheckPath:'/health',healthcheckTimeout:120}:{})},tracing:{enabled:false,autoInstrumentation:false}});
const docker=(name,path)=>service(name,{source:empty(),build:{builder:'DOCKERFILE',dockerfilePath:path},deploy:{...deploy,limitOverride:resources(name),healthcheckPath:'/health',healthcheckTimeout:120},tracing:{enabled:false,autoInstrumentation:false}});
export default defineRailway((ctx,project)=>{if(ctx.environment!=='owner-canary')throw Error('CANARY_ENVIRONMENT_REQUIRED');return project('drnib-attestation-canary',{environments:['owner-canary'],resources:[
 app('private-broker','pnpm --filter @nibgate/dr-nib-backend start:private-broker'),
 app('private-funding','pnpm --filter @nibgate/dr-nib-backend start:private-funding'),
 app('private-watchdog','pnpm --filter @nibgate/dr-nib-backend start:private-watchdog',false),
 docker('private-verifier','ops/dr-nib-canary/verifier/engine.Dockerfile'),
 docker('private-verifier-gateway','ops/dr-nib-canary/verifier/Dockerfile'),
].filter(resource=>resource.name.includes('verifier')===true)});});
