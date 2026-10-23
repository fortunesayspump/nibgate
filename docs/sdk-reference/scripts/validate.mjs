import {readFileSync as read, readdirSync, existsSync, writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, relative, dirname, join} from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const inventory=JSON.parse(read('inventory.json'));
assert.equal(inventory.total,28);assert.equal(new Set(inventory.pages.map(p=>p.name)).size,28);
for(const [path,hash] of Object.entries(inventory.sourceHashes)) assert.equal(createHash('sha256').update(read(resolve('../..',path))).digest('hex'),hash,path);
const files=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);e.isDirectory()?walk(p):files.push(p);}}walk('dist');
let links=0;
for(const file of files.filter(f=>f.endsWith('.html'))){const html=read(file,'utf8');for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){const raw=m[1].replaceAll('&amp;','&');if(/^(?:https?:|data:|mailto:|#|javascript:)/.test(raw))continue;const url=new URL(raw,'https://docs.nibgate.xyz/sdk-reference/'+relative('dist',file));if(!url.pathname.startsWith('/sdk-reference/'))throw Error(`Escaped base path: ${file} ${raw}`);const local=resolve('dist',decodeURIComponent(url.pathname.slice('/sdk-reference/'.length)));assert(local.startsWith(resolve('dist')));assert(existsSync(local)||existsSync(join(local,'index.html')),`Broken link ${file}: ${raw}`);links++;}}
for(const page of inventory.pages){const html=read('dist/'+page.page,'utf8');assert(html.includes(page.name),page.name);assert(html.includes(inventory.commit),page.name+' pin');assert(html.includes('Example'),page.name+' example');}
assert(existsSync('dist/llms.txt'));assert(existsSync('dist/llms-full.txt'));
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','examples.ts'],{stdio:'pipe'});
// Exercise real pure helpers without wallets, RPCs, purchases, or telemetry.
const {normalizeContentType,normalizeResource,validateResourceMetadata}=await import('../../../packages/nibgate/src/core/resource.js');
assert.equal(normalizeContentType('pdf'),'document');assert.equal(normalizeContentType('nonsense'),'article');
assert.equal(normalizeResource({id:'example',type:'audio',price:'1'}).type,'music');
assert.equal(validateResourceMetadata({id:''}).ok,false);
const summary={status:'passed',documentedApis:28,clientMethods:27,standaloneFunctions:1,htmlFiles:files.filter(f=>f.endsWith('.html')).length,checkedLocalLinks:links,pinnedSourceFiles:Object.keys(inventory.sourceHashes).length,exampleTypecheck:'passed with skipLibCheck; missing upstream transfer types are not type-safe',pureHelperAssertions:4,livePaymentsExecuted:false};
const buildHashes=Object.fromEntries(files.sort().map(f=>[relative('dist',f),createHash('sha256').update(read(f)).digest('hex')]));
write('evidence/validation.json',JSON.stringify(summary,null,2)+'\n');write('evidence/build-hashes.json',JSON.stringify(buildHashes,null,2)+'\n');
console.log(JSON.stringify(summary));
