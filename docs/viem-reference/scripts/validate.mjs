import { readFileSync as read, readdirSync, existsSync, writeFileSync as write, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, join } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as viem from 'viem';

const inventory=JSON.parse(read('inventory.json'));
assert.equal(inventory.total,24);
assert.equal(new Set(inventory.pages.map(p=>p.name)).size,24);
assert.equal(JSON.parse(read('node_modules/viem/package.json')).version,inventory.version);
assert(read('LICENSE.viem','utf8').includes('MIT License'));
for(const [path,hash] of Object.entries(inventory.sourceHashes)) assert.equal(createHash('sha256').update(read(resolve('vendor/viem',path))).digest('hex'),hash,path);
for(const page of inventory.pages){
  assert.equal(typeof viem[page.name],'function',`npm public export ${page.name}`);
  const npmSource=resolve('node_modules/viem',page.path.replace(/^src\//,''));
  assert.equal(read(npmSource,'utf8'),read(resolve('vendor/viem',page.path),'utf8'),`npm source matches pinned Git ${page.path}`);
}
copyFileSync('dist/pages/introduction.html','dist/index.html');
const files=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);e.isDirectory()?walk(p):files.push(p);}}
walk('dist');
let links=0,fragments=0;
for(const file of files.filter(f=>f.endsWith('.html'))){
  const html=read(file,'utf8');
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const raw=match[1].replaceAll('&amp;','&');
    if(raw==='#')continue;
    if(/^(?:https?:|data:|mailto:|javascript:)/.test(raw)) continue;
    const url=new URL(raw,'https://docs.nibgate.xyz/viem-reference/'+relative('dist',file));
    if(url.pathname==='/'||url.pathname.startsWith('/fonts/')||url.pathname.startsWith('/brand/'))continue;
    assert(url.pathname.startsWith('/viem-reference/'),`Escaped base path ${file}: ${raw}`);
    const local=resolve('dist',decodeURIComponent(url.pathname.slice('/viem-reference/'.length)));
    assert(local.startsWith(resolve('dist')));
    assert(existsSync(local)||existsSync(join(local,'index.html')),`Broken link ${file}: ${raw}`);
    if(url.hash&&local.endsWith('.html')){
      const target=read(local,'utf8');const anchor=decodeURIComponent(url.hash.slice(1));
      assert(target.includes(`id="${anchor}"`),`Missing fragment ${file}: ${raw}`);fragments++;
    }
    links++;
  }
}
for(const page of inventory.pages){const html=read('dist/'+page.page,'utf8');assert(html.includes(page.name));assert(html.includes(inventory.commit));assert(html.includes('Example from Upstream'));}
assert(existsSync('dist/llms.txt'));assert(existsSync('dist/llms-full.txt'));
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','examples.ts'],{stdio:'pipe'});

// Real deterministic helper results. No RPC requests, credentials or signing.
let assertions=0; const eq=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++;};
eq(viem.parseUnits('420',9),420000000000n);
eq(viem.formatUnits(420000000000n,9),'420');
eq(viem.parseUnits('1.0000009',6),1000001n);
eq(viem.formatUnits(viem.parseUnits('-1.25',6),6),'-1.25');
eq(viem.formatEther(viem.parseEther('1.25')),'1.25');
eq(viem.toHex('hello world'),'0x68656c6c6f20776f726c64');
eq(viem.stringToBytes('hello world'),new Uint8Array([104,101,108,108,111,32,119,111,114,108,100]));
eq(viem.keccak256('0xdeadbeef'),'0xd4fd4e189132273036449fc9e11198c739161b4c0116a9a2dccdfa1c492006f1');
eq(viem.hashMessage('hello world'),viem.hashMessage({raw:'0x68656c6c6f20776f726c64'}));
const recovered=await viem.recoverMessageAddress({message:'hello world',signature:'0xa461f509887bd19e312c0c58467ce8ff8e300d3c1a90b608a760c5b80318eaf15fe57c96f9175d6cd4daad4663763baa7e78836e067d0163e9a2ccf2ff753f5b1b'});
eq(recovered,'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
eq(viem.isAddress(recovered),true);eq(viem.isAddressEqual(recovered,recovered.toLowerCase()),true);
eq(viem.isAddress('0x1234'),false);
const params=[{type:'uint256'},{type:'string'}];
eq(viem.decodeAbiParameters(params,viem.encodeAbiParameters(params,[42n,'hello'])),[42n,'hello']);
const abi=[{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'owner',type:'address'}],outputs:[{type:'uint256'}]}];
const data=viem.encodeFunctionData({abi,functionName:'balanceOf',args:[recovered]});
eq(viem.decodeFunctionData({abi,data}),{functionName:'balanceOf',args:[recovered]});
const events=[{type:'event',name:'Value',inputs:[{name:'value',type:'uint256',indexed:false}]}];
eq(viem.decodeEventLog({abi:events,topics:[viem.keccak256(viem.stringToBytes('Value(uint256)'))],data:viem.encodeAbiParameters([{type:'uint256'}],[42n])}),{eventName:'Value',args:{value:42n}});
const summary={status:'passed',commit:inventory.commit,version:inventory.version,documentedApis:24,htmlFiles:files.filter(f=>f.endsWith('.html')).length,checkedLocalLinks:links,checkedFragments:fragments,pinnedInputFiles:Object.keys(inventory.sourceHashes).length,npmSourceMatches:24,exampleTypecheck:'passed; skipLibCheck excludes dependency declaration internals',pureHelperAssertions:assertions,liveRpcRequestsExecuted:false,livePaymentsExecuted:false,upstreamFullTestSuiteExecuted:false};
write('evidence/validation.json',JSON.stringify(summary,null,2)+'\n');
write('evidence/build-hashes.json',JSON.stringify(Object.fromEntries(files.sort().map(f=>[relative('dist',f),createHash('sha256').update(read(f)).digest('hex')])),null,2)+'\n');
console.log(JSON.stringify(summary));
