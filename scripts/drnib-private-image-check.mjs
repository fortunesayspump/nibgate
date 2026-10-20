// Verify the built artifact contains the exact workstation source and can load
// its real runtime dependencies. No network, credentials, or fake TEE evidence.
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
const image=process.argv[2];
const sourceImportsOnly=process.argv[3]==='--source-imports-only';
if(process.argv[3]&&!sourceImportsOnly||process.argv.length>4)throw Error('Unknown image check option');
if(!image||!/^[A-Za-z0-9@:/_.-]+$/.test(image))throw Error('Supply a local guest image reference');
let layers;
try{layers=JSON.parse(execFileSync('docker',['image','inspect','--format','{{json .RootFS.Layers}}',image],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}
catch{execFileSync('docker',['pull',image],{stdio:'ignore'});layers=JSON.parse(execFileSync('docker',['image','inspect','--format','{{json .RootFS.Layers}}',image],{encoding:'utf8'}));}
if(!Array.isArray(layers)||layers.length>100)throw Error('Guest image exceeds the 100-layer release bound; rebuild from the reviewed clean Node base.');
console.log('Guest filesystem layer count: '+layers.length+' (maximum 100).');
const records=[];
async function visit(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())await visit(file);else if(entry.isFile())records.push([file,createHash('sha256').update(await readFile(file)).digest('hex')]);}}
for(const path of ['dr-nib/backend/src','dr-nib/backend/prisma','packages/internal/src','packages/wallet/src','dr-nib/private-terminal'])await visit(path);
for(const file of ['pnpm-lock.yaml','dr-nib/backend/package.json','packages/internal/package.json','packages/wallet/package.json'])records.push([file,createHash('sha256').update(await readFile(file)).digest('hex')]);
records.sort(([a],[b])=>a.localeCompare(b));
const program=`import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const records=${JSON.stringify(records)};
for(const [file,hash] of records){if(createHash('sha256').update(await readFile('/app/'+file)).digest('hex')!==hash)throw Error('Image source mismatch: '+file)}
for(const name of ['./src/privacy/private-guest-main.js','./src/privacy/private-workflow.js','./src/sources/ocr.js','./src/exports/render.js'])await import(name);
const {PrismaClient,Prisma}=await import('@prisma/client');const db=new PrismaClient();
const receipt=Prisma.dmmf.datamodel.models.find(m=>m.name==='PrivateActionReceipt');
for(const field of ['leaseOwner','leaseUntil'])if(!receipt?.fields.some(f=>f.name===field))throw Error('Image generated schema lacks '+field);
for(const name of ['privateVaultRecord','privateClientObject','privateActionReceipt','privateInferenceCall','privateToolCall'])if(typeof db[name]?.create!=='function')throw Error('Image schema mismatch: '+name);
console.log('Exact '+records.length+' source hashes, generated schema and real runtime imports verified.');
if(${sourceImportsOnly}){console.log('SOURCE/IMPORT CHECK ONLY: QuickJS execution has not been checked by this command.');process.exit(0);}
const {runPrivateCode}=await import('./src/privacy/private-code.js');const computed=await runPrivateCode({code:'return 126 - 98'});if(computed.result!==28)throw Error('Image QuickJS runtime failed');
await db.$disconnect();console.log('Exact source hashes and real runtime imports verified ('+records.length+' files); no network or inference.');process.exit(0);`;
const child=spawn('docker',['run','--rm','-i','--network','none','--entrypoint','node',image,'--input-type=module'],{stdio:['pipe','inherit','inherit']});
child.stdin.end(program);child.on('error',()=>{process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1});
