// Offline preparation only. This file contains no cloud/deploy/payment client.
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {renderCanaryFiles,canaryReadiness,materializeCanaryCompose,sha256} from '../dr-nib/tools/private-canary-config.mjs';
import {privateTerminalPreLaunchScript,BASE_PRELAUNCH_SHA256,TERMINAL_SECCOMP_PATH,TERMINAL_SECCOMP_SHA256} from '../dr-nib/tools/private-terminal-release.mjs';
import {canaryDatabaseSql} from '../dr-nib/tools/private-canary-database.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [mode,input,output]=process.argv.slice(2);
const json=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
async function sourceInventory(){
 const files=[];
 async function walk(dir){for(const entry of await readdir(join(root,dir),{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(entry.isFile()&&!entry.name.startsWith('.env'))files.push(path);}}
 for(const dir of ['dr-nib/backend/src','dr-nib/backend/prisma','dr-nib/private-guest','dr-nib/private-terminal','packages/internal/src','packages/wallet/src','frontend/src/components/dr-nib','frontend/src/app/dr-nib'])await walk(dir);
 for(const dir of ['frontend/src/lib','dr-nib/tools'])for(const entry of await readdir(join(root,dir)))if(entry.startsWith('dr-nib-private')||entry.startsWith('private-canary'))files.push(join(dir,entry));
 for(const f of ['.github/workflows/ci.yml','frontend/next.config.ts','dr-nib/backend/package.json','package.json','pnpm-workspace.yaml','pnpm-lock.yaml','dr-nib/tools/private-guest-release-core.mjs','dr-nib/tools/private-terminal-release.mjs','scripts/drnib-private-canary.mjs','scripts/drnib-private-local-release.mjs','ops/dr-nib-canary/verifier/server.mjs','ops/dr-nib-canary/verifier/Dockerfile','ops/dr-nib-canary/verifier/engine.Dockerfile','ops/dr-nib-canary/verifier/compose.local.yaml','ops/dr-nib-canary/verifier/selection.json'])files.push(f);
 return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async path=>[path,sha256(await readFile(join(root,path)))])));
}
if(mode==='prepare'){
 if(!input||!output)throw Error('Usage: prepare <plan.json> <new-output-directory>');
 const plan=await json(input),files=renderCanaryFiles(plan);
 files['guest/prelaunch-requirements.json']=JSON.stringify({baseScriptSha256:BASE_PRELAUNCH_SHA256,terminalSeccompPath:TERMINAL_SECCOMP_PATH,terminalSeccompSha256:TERMINAL_SECCOMP_SHA256,install:'Measured pre-launch script, before Docker Compose starts',reviewRequired:true},null,2)+'\n';
 files['guest/terminal-seccomp.json']=await readFile(join(root,'dr-nib/private-terminal/seccomp.json'),'utf8');
 for(const name of ['README.md','REVIEW.md','REUSED-INPUTS.md','costs.json','local-verification.json','VERIFIER.md','ROLLOUT.md','verifier/compose.local.yaml','verifier/selection.json'])files[name]=await readFile(join(root,'ops/dr-nib-canary',name),'utf8');
 const require=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url));
 const diff=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{cwd:join(root,'dr-nib/backend'),env:{PATH:process.env.PATH,HOME:process.env.HOME,DRNIB_DATABASE_URL:'postgresql://fixture:unused@127.0.0.1:1/drnib_private_canary?schema=drnib'},encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 if(diff.status!==0)throw Error('Offline schema rendering failed');
 files['database/fresh-canary.sql']=canaryDatabaseSql({schemaSql:diff.stdout,billingView:await readFile(join(root,'dr-nib/backend/prisma/migrations/0015_private_tool_billing_metadata/migration.sql'),'utf8')});
 files['source-inventory.json']=JSON.stringify(await sourceInventory(),null,2)+'\n';
 const dir=resolve(output);if(dir===root||relative(root,dir).split('/').includes('..'))throw Error('Output must be a fresh directory inside this checkout');
 await mkdir(dir,{mode:0o700});
 for(const [file,body] of Object.entries(files)){const dest=join(dir,file);await mkdir(resolve(dest,'..'),{recursive:true});await writeFile(dest,body,{mode:0o600,flag:'wx'});}
 const inventory=Object.fromEntries(Object.entries(files).map(([file,body])=>[file,sha256(body)]));
 await writeFile(join(dir,'bundle-manifest.json'),JSON.stringify({format:'drnib-canary-bundle-v1',files:inventory},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({prepared:true,files:Object.keys(inventory).length,...canaryReadiness(plan)},null,2));
}else if(mode==='verify'){
 const dir=resolve(input),manifest=await json(join(dir,'bundle-manifest.json'));
 if(manifest.format!=='drnib-canary-bundle-v1')throw Error('Invalid bundle');
 for(const [file,hash]of Object.entries(manifest.files)){if(file.startsWith('/')||file.split('/').includes('..')||sha256(await readFile(join(dir,file)))!==hash)throw Error('Bundle file mismatch');}
 const sources=await json(join(dir,'source-inventory.json')),current=await sourceInventory();
 if(JSON.stringify(sources)!==JSON.stringify(current))throw Error('Source changed; regenerate the reviewed bundle');
 console.log(JSON.stringify({integrityVerified:true,...canaryReadiness(await json(join(dir,'reviewed-plan.json')))},null,2));
}else if(mode==='compose'){
 const request=await json(input);const info=await stat(resolve(input));if(info.mode&0o077)throw Error('Credential input must be owner-only (0600)');
 const compose=materializeCanaryCompose(request.plan,request.inputs);
 const prelaunch=privateTerminalPreLaunchScript(request.basePreLaunchScript);
 const fallback=request.openRouterResearchApiKey;
 if(typeof fallback!=='string'||!fallback||/[\r\n\0]/.test(fallback)||fallback.includes('__REQUIRED_'))throw Error('Reviewed fallback credential required');
 const credentials={...request.inputs.secrets,PRIVATE_HOSTED_JEV_API_KEY:request.inputs.hostedJev.apiKey,PRIVATE_OPENROUTER_RESEARCH_API_KEY:fallback};
 const dir=resolve(output);if(!relative(root,dir).split('/').includes('..'))throw Error('Credential output must be outside the repository');await mkdir(dir,{mode:0o700});
 await writeFile(join(dir,'compose.yaml'),compose,{mode:0o600,flag:'wx'});
 await writeFile(join(dir,'pre-launch.sh'),prelaunch,{mode:0o600,flag:'wx'});
 await writeFile(join(dir,'guest.env'),Object.entries(credentials).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
 console.log('Candidate compose and encrypted-env input written locally; final deployment/attestation review is still required. Nothing uploaded.');
}else throw Error('Use prepare, verify or compose. No deployment command is provided.');
