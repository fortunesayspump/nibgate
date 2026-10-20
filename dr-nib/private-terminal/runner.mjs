import http from 'node:http';import {spawn}from'node:child_process';import {mkdtemp,mkdir,writeFile,readFile,chmod,chown,lstat,realpath,rm}from'node:fs/promises';import {join,resolve,dirname,sep}from'node:path';import {randomUUID}from'node:crypto';
import {validateTerminalInput,terminalSpec,RUNTIME_RELEASE}from'./policy.mjs';
const RUNSC=process.env.DRNIB_RUNSC_PATH||'/opt/gvisor/runsc',BASE=process.env.DRNIB_TERMINAL_JOB_ROOT||'/tmp/drnib-terminal-jobs',SOCKET=process.env.DRNIB_TERMINAL_SOCKET||'/run/drnib-terminal/service.sock';
let busy=false;
function exec(file,args,{cwd,timeout=60000,maxOut=32768,maxErr=8192}={}){return new Promise((accept,reject)=>{let out='',err='',truncated=false,timedOut=false;const child=spawn(file,args,{cwd,env:{PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',GOMAXPROCS:'2'},stdio:['ignore','pipe','pipe'],detached:true});const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},timeout);child.stdout.on('data',b=>{const text=b.toString(),remaining=Math.max(0,maxOut-out.length);out+=text.slice(0,remaining);if(text.length>remaining)truncated=true});child.stderr.on('data',b=>{const text=b.toString(),remaining=Math.max(0,maxErr-err.length);err+=text.slice(0,remaining);if(text.length>remaining)truncated=true});child.once('error',error=>{clearTimeout(timer);reject(error)});child.once('close',code=>{clearTimeout(timer);accept({exitCode:code,stdout:out,stderr:err,timedOut,truncated})});});}
async function ownedFile(path,content){await mkdir(dirname(path),{recursive:true,mode:0o755});await writeFile(path,content,{mode:0o600});await chown(path,1000,1000);let dir=dirname(path);while(dir.includes('/work/')||dir.endsWith('/work')){await chown(dir,1000,1000);dir=dirname(dir);}}
export async function executeTerminal(value){
 const input=validateTerminalInput(value);if(busy)throw Error('PRIVATE_TERMINAL_BUSY');busy=true;
 let bundle;
 try{
  await mkdir(BASE,{recursive:true,mode:0o700});bundle=await mkdtemp(join(BASE,'job-'));const work=join(bundle,'work'),rootfs=join(bundle,'rootfs'),id='drnib-'+randomUUID(),started=Date.now();
  await mkdir(work,{mode:0o755});await chown(work,1000,1000);await mkdir(rootfs,{mode:0o755});
  for(const name of ['usr','bin','lib','lib64','sbin','proc','dev','tmp','work','etc'])await mkdir(join(rootfs,name),{mode:0o755});
  await mkdir(join(rootfs,'etc/alternatives'),{recursive:true,mode:0o755});await mkdir(join(rootfs,'etc/ssl/certs'),{recursive:true,mode:0o755});await writeFile(join(rootfs,'etc/ld.so.cache'),'');
  const helper=join(work,'.terminal');await mkdir(helper,{mode:0o755});
  for(const [path,text]of Object.entries(input.files))await ownedFile(join(work,path),text);
  await ownedFile(join(helper,'command.sh'),input.command);
  const proxy=input.publicResponses.length>0;
  if(proxy){
   const names=[...new Set(input.publicResponses.map(r=>new URL(r.url).hostname))];if(names.some(n=>!/^[a-zA-Z0-9.-]+$/.test(n)))throw Error('PRIVATE_TERMINAL_INPUT_INVALID');
   const generated=await exec('/usr/bin/openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',join(helper,'key.pem'),'-out',join(helper,'cert.pem'),'-days','1','-subj','/CN=DrNib approved response cache','-addext','subjectAltName='+names.map(n=>'DNS:'+n).join(',')],{timeout:10000});if(generated.exitCode!==0)throw Error('PRIVATE_TERMINAL_UNAVAILABLE');
   for(const name of ['key.pem','cert.pem']){await chmod(join(helper,name),0o600);await chown(join(helper,name),1000,1000);}
   await ownedFile(join(helper,'responses.json'),JSON.stringify(input.publicResponses));await ownedFile(join(helper,'proxy.mjs'),await readFile(new URL('./cache-proxy.mjs',import.meta.url)));
  }
  const prefix=proxy?'node /work/.terminal/proxy.mjs >/work/.terminal/ready 2>/work/.terminal/proxy-errors &\nproxy_pid=$!\ntrap \'kill "$proxy_pid" 2>/dev/null || true\' EXIT\nfor n in $(seq 1 100); do if grep -q ready /work/.terminal/ready 2>/dev/null; then break; fi; sleep 0.05; done\ngrep -q ready /work/.terminal/ready\n':'';
  await ownedFile(join(helper,'start.sh'),'#!/bin/bash\nset -eu\n'+prefix+'bash --noprofile --norc /work/.terminal/command.sh\n');
  await writeFile(join(bundle,'config.json'),JSON.stringify(terminalSpec({rootfs,work,command:input.command,networkProxy:proxy})),{mode:0o600});
  const args=['--ignore-cgroups','--root='+join(BASE,'state'),'--network=none','--platform=systrap','--directfs=false'];
  const result=await exec(RUNSC,[...args,'run','--bundle='+bundle,id]);
  await exec(RUNSC,[...args,'kill',id,'KILL'],{timeout:5000}).catch(()=>{});await exec(RUNSC,[...args,'delete','--force',id],{timeout:5000}).catch(()=>{});
  const artifacts={};let total=0;
  for(const path of input.persist){const requested=join(work,path);try{const actual=await realpath(requested);if(!actual.startsWith(resolve(work)+sep)||(await lstat(requested)).isSymbolicLink())continue;const stat=await lstat(actual);if(!stat.isFile()||stat.size>65536||total+stat.size>131072)continue;const data=await readFile(actual);if(data.includes(0))continue;artifacts[path]=data.toString('utf8');total+=data.length;}catch{}}
  return {...result,artifacts,seconds:Math.round((Date.now()-started)/10)/100,engine:'gvisor',runtimeRelease:RUNTIME_RELEASE,network:'approved-response-cache',costUsd:0,computeBilling:'operator-funded-unmetered'};
 }finally{if(bundle)await rm(bundle,{recursive:true,force:true}).catch(()=>{});busy=false;}
}
export async function startTerminalServer(){
 const version=await exec(RUNSC,['--version'],{timeout:5000});if(version.exitCode!==0||!version.stdout.includes(RUNTIME_RELEASE))throw Error('PRIVATE_TERMINAL_RUNTIME_INVALID');
 await mkdir(dirname(SOCKET),{recursive:true,mode:0o750});await chown(dirname(SOCKET),0,1000);await rm(SOCKET,{force:true});
 const server=http.createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.method!=='POST'||req.url!=='/execute'){res.writeHead(404);res.end('{}');return}try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>650000)throw Error('PRIVATE_TERMINAL_INPUT_INVALID');chunks.push(chunk)}const result=await executeTerminal(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.end(JSON.stringify(result));}catch{res.writeHead(503);res.end('{"code":"PRIVATE_TERMINAL_UNAVAILABLE"}');}});
 await new Promise(accept=>server.listen(SOCKET,accept));await chmod(SOCKET,0o660);await chown(SOCKET,0,1000);return server;
}
if(process.argv[1]===new URL(import.meta.url).pathname)startTerminalServer().catch(()=>{process.exitCode=1});
