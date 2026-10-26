// Synthetic, loopback-only fixture for real browser WebCrypto/IndexedDB checks.
// Run with Node 22; close with Ctrl-C. No wallet, cloud calls or real documents.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),ts=require('typescript');
const modules=new Map(['vault','vault-store','objects'].map(name=>{const source=readFileSync(new URL(`../frontend/src/lib/dr-nib-private-${name}.ts`,import.meta.url),'utf8');return [`/${name}.js`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText]}));
const html=`<!doctype html><html><head><meta charset="utf-8"><title>Dr Nib local privacy storage checks</title><style>body{font:16px system-ui;max-width:850px;margin:40px auto;line-height:1.6}button{padding:12px;margin:8px}li{margin:8px}</style></head><body><h1>Dr Nib local privacy storage checks</h1><p>Synthetic test records only. These checks cover browser crypto and persistence, not hardware attestation.</p><button id="enroll">Enroll synthetic vault</button><button id="reload">Verify after reload</button><button id="recover">Verify recovery context</button><button id="password">Verify password and backup unlock</button><ol id="results"></ol><script type="module">
import {createPrivateVault,createPrivateProjectKeys,recoverPrivateVault,recoverPrivateVaultWithPassword,openPrivateProjectKeys} from '/vault.js';
import {getEnrolledVault,addEnrolledVault,getEnrolledProject,addEnrolledProject} from '/vault-store.js';
import {sealPrivateObject,openPrivateObject} from '/objects.js';
const tenantId='local-browser-fixture',results=document.querySelector('#results');
function check(name,condition){const line=document.createElement('li');line.textContent=(condition?'PASS: ':'FAIL: ')+name;results.append(line);if(!condition)throw Error(name)}
function action(id,fn){document.querySelector(id).onclick=async()=>{results.replaceChildren();try{await fn()}catch(e){const line=document.createElement('li');line.textContent='FAIL: '+e.message;results.append(line)}}}
action('#enroll',async()=>{
 check('secure browser context and IndexedDB available',isSecureContext&&!!indexedDB);
 const made=await createPrivateVault(tenantId),runId=crypto.randomUUID(),project=await createPrivateProjectKeys(made.vault,runId);
 await addEnrolledVault({tenantId,vaultId:made.vault.vaultId,vault:made.vault,recoveryEnvelope:made.recoveryEnvelope,revision:1,recoveryConfirmed:true});
 await addEnrolledProject({tenantId,runId,vaultId:made.vault.vaultId,envelope:project.envelope});
 const c={tenantId,vaultId:made.vault.vaultId,runId,objectId:crypto.randomUUID(),revision:1,purpose:'source'};
 const envelope=await sealPrivateObject(project.secrets.workerStateKey,c,new TextEncoder().encode('SYNTHETIC_BROWSER_PRIVATE_CANARY'));
 // Synthetic recovery fixture only; real recovery secrets NEVER go in localStorage.
 sessionStorage.setItem('fixture',JSON.stringify({runId,recoverySecret:Array.from(made.recoverySecret),context:c,envelope}));
 check('vault transaction committed with a non-extractable key',!(await getEnrolledVault(tenantId)).vault.key.extractable);
 check('project envelope committed without raw keys',!(JSON.stringify(await getEnrolledProject(tenantId,runId))).includes(btoa(String.fromCharCode(...project.secrets.workerStateKey))));
 let denied=false;try{await addEnrolledProject({tenantId,runId,vaultId:made.vault.vaultId,envelope:project.envelope})}catch{denied=true}check('duplicate key enrollment cannot replace original',denied);
 check('saved source is ciphertext',!JSON.stringify(envelope).includes('SYNTHETIC_BROWSER_PRIVATE_CANARY'));
});
action('#reload',async()=>{
 const saved=JSON.parse(sessionStorage.getItem('fixture')),vault=await getEnrolledVault(tenantId),project=await getEnrolledProject(tenantId,saved.runId),secrets=await openPrivateProjectKeys(vault.vault,saved.runId,project.envelope);
 check('IndexedDB retained usable non-extractable CryptoKey after reload',!vault.vault.key.extractable);
 check('original encrypted source reopens after reload',new TextDecoder().decode(await openPrivateObject(secrets.workerStateKey,saved.context,saved.envelope))==='SYNTHETIC_BROWSER_PRIVATE_CANARY');
 let denied=false;try{await openPrivateObject(secrets.workerStateKey,{...saved.context,runId:crypto.randomUUID()},saved.envelope)}catch{denied=true}check('cross-project substitution rejected',denied);
});
action('#recover',async()=>{
 const saved=JSON.parse(sessionStorage.getItem('fixture')),vault=await getEnrolledVault(tenantId),project=await getEnrolledProject(tenantId,saved.runId);
 const recovered=await recoverPrivateVault(Uint8Array.from(saved.recoverySecret),JSON.parse(JSON.stringify(vault.recoveryEnvelope)),{tenantId,vaultId:vault.vaultId});
 const secrets=await openPrivateProjectKeys(recovered,saved.runId,JSON.parse(JSON.stringify(project.envelope)));
 check('independent recovered key context opens original ciphertext',new TextDecoder().decode(await openPrivateObject(secrets.workerStateKey,saved.context,saved.envelope))==='SYNTHETIC_BROWSER_PRIVATE_CANARY');
 let denied=false;try{await recoverPrivateVault(crypto.getRandomValues(new Uint8Array(32)),vault.recoveryEnvelope,{tenantId,vaultId:vault.vaultId})}catch{denied=true}check('wrong recovery code rejected',denied);
 denied=false;try{await recoverPrivateVault(Uint8Array.from(saved.recoverySecret),vault.recoveryEnvelope,{tenantId:'other',vaultId:vault.vaultId})}catch{denied=true}check('wrong account rejected',denied);
});
action('#password',async()=>{
 const tenant='local-browser-fixture-password',password='A unique synthetic notebook phrase for browser checks';
 const made=await createPrivateVault(tenant,undefined,password),runId=crypto.randomUUID();
 const project=await createPrivateProjectKeys(made.vault,runId),remote=JSON.parse(JSON.stringify(made.recoveryEnvelope));
 check('password and backup wrapper enrolled together',remote.version===2);
 const byPassword=await recoverPrivateVaultWithPassword(password,remote,{tenantId:tenant,vaultId:made.vault.vaultId});
 const byCode=await recoverPrivateVault(made.recoverySecret,remote,{tenantId:tenant,vaultId:made.vault.vaultId});
 const expected=await openPrivateProjectKeys(made.vault,runId,project.envelope);
 check('browser PBKDF2 password unlocks original project',JSON.stringify([...expected.reportKeySeed])===JSON.stringify([...(await openPrivateProjectKeys(byPassword,runId,project.envelope)).reportKeySeed]));
 check('independent backup code unlocks same project',JSON.stringify([...expected.workerStateKey])===JSON.stringify([...(await openPrivateProjectKeys(byCode,runId,project.envelope)).workerStateKey]));
 let denied=false;try{await recoverPrivateVaultWithPassword('wrong synthetic password',remote,{tenantId:tenant,vaultId:made.vault.vaultId})}catch{denied=true}
 check('wrong browser password rejected',denied);
});
</script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'");if(modules.has(req.url)){res.setHeader('Content-Type','text/javascript');return res.end(modules.get(req.url))}if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}res.writeHead(404).end()});
server.listen(0,'127.0.0.1',()=>console.log('Local synthetic browser fixture: http://127.0.0.1:'+server.address().port));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
