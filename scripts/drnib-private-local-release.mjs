// Offline local repackaging only: no registry uploads, secrets or cloud client.
// The immutable cached parent supplies dependencies. This is not an independent
// clean build/provenance review; run private-guest/Dockerfile for that release.
import {createHash} from 'node:crypto';
import {readFile,readdir,mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
const [base,tag]=process.argv.slice(2);
if(!/^docker\.io\/fortunesayspump\/nibgate-private-guest@sha256:[0-9a-f]{64}$/.test(base??'')||!/^nibgate-private-guest:canary-local-[a-z0-9-]+$/.test(tag??''))throw Error('Supply immutable cached guest parent and a new canary-local tag');
function docker(args,input,timeout=60000){const r=spawnSync('docker',args,{input,encoding:'utf8',timeout,maxBuffer:1024*1024});if(r.error||r.status!==0)throw Error('Local Docker check/build failed: '+((r.error?.message??r.stderr?.slice(-2000))+' '+(r.stdout??'').slice(-1500)));return r.stdout;}
// No pull: if absent, leave the build pending rather than choosing a new parent.
const config=JSON.parse(docker(['image','inspect',base,'--format','{"User":{{json .Config.User}},"WorkingDir":{{json .Config.WorkingDir}},"Cmd":{{json .Config.Cmd}}}']));
if(config.User!=='node'||config.WorkingDir!=='/app/dr-nib/backend'||JSON.stringify(config.Cmd)!==JSON.stringify(['node','src/privacy/private-guest-main.js']))throw Error('Cached parent execution metadata mismatch');
const hashes={};for(const file of ['pnpm-lock.yaml','dr-nib/backend/prisma/schema.prisma'])hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const dependencies={};for(const file of ['package.json','dr-nib/backend/package.json','packages/internal/package.json','packages/wallet/package.json']){const p=JSON.parse(await readFile(file));dependencies[file]={dependencies:p.dependencies??{},devDependencies:p.devDependencies??{},packageManager:p.packageManager??null};}
const expectedPaths=[];async function list(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())await list(f);else if(e.isFile())expectedPaths.push(f);}}
for(const dir of ['dr-nib/backend/src','dr-nib/backend/prisma','packages/internal/src','packages/wallet/src','dr-nib/private-terminal'])await list(dir);
const preflight=`import{readFileSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';for(const[f,h]of Object.entries(${JSON.stringify(hashes)})){if(createHash('sha256').update(readFileSync('/app/'+f)).digest('hex')!==h)throw Error('Cached dependency/schema mismatch: '+f)}for(const[f,wanted]of Object.entries(${JSON.stringify(dependencies)})){const p=JSON.parse(readFileSync('/app/'+f)),actual={dependencies:p.dependencies??{},devDependencies:p.devDependencies??{},packageManager:p.packageManager??null};if(JSON.stringify(actual)!==JSON.stringify(wanted))throw Error('Cached manifest dependency mismatch: '+f)}const expected=new Set(${JSON.stringify(expectedPaths)});function check(dir){for(const e of readdirSync('/app/'+dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())check(f);else if(e.isFile()&&!expected.has(f))throw Error('Cached parent has removed/stale source: '+f)}}for(const dir of ['dr-nib/backend/src','dr-nib/backend/prisma','packages/internal/src','packages/wallet/src','dr-nib/private-terminal'])check(dir);console.log('Cached immutable dependencies, lockfile, source inventory and generated-schema input match.');`;
console.log(docker(['run','--rm','-i','--network','none','--entrypoint','node',base,'--input-type=module'],preflight).trim());
// Never overwrite an existing tag; keep artifacts from other work intact.
const exists=spawnSync('docker',['image','inspect',tag],{stdio:'ignore',timeout:10000});if(exists.error)throw Error('Local image inventory unavailable');if(exists.status===0)throw Error('Local output tag already exists');
const context=await mkdtemp(join(tmpdir(),'drnib-canary-local-build-'));
const files=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','dr-nib/backend/package.json','dr-nib/backend/prisma','dr-nib/backend/src','packages/internal/package.json','packages/internal/src','packages/wallet/package.json','packages/wallet/src','dr-nib/private-terminal'];
try{
 for(const file of files){await mkdir(dirname(join(context,'payload',file)),{recursive:true});await cp(file,join(context,'payload',file),{recursive:true});}
 const recipe=[`FROM ${base}`,'COPY payload/ /app/',''].join('\n');
 await writeFile(join(context,'Dockerfile'),recipe);
 const built=docker(['build','--network=none','--pull=false','-t',tag,context],undefined,150000);
 console.log(built.split('\n').slice(-4).join('\n'));
 console.log(JSON.stringify({localImage:tag,localImageId:docker(['image','inspect',tag,'--format','{{.Id}}']).trim(),parent:base,dependencyReuse:true,published:false}));
}finally{await rm(context,{recursive:true,force:true});}
