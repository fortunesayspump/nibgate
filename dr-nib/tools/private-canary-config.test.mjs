import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {canaryReadiness,renderCanaryFiles,materializeCanaryCompose} from './private-canary-config.mjs';
const draft=JSON.parse(await readFile(new URL('../../ops/dr-nib-canary/plan.example.json',import.meta.url),'utf8'));
test('draft canary remains explicitly blocked without inventing measurements or spending approval',()=>{
 const result=canaryReadiness(draft);assert.equal(result.configurationComplete,false);assert.ok(result.pending.includes('Separate approval of proposed $5 incremental operator allowance'));assert.equal(result.remoteAcceptanceRequired,true);
 const files=renderCanaryFiles(draft);assert.ok(files['env/frontend.env.example'].includes('PRIVATE_VERIFIER_URL'));assert.ok(files['env/frontend.env.example'].includes('NEXT_PUBLIC_API_URL="https://testnet-api.nibgate.xyz"'));assert.ok(files['env/funding.env.example'].includes('HUB_API_URL="https://testnet-api.nibgate.xyz"'));assert.ok(files['env/frontend.env.example'].includes('BOOT_MANIFEST_JSON=""'));assert.ok(files['env/funding.env.example'].includes('FUNDING_HOST="0.0.0.0"'));assert.ok(files['env/watchdog.env.example'].includes('WATCHDOG_CANARY_DATABASE_URL'));assert.equal(Object.keys(files).some(x=>x.endsWith('compose.yaml')),false);
 assert.throws(()=>materializeCanaryCompose(draft,{}),/REVIEW_INCOMPLETE/);
});
test('canary cannot expand to mainnet, multiple execution slots, shared DB or new budget implicitly',()=>{
 for(const mutate of [x=>x.network='mainnet',x=>x.database='railway',x=>x.runtime.active=2,x=>x.runtime.pending=99,x=>x.proposedBudget.aiMicroUsd=9000000,x=>x.runtime.idleMs=0]){const p=structuredClone(draft);mutate(p);assert.throws(()=>canaryReadiness(p));}
 const p=structuredClone(draft);p.verifierTrustMode='independent';p.origins.verifier='https://verify.nibgate.xyz';assert.throws(()=>canaryReadiness(p),/INDEPENDENT/);
});
test('stale hosted reviews never become executable release inputs',()=>{
 const p=structuredClone(draft);for(const role of ['jev','fallback'])p.hostedReviews[role]={checkedAt:'2026-01-01T00:00:00Z',workspaceId:'fixture',ioLogging:false,broadcast:false,zdrVerified:true,workspaceMatchesKey:true};
 assert.equal(canaryReadiness(p).pending.filter(s=>s.includes('24h expiry')).length,2);
});
test('Railway IaC evaluates offline, isolates owner environment and separates three control services from two Nibgate-operated verifier services',async()=>{
 const {createRequire}=await import('node:module');const{pathToFileURL}=await import('node:url');const require=createRequire(new URL('../backend/package.json',import.meta.url));
 const sdkUrl=pathToFileURL(require.resolve('railway/iac')).href,sdk=await import(sdkUrl);
 const source=renderCanaryFiles(draft)['.railway/railway.ts'].replace("'railway/iac'",JSON.stringify(sdkUrl));
 const{default:program}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.throws(()=>program(sdk.createRailwayContext({environment:'production'}),sdk.project),/CANARY_ENVIRONMENT_REQUIRED/);
 const project=program(sdk.createRailwayContext({environment:'owner-canary'}),sdk.project);
 assert.equal(project.resources.length,3);assert.ok(project.resources.every(r=>!r.name.includes('verifier')));
 const independent=renderCanaryFiles(draft)['verifier/.railway/railway.ts'].replace("'railway/iac'",JSON.stringify(sdkUrl));const verifierProgram=(await import('data:text/javascript;base64,'+Buffer.from(independent).toString('base64'))).default;const verifierProject=verifierProgram(sdk.createRailwayContext({environment:'owner-canary'}),sdk.project);assert.equal(verifierProject.resources.length,2);assert.notEqual(verifierProject.name,project.name);assert.ok(verifierProject.resources.every(r=>r.name.includes('verifier')));assert.deepEqual(sdk.validateGraph({version:1,resources:verifierProject.resources,edges:[]}),[]);assert.deepEqual(sdk.validateGraph({version:1,resources:project.resources,edges:[]}),[]);
 for(const resource of project.resources){assert.equal(resource.source.type,'empty');assert.equal(resource.deploy.sleepApplication,false);assert.equal(resource.deploy.numReplicas,1);assert.equal(resource.tracing.enabled,false);assert.equal(resource.source.repo,undefined);assert.ok(resource.deploy.limitOverride.containers.cpu>0);assert.ok(resource.deploy.limitOverride.containers.memoryBytes>=128*1024*1024);}
 assert.equal(project.resources[2].deploy.healthcheckPath,undefined);
});
test('compose is bound to reviewed gateway, database role, hosted workspace and a real signing key',async()=>{
 const{generateKeyPairSync}=await import('node:crypto'),{ENCRYPTED_SECRET_NAMES}=await import('./private-guest-release-core.mjs');
 const p=structuredClone(draft);p.budgetApproved=true;p.ownerTenantId='fixture-owner';p.cvmId='fixture-cvm';
 p.origins={frontend:'https://canary.nibgate.xyz',broker:'https://broker-canary.nibgate.xyz',funding:'https://funding-canary.nibgate.xyz',verifier:'https://verify.independent.net',guest:'https://guest.phala.network'};
 for(const k of ['guestImage','terminalImage'])p.release[k]='docker.io/fortunesayspump/nibgate-private-guest@sha256:'+'1'.repeat(64);
 p.release.gatewayImage='docker.io/fortunesayspump/private-verifier-gateway@sha256:'+'2'.repeat(64);
 for(const[k,n]of [['appId',40],['instanceId',40],['composeHash',64],['osHash',64],['verifierSpkiSha256',64],['aciComposeHash',64]])p.release[k]='a'.repeat(n);
 p.release.kmsId='aabb';p.release.aciGatewayOrigin='https://inference.phala.network';for(const k of Object.keys(p.release.controls))p.release.controls[k]=true;
 for(const role of ['jev','fallback'])p.hostedReviews[role]={checkedAt:new Date().toISOString(),workspaceId:'fixture-'+role,ioLogging:false,broadcast:false,zdrVerified:true,workspaceMatchesKey:true};
 assert.equal(canaryReadiness(p).configurationComplete,true);
 const inputs=JSON.parse(renderCanaryFiles(p)['guest/compose.inputs.json']);
 inputs.secrets=Object.fromEntries(ENCRYPTED_SECRET_NAMES.map(k=>[k,'fixture-secret']));inputs.secrets.DRNIB_DATABASE_URL='postgresql://drnib_private_canary_guest:fixture@db.internal/drnib_private_canary?schema=drnib';
 inputs.hostedJev.apiKey='fixture-jev-key';inputs.policy.DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M='1000000';inputs.policy.DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M='1000000';
 inputs.policy.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64=Buffer.from(generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})).toString('base64');
 const compose=materializeCanaryCompose(p,inputs);assert.match(compose,/DRNIB_PRIVATE_FUNDING_REQUIRED=true/);assert.ok(!compose.includes('fixture-secret'));
 const preboot=structuredClone(p);preboot.budgetApproved=false;preboot.cvmId=draft.cvmId;for(const key of ['appId','instanceId','composeHash','osHash','kmsId','verifierSpkiSha256'])preboot.release[key]=draft.release[key];assert.equal(canaryReadiness(preboot).configurationComplete,false);assert.equal(materializeCanaryCompose(preboot,inputs),compose);
 for(const mutate of [x=>x.policy.PRIVATE_ACI_GATEWAY_BASE_URL='https://wrong.net',x=>x.hostedJev.policy.PRIVATE_HOSTED_JEV_WORKSPACE_ID='wrong',x=>x.secrets.DRNIB_DATABASE_URL='postgresql://admin:fixture@db.internal/production?schema=drnib',x=>x.policy.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64='bm90LWEta2V5',x=>x.policy.DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M='NaN']){const bad=structuredClone(inputs);mutate(bad);assert.throws(()=>materializeCanaryCompose(p,bad));}
});
test('reused public funding and preboot inputs populate templates; credential-bearing RPCs are rejected',async()=>{
 const{generateKeyPairSync}=await import('node:crypto');const p=structuredClone(draft);
 p.funding={core:'0x'+'1'.repeat(40),splitter:'0x'+'2'.repeat(40),operator:'0x'+'3'.repeat(40),treasury:'0x'+'4'.repeat(40),feeBps:100,rpcUrl:'https://rpc.testnet.arc.io'};
 p.preboot={brokerPublicKeySpkiPemBase64:Buffer.from(generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})).toString('base64'),inputPriceCeiling:'150000',outputPriceCeiling:'700000'};
 const files=renderCanaryFiles(p);assert.ok(files['env/funding.env.example'].includes('ESCROW_CORE="'+p.funding.core+'"'));assert.equal(JSON.parse(files['guest/measured-policy.json']).PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64,p.preboot.brokerPublicKeySpkiPemBase64);
 for(const mutate of [x=>x.funding.rpcUrl='https://rpc.provider.net/secret-token',x=>x.funding.core='invalid',x=>x.preboot.brokerPublicKeySpkiPemBase64='invalid',x=>x.preboot.outputPriceCeiling='NaN']){const bad=structuredClone(p);mutate(bad);assert.throws(()=>renderCanaryFiles(bad));}
});

