// Owner workstation only. Prepare encrypted Phala secrets and a digest-pinned
// compose file for the existing dedicated test guest; never print secret values.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicKey} from 'node:crypto';
import {privateTerminalPreLaunchScript} from '../dr-nib/tools/private-terminal-release.mjs';
import {privateGuestCompose,MEASURED_POLICY_NAMES} from '../dr-nib/tools/private-guest-release-core.mjs';
const require=createRequire(new URL('../dr-nib/backend/package.json',import.meta.url));
const dotenv=require('dotenv');
const image=process.env.DRNIB_RELEASE_IMAGE;
const directory=process.env.DRNIB_RELEASE_DIRECTORY;
if(!/^docker\.io\/fortunesayspump\/nibgate-private-guest@sha256:[0-9a-f]{64}$/.test(image||'')||!directory?.startsWith('/'))throw Error('Supply an exact reviewed image digest and absolute release directory');
const owner=dotenv.parse(await readFile('/Users/fortune/Documents/Codex/2026-10-16/task-5/owner-only-phala.env','utf8'));
const broker=JSON.parse(await readFile('/tmp/drnib-private-broker-vars.json','utf8'));
const storage=JSON.parse(await readFile('/tmp/drnib-private-storage-vars.json','utf8'));
const names=['DRNIB_DATABASE_URL','PRIVATE_AI_API_KEY','DRNIB_PRIVATE_TEST_TENANT_ID','PRIVATE_AI_APPROVED_MODEL','PRIVATE_ACI_GATEWAY_BASE_URL','PRIVATE_ACI_COMPOSE_HASH','DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD','DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD','DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M','DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M'];
const secrets=Object.fromEntries(names.map(name=>[name,owner[name]]));
if(process.env.DRNIB_RELEASE_APPROVED_MODEL){
 const model=process.env.DRNIB_RELEASE_APPROVED_MODEL;
 if(!['qwen/qwen3.8-27b','phala/gemma-4-26b-a4b-uncensored'].includes(model))throw Error('Unreviewed alternate model');
 secrets.PRIVATE_AI_APPROVED_MODEL=model;
}
const database=new URL(secrets.DRNIB_DATABASE_URL);
if(database.pathname!=='/drnib_private_synthetic'||database.username!=='drnib_private_guest_testnet'||secrets.DRNIB_PRIVATE_TEST_TENANT_ID!==broker.DRNIB_PRIVATE_TEST_TENANT_ID)throw Error('Wrong dedicated guest database or owner');
if(process.env.DRNIB_LOCAL_VERIFIED_OWNER_FILE){
 const identity=JSON.parse(await readFile(process.env.DRNIB_LOCAL_VERIFIED_OWNER_FILE,'utf8'));
 if(!/^[A-Za-z0-9:_-]{1,128}$/.test(identity.id)||!/^0x[0-9a-f]{40}$/i.test(identity.walletAddress)||Date.now()-Date.parse(identity.verifiedAt)>3600000||!Number.isFinite(Date.parse(identity.verifiedAt)))throw Error('Invalid recent signed owner identity');
 secrets.DRNIB_PRIVATE_TEST_TENANT_ID=identity.id;
}
if(secrets.DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD!=='50000'||secrets.DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD!=='50000')throw Error('Owner test spending limits changed');
// Owner approval on 18 October reallocates the same $1 maximum to
// $0.65 AI + $0.35 infrastructure. Earlier approved pairs remain explicit.
const approvedTestCap=process.env.DRNIB_RELEASE_APPROVED_TEST_CAP_MICRO_USD??'50000';
const approvedInfraCap=process.env.DRNIB_RELEASE_APPROVED_INFRA_CAP_MICRO_USD??approvedTestCap;
if(!['50000:50000','250000:250000','750000:250000','650000:350000','650000:950000','650000:1050000','650000:1100000','650000:1200000','650000:1250000','650000:1300000','650000:1350000','650000:1400000','650000:1450000','670000:1430000','770000:1480000','770000:1540000'].includes(`${approvedTestCap}:${approvedInfraCap}`))throw Error('Unapproved owner test cap pair');
secrets.DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD=approvedTestCap;
secrets.DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD=approvedInfraCap;
// Price review is explicit and separate from the unchanged spending cap.
for(const side of ['INPUT','OUTPUT']){
 const reviewed=process.env[`DRNIB_RELEASE_${side}_PRICE_CEILING_MICRO_USD_PER_M`];
 if(!/^[1-9][0-9]*$/.test(reviewed||'')||!Number.isSafeInteger(Number(reviewed)))throw Error('Supply reviewed current per-token price ceilings');
 secrets[`DRNIB_PRIVATE_AI_${side}_PRICE_CEILING_MICRO_USD_PER_M`]=reviewed;
}
secrets.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64=createPublicKey(broker.PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM).export({format:'pem',type:'spki'}).toString().trimEnd().concat('\n');
secrets.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64=Buffer.from(secrets.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64).toString('base64');
for(const name of ['R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','DRNIB_R2_BUCKET'])secrets[name]=storage[name];
if(Object.values(secrets).some(value=>typeof value!=='string'||!value||/[\r\n\0]/.test(value)))throw Error('Invalid guest secret configuration');
// Encrypted environment values are not boot-measurement policy inputs on this
// deployment. Pin all authorization/inference/budget policy in measured compose
// literals; otherwise an operator could alter a trust pin without changing the
// browser's accepted measurements. Credentials/storage receive ciphertext only.
const policyNames=MEASURED_POLICY_NAMES;
const policy=Object.fromEntries(policyNames.map(name=>[name,secrets[name]]));
for(const name of policyNames)delete secrets[name];
let hostedJev;
if(process.env.DRNIB_RELEASE_HOSTED_JEV==='true'){
 const evidence=JSON.parse(await readFile('/tmp/drnib-jev-zdr-route-evidence.json','utf8'));
 const metadata=JSON.parse(await readFile('/tmp/drnib-hosted-jev-key-metadata.json','utf8'));
 const {OPENROUTER_API_KEY:apiKey}=JSON.parse(await readFile('/tmp/drnib-hosted-jev-key.json','utf8'));
 if(evidence.status!=='native-zdr-request-passed'||evidence.provider!=='TypeSafe'||evidence.model!=='typesafe/jev-1.13-20260917'||Date.now()-Date.parse(evidence.checkedAt)>24*3600000||evidence.settings?.ioLogging!==false||evidence.settings?.broadcast!==false||evidence.settings?.credentialWorkspaceMatchesVisibleDefault!==true)throw Error('Hosted JEV review unavailable');
 hostedJev={apiKey,policy:{DRNIB_PRIVATE_HOSTED_JEV_ENABLED:'true',PRIVATE_HOSTED_JEV_CONTEXT_DISCLOSURE:'openrouter-and-typesafe',PRIVATE_HOSTED_JEV_ZDR_VERIFIED:'true',PRIVATE_HOSTED_JEV_WORKSPACE_ID:metadata.data.workspace_id,PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT:evidence.checkedAt}};
}
const terminal=process.env.DRNIB_RELEASE_TERMINAL_IMAGE?{image:process.env.DRNIB_RELEASE_TERMINAL_IMAGE}:undefined;
let preLaunchScript;
if(terminal){
 const base=process.env.DRNIB_RELEASE_BASE_COMPOSE_JSON;
 if(!base?.startsWith('/'))throw Error('Supply the independently reviewed base compose JSON for terminal pre-launch preparation');
 preLaunchScript=privateTerminalPreLaunchScript(JSON.parse(await readFile(base,'utf8')).pre_launch_script);
}
const compose=privateGuestCompose({image,policy,secrets,hostedJev,terminal,modelPool:process.env.DRNIB_RELEASE_MODEL_POOL??'single',fundingRequired:process.env.DRNIB_RELEASE_FUNDED_MODE==='true'});
if(hostedJev)secrets.PRIVATE_HOSTED_JEV_API_KEY=hostedJev.apiKey;
if(process.env.DRNIB_RELEASE_MODEL_POOL==='phala-openrouter-zdr-canary-v1'){
 const original=JSON.parse(await readFile('/tmp/drnib-launch-existing-research-vars.json','utf8'));
 const review=JSON.parse(await readFile('/tmp/drnib-openrouter-route-review.json','utf8'));
 const jevMetadata=JSON.parse(await readFile('/tmp/drnib-hosted-jev-key-metadata.json','utf8'));
 if(review.key?.body?.data?.workspace_id!==jevMetadata.data.workspace_id||Date.now()-Date.parse(review.checkedAt)>24*3600000||!original.OPENROUTER_API_KEY)throw Error('Hosted research workspace review unavailable');
 secrets.PRIVATE_OPENROUTER_RESEARCH_API_KEY=original.OPENROUTER_API_KEY;
}
await mkdir(directory,{mode:0o700,recursive:true});
await writeFile(directory+'/guest.env',Object.entries(secrets).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600,flag:'wx'});
if(preLaunchScript)await writeFile(directory+'/pre-launch.sh',preLaunchScript,{mode:0o600,flag:'wx'});
await writeFile(directory+'/compose.yaml',compose,{mode:0o600,flag:'wx'});
console.log('Prepared digest-pinned compose and allowlisted encrypted guest secrets; no secret values emitted.');
