import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { mergePrevious } from './cloudflare-merge-previous.mjs';

const target=process.argv[2];
if (!['hub-mainnet','hub-testnet','creator-mainnet','creator-lowfi','creator-testnet','docs'].includes(target)) throw Error('Choose an explicit Cloudflare build target');
const toolsDir=resolve('cloudflare/tooling/node_modules');
if (!existsSync(join(toolsDir,'@opennextjs/cloudflare/dist/cli/index.js'))) throw Error('Run npm ci --prefix cloudflare/tooling --ignore-scripts --legacy-peer-deps first');
const network=target.endsWith('testnet')?'testnet':'mainnet';
if(target!=='docs') {
 if(process.env.NEXT_PUBLIC_NIBGATE_NETWORK!==network) throw Error(`NEXT_PUBLIC_NIBGATE_NETWORK must be ${network}`);
 const expected=target.startsWith('hub-')?(network==='mainnet'?'https://api.nibgate.xyz':'https://testnet-api.nibgate.xyz'):(network==='mainnet'?'https://api-subblogs.nibgate.xyz':'https://testnet-api-subblogs.nibgate.xyz');
 if((process.env.NEXT_PUBLIC_API_URL||'').replace(/\/+$/,'')!==expected) throw Error('NEXT_PUBLIC_API_URL does not match target network');
 if(target.startsWith('hub-')) {
  for(const key of ['NEXT_PUBLIC_DRNIB_ENABLED','NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL','NEXT_PUBLIC_DRNIB_PRIVATE_FULL_ENABLED','NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED','NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_URL','NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_TRUST_MODE','NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID','NEXT_PUBLIC_DRNIB_PRIVATE_INSTANCE_ID','NEXT_PUBLIC_DRNIB_PRIVATE_COMPOSE_HASH','NEXT_PUBLIC_DRNIB_PRIVATE_OS_HASH','NEXT_PUBLIC_DRNIB_PRIVATE_KMS_ID','NEXT_PUBLIC_DRNIB_PRIVATE_RELEASE_CONTROLS','DRNIB_PRIVATE_API_URL','DRNIB_PRIVATE_FUNDING_API_URL']) if(!process.env[key]) throw Error(`Missing required frontend build setting ${key}`);
  const origins=network==='mainnet'?{DRNIB_PRIVATE_API_URL:'https://drnib.nibgate.xyz',DRNIB_PRIVATE_FUNDING_API_URL:'https://nibgate-drnib-funding-mainnet-production.up.railway.app'}:{DRNIB_PRIVATE_API_URL:'https://nibgate-drnib-private-synthetic-production.up.railway.app',DRNIB_PRIVATE_FUNDING_API_URL:'https://drnib-private-funding-canary-production.up.railway.app',DRNIB_API_URL:'https://drnib.testnet.nibgate.xyz'};
  for(const [key,value] of Object.entries(origins))if((process.env[key]||'').replace(/\/+$/,'')!==value)throw Error(`${key} does not match target network`);
 } else if((process.env.NEXT_PUBLIC_HUB_API_URL||'').replace(/\/+$/,'')!==(network==='mainnet'?'https://api.nibgate.xyz':'https://testnet-api.nibgate.xyz')) throw Error('Creator Hub API does not match target network');
}
mkdirSync(resolve('.cloudflare-build'),{recursive:true});
function run(command,args,cwd=process.cwd()){const r=spawnSync(command,args,{cwd,stdio:'inherit',env:{...process.env,CLOUDFLARE_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve('.cloudflare-build/wrangler.log')}});if(r.status!==0)throw Error(`${command} failed (${r.status})`)}
if(target==='docs'){run('npm',['--prefix','docs/sdk-reference','ci','--ignore-scripts','--no-audit','--no-fund']);run('pnpm',['--filter','@nibgate/docs','cf:build:static']);process.exit(0)}
const hub=target.startsWith('hub-'),app=hub?'frontend':'subblogs/frontend',out=resolve('.cloudflare-build',hub?'hub':'creator',hub?network:(network==='testnet'?'testnet':'mainnet')),appDir=resolve(app);
// OpenNext config is resolved from the application tree. Expose only the
// isolated adapter package to that resolver; no root package changes needed.
const adapterLink=resolve('node_modules/@opennextjs/cloudflare');
if(!existsSync(adapterLink)){mkdirSync(resolve('node_modules/@opennextjs'),{recursive:true});symlinkSync(join(toolsDir,'@opennextjs/cloudflare'),adapterLink,'dir');}
if(hub&&network==='testnet') {
 const path=resolve('policy-hub-blog.mjs');const original=readFileSync(path,'utf8');process.on('exit',()=>writeFileSync(path,original));const updated=original.replace("host!=='nibgate.xyz'","host!=='testnet.nibgate.xyz'").replaceAll('https://api-subblogs.nibgate.xyz','https://testnet-api-subblogs.nibgate.xyz');if(updated===original)throw Error('Could not pin testnet Hub policy');writeFileSync(path,updated);
}
if(!hub&&network==='testnet') {
 const path=resolve('policy-creator-writing.mjs');const original=readFileSync(path,'utf8');process.on('exit',()=>writeFileSync(path,original));const updated=original.replace("host!=='nibgate.xyz'","host!=='testnet.nibgate.xyz'").replace('\\.nibgate\\.xyz$/.test(host)','\\.testnet\\.nibgate\\.xyz$/.test(host)').replaceAll('https://api-subblogs.nibgate.xyz','https://testnet-api-subblogs.nibgate.xyz');if(updated===original)throw Error('Could not pin testnet creator policy');writeFileSync(path,updated);
}
run(process.execPath,[join(toolsDir,'@opennextjs/cloudflare/dist/cli/index.js'),'build'],appDir);
if(hub) run('node',['scripts/stage-cloudflare-assets.mjs'],appDir);
else {
 const p=join(appDir,'.open-next/server-functions/default/subblogs/frontend/handler.mjs');const s=readFileSync(p,'utf8');const before='getMiddlewareManifest(){return this.minimalMode?null:require(this.middlewareManifestPath)}';const after='getMiddlewareManifest(){return null}';if(s.includes(before)){if(s.split(before).length!==2)throw Error('Ambiguous Next middleware patch');writeFileSync(p,s.replace(before,after));}else if(!s.includes(after))throw Error('Unknown Next middleware runtime; refusing to patch');
}
rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
if(hub){
 const temp=resolve('.cloudflare-build/hub-inner');mkdirSync(temp,{recursive:true});run(process.execPath,[join(toolsDir,'wrangler/bin/wrangler.js'),'deploy','--dry-run','--config','wrangler.jsonc','--outdir',temp],appDir);
 cpSync(resolve('cloudflare/hub',network),out,{recursive:true});
 for(const f of readdirSync(temp)){if(f==='migration-wrapper.js')cpSync(join(temp,f),join(out,'open-next.mjs'));else if(/\.(?:wasm|bin)$/.test(f))cpSync(join(temp,f),join(out,f))}
 const id=readFileSync(join(appDir,'.open-next/assets/BUILD_ID'),'utf8').trim(),w=join(out,'worker.mjs'),s=readFileSync(w,'utf8');if(!/^[A-Za-z0-9_-]+$/.test(id)||!s.includes('__BUILD_ID__'))throw Error('Invalid build identifier');writeFileSync(w,s.replace('__BUILD_ID__',id));
} else {
 cpSync(resolve('cloudflare/creator',network),out,{recursive:true});if(network==='mainnet'){const selected=target==='creator-lowfi'?'wrangler.lowfi.jsonc':'wrangler.mainnet.jsonc';cpSync(join(out,selected),join(out,'wrangler.jsonc'));}
 // Bundle while the network-specific policy is still in place. A later
 // Wrangler invocation must not import the restored source-tree policy.
 const temp=resolve('.cloudflare-build/creator-inner');rmSync(temp,{recursive:true,force:true});mkdirSync(temp,{recursive:true});
 run(process.execPath,[join(toolsDir,'wrangler/bin/wrangler.js'),'deploy','--dry-run','--config','wrangler.jsonc','--outdir',temp],appDir);
 for(const f of readdirSync(temp)){if(f==='migration-wrapper.js')cpSync(join(temp,f),join(out,'open-next.mjs'));else if(/\.(?:wasm|bin)$/.test(f))cpSync(join(temp,f),join(out,f))}
 const w=join(out,'worker.mjs'),s=readFileSync(w,'utf8'),original='../../../subblogs/frontend/migration-wrapper.mjs';
 if(s.split(original).length!==3)throw Error('Unexpected creator wrapper imports');
 writeFileSync(w,s.replaceAll(original,'./open-next.mjs'));
}
cpSync(join(appDir,'.open-next/assets'),join(out,'assets'),{recursive:true,force:true});
mergePrevious(target==='creator-lowfi'?'creator-mainnet':target,join(out,'assets'));
if(!existsSync(join(out,'wrangler.jsonc')))throw Error('Missing deployment configuration');
console.log(`Prepared ${target} in ${out}; no production deployment performed.`);