test('operator-hosted verifier is explicit, isolated and retains required pins',()=>{
 const p=structuredClone(draft);p.verifierTrustMode='operator-hosted';p.origins.verifier='https://verify-drnib-canary.nibgate.xyz';
 const files=renderCanaryFiles(p);assert.ok(files['env/frontend.env.example'].includes('NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_TRUST_MODE="operator-hosted"'));
 assert.ok(canaryReadiness(p).pending.includes('Independently reviewed verifierSpkiSha256'));
 assert.ok(files['env/verifier-gateway.env.example'].includes('http://private-verifier.railway.internal:8080/verify'));
 p.origins.verifier=p.origins.broker;assert.throws(()=>canaryReadiness(p),/ORIGINS_MUST_BE_DISTINCT/);
 p.origins.verifier='https://verify-drnib-canary.nibgate.xyz';p.verifierTrustMode='automatic';assert.throws(()=>canaryReadiness(p),/TRUST_MODE_INVALID/);
});

test('reuse preparation disables project creation and accounts for external preflight model costs',()=>{
 const p=structuredClone(draft);p.deploymentMode='reuse';p.preflightAiMicroUsd=17;p.reuseTargets={projectId:'existing-testnet'};const f=renderCanaryFiles(p);
 assert.match(f['.railway/railway.ts'],/project creation is disabled/);assert.match(f['verifier/.railway/railway.ts'],/project creation is disabled/);
 assert.equal(JSON.parse(f['reuse-service-patches.json']).createSecondPhalaWorker,false);
 assert.equal(JSON.parse(f['guest/measured-policy.json']).DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD,'999983');
 assert.ok(f['env/verifier-gateway.env.example'].includes('drnib-qa-verifier.railway.internal'));
 p.preflightAiMicroUsd=-1;assert.throws(()=>canaryReadiness(p),/PREFLIGHT_USAGE_INVALID/);
});
