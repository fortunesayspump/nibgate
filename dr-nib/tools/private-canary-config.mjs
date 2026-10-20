import {createHash,createPublicKey} from 'node:crypto';
import {NETWORKS} from '../../packages/internal/src/networks.js';
import {privateGuestCompose,MEASURED_POLICY_NAMES} from './private-guest-release-core.mjs';
const CONTROL_NAMES=['productionOsImage','sshDisabled','debugDisabled','plaintextLogsDisabled','imagesDigestPinned'];
const digest=/^sha256:[0-9a-f]{64}$/;
const missing=name=>`__REQUIRED_${name}__`;
function origin(value){try{const u=new URL(value);return u.protocol==='https:'&&u.origin===value&&!u.username&&!u.password&&!u.port&&!u.hostname.endsWith('.example')?u:null}catch{return null}}
export function canaryReadiness(plan,{now=Date.now()}={}){
 const pending=[];
 if(plan.format!=='drnib-owner-canary-v1'||plan.network!=='testnet'||plan.database!=='drnib_private_canary')throw Error('CANARY_SCOPE_INVALID');
 if(plan.runtime.active!==1||!Number.isInteger(plan.runtime.pending)||plan.runtime.pending<1||plan.runtime.pending>8||plan.runtime.idleMs!==300000||plan.runtime.cumulativeRuntimeMs!==3600000)throw Error('CANARY_CAPACITY_INVALID');
 const b=plan.proposedBudget;
 const preflight=plan.preflightAiMicroUsd??0;if(!Number.isSafeInteger(preflight)||preflight<0||preflight>=b.aiMicroUsd)throw Error('CANARY_PREFLIGHT_USAGE_INVALID');
 if(!['fresh','reuse'].includes(plan.deploymentMode??'fresh'))throw Error('CANARY_DEPLOYMENT_MODE_INVALID');
 if(b.totalMicroUsd!==5000000||b.aiMicroUsd!==1000000||b.phalaMicroUsd!==1000000||b.controlPlaneMicroUsd!==2000000||b.contingencyMicroUsd!==1000000||b.customerComputeChargeMicroUsd!==0)throw Error('CANARY_BUDGET_INVALID');
 if(!/^[A-Za-z0-9:_-]{1,128}$/.test(plan.ownerTenantId)||plan.ownerTenantId.startsWith('__'))pending.push('Verified owner account ID');
 for(const name of ['frontend','broker','funding','verifier','guest'])if(!origin(plan.origins[name]))pending.push(`${name} HTTPS origin`);
 if(new Set(Object.values(plan.origins)).size!==5)throw Error('CANARY_ORIGINS_MUST_BE_DISTINCT');
 if(!origin(plan.release.aciGatewayOrigin))pending.push('Reviewed confidential inference gateway origin');
 const trustMode=plan.verifierTrustMode??'independent';
 if(!['independent','operator-hosted'].includes(trustMode))throw Error('CANARY_VERIFIER_TRUST_MODE_INVALID');
 const v=origin(plan.origins.verifier);if(trustMode==='independent'&&v&&(v.hostname==='nibgate.xyz'||v.hostname.endsWith('.nibgate.xyz')))throw Error('CANARY_VERIFIER_MUST_BE_INDEPENDENT');
 for(const key of ['guestImage','terminalImage','gatewayImage'])if(!/^docker\.io\/fortunesayspump\/[a-z0-9-]+@sha256:[0-9a-f]{64}$/.test(plan.release[key]??''))pending.push(`Reviewed ${key} digest`);
 if(!digest.test(plan.release.verifierImageDigest??''))pending.push('Reviewed full-verifier image digest');
 if(!/^[a-zA-Z0-9:_-]{1,128}$/.test(plan.cvmId)||plan.cvmId.startsWith('__'))pending.push('Dedicated canary CVM identity');
 for(const [key,size] of [['appId',40],['instanceId',40],['composeHash',64],['osHash',64],['verifierSpkiSha256',64],['aciComposeHash',64]])if(!new RegExp(`^[0-9a-f]{${size}}$`).test(plan.release[key]??''))pending.push(`Independently reviewed ${key}`);
 if(!/^(?:[0-9a-f]{2})+$/.test(plan.release.kmsId??''))pending.push('Reviewed KMS identity');
 if(!CONTROL_NAMES.every(k=>plan.release.controls?.[k]===true))pending.push('Independent release-control review');
 for(const role of ['jev','fallback']){
  const r=plan.hostedReviews[role],at=Date.parse(r?.checkedAt);
  if(!r||!Number.isFinite(at)||at>now||now-at>=86400000||!r.workspaceId||r.workspaceId.startsWith('__')||r.ioLogging!==false||r.broadcast!==false||r.zdrVerified!==true||r.workspaceMatchesKey!==true)pending.push(`Current ${role} workspace/ZDR/logging evidence (24h expiry)`);
 }
 if(plan.budgetApproved!==true)pending.push('Separate approval of proposed $5 incremental operator allowance');
 return {configurationComplete:pending.length===0,pending,remoteAcceptanceRequired:true};
}
const envText=values=>Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(String(v))}`).join('\n')+'\n';
export function railwayCanaryProgram(scope='control'){
 if(!['control','verifier'].includes(scope))throw Error('CANARY_DEPLOYMENT_SCOPE_INVALID');
 return `// Review-only owner canary. Apply/upload requires separate approval.
// No Git source: upload the exact reviewed local snapshot after approval.
import {defineRailway, service, empty} from 'railway/iac';
const deploy={numReplicas:1,sleepApplication:false,restartPolicyType:'ON_FAILURE',restartPolicyMaxRetries:3};
const limits={ 'private-broker':[0.5,512], 'private-funding':[1,768], 'private-watchdog':[0.25,256], 'private-verifier':[1,1024], 'private-verifier-gateway':[0.25,128] };
const resources=name=>({containers:{cpu:limits[name][0],memoryBytes:limits[name][1]*1024*1024}});
const app=(name,command,health=true)=>service(name,{source:empty(),build:{builder:'RAILPACK',watchPatterns:['dr-nib/**','packages/**','package.json','pnpm-lock.yaml']},deploy:{...deploy,limitOverride:resources(name),startCommand:command,...(health?{healthcheckPath:'/health',healthcheckTimeout:120}:{})},tracing:{enabled:false,autoInstrumentation:false}});
const docker=(name,path)=>service(name,{source:empty(),build:{builder:'DOCKERFILE',dockerfilePath:path},deploy:{...deploy,limitOverride:resources(name),healthcheckPath:'/health',healthcheckTimeout:120},tracing:{enabled:false,autoInstrumentation:false}});
export default defineRailway((ctx,project)=>{if(ctx.environment!=='owner-canary')throw Error('CANARY_ENVIRONMENT_REQUIRED');return project('${scope==='control'?'drnib-private-owner-canary':'drnib-attestation-canary'}',{environments:['owner-canary'],resources:[
 app('private-broker','pnpm --filter @nibgate/dr-nib-backend start:private-broker'),
 app('private-funding','pnpm --filter @nibgate/dr-nib-backend start:private-funding'),
 app('private-watchdog','pnpm --filter @nibgate/dr-nib-backend start:private-watchdog',false),
 docker('private-verifier','ops/dr-nib-canary/verifier/engine.Dockerfile'),
 docker('private-verifier-gateway','ops/dr-nib-canary/verifier/Dockerfile'),
].filter(resource=>resource.name.includes('verifier')===${scope==='verifier'})});});
`;
}
export function renderCanaryFiles(plan){
 const readiness=canaryReadiness(plan),r=plan.release,o=plan.origins;
 const funding=plan.funding??{},preboot=plan.preboot??{};
 for(const key of ['core','splitter','operator','treasury'])if(funding[key]!==undefined&&!/^0x[0-9a-f]{40}$/i.test(funding[key]))throw Error('CANARY_PUBLIC_FUNDING_INVALID');
 if(funding.feeBps!==undefined&&(!Number.isInteger(funding.feeBps)||funding.feeBps<0||funding.feeBps>1000))throw Error('CANARY_PUBLIC_FUNDING_INVALID');
 if(funding.rpcUrl!==undefined&&funding.rpcUrl!==NETWORKS.testnet.rpcUrl)throw Error('CANARY_PUBLIC_RPC_INVALID');
 for(const key of ['inputPriceCeiling','outputPriceCeiling'])if(preboot[key]!==undefined&&!/^[1-9][0-9]{0,8}$/.test(preboot[key]))throw Error('CANARY_PRICE_CEILING_INVALID');
 if(preboot.brokerPublicKeySpkiPemBase64!==undefined){try{if(createPublicKey(Buffer.from(preboot.brokerPublicKeySpkiPemBase64,'base64')).asymmetricKeyType!=='ed25519')throw Error();}catch{throw Error('CANARY_BROKER_KEY_INVALID');}}
 const releasePolicy={expectedAppId:r.appId,expectedInstanceId:r.instanceId,expectedComposeHash:r.composeHash,expectedOsHash:r.osHash,expectedKeyProvider:{name:'kms',id:r.kmsId},reviewedReleaseControls:r.controls};
 const lifecycle={DRNIB_NETWORK:'testnet',DRNIB_MAINNET_ONLY:'false',DRNIB_PRIVATE_BROKER_ONLY:'true',DRNIB_PRIVATE_ENABLED:'true',DRNIB_PRIVATE_FULL_ENABLED:'true',DRNIB_PRIVATE_WORKFLOW_ENABLED:'true',DRNIB_PRIVATE_TEST_TENANT_ID:plan.ownerTenantId,DRNIB_PRIVATE_GUEST_BASE_URL:o.guest,DRNIB_PRIVATE_CVM_ID:plan.cvmId,DRNIB_PRIVATE_WAKE_ENABLED:'true',DRNIB_PRIVATE_WAKE_IDLE_MS:plan.runtime.idleMs,DRNIB_PRIVATE_WAKE_MAX_RUNTIME_MS:plan.runtime.cumulativeRuntimeMs,DRNIB_PRIVATE_WAKE_MAX_ACTIVE:plan.runtime.active,DRNIB_PRIVATE_WAKE_MAX_PENDING:plan.runtime.pending,DRNIB_PRIVATE_RELEASE_POLICY_JSON:JSON.stringify(releasePolicy),DRNIB_PRIVATE_VERIFIER_URL:o.verifier+'/verify',DRNIB_PRIVATE_VERIFIER_SPKI_SHA256:r.verifierSpkiSha256,PRIVATE_BROKER_PRIVATE_KEY_PKCS8_PEM:missing('BROKER_SIGNING_KEY'),PHALA_CLOUD_API_KEY:missing('SCOPED_PHALA_LIFECYCLE_KEY'),DEBUG:''};
 const auth={HUB_API_URL:'https://testnet-api.nibgate.xyz',NIBGATE_NETWORK:'testnet',PRIVATE_BROKER_AUTH_URL:'https://testnet-api.nibgate.xyz/auth/me',NIBGATE_SESSION_COOKIE:'auth_session_testnet'};
 const storage={DRNIB_R2_BUCKET:missing('ISOLATED_PRIVATE_CANARY_BUCKET'),R2_ENDPOINT:missing('PRIVATE_R2_ENDPOINT'),R2_ACCESS_KEY_ID:missing('SCOPED_R2_KEY_ID'),R2_SECRET_ACCESS_KEY:missing('SCOPED_R2_KEY')};
 const files={
  '.railway/railway.ts':plan.deploymentMode==='reuse'?"throw new Error('Reuse existing services: apply reviewed reuse-service-patches.json; project creation is disabled');\n":railwayCanaryProgram(),
  'verifier/.railway/railway.ts':plan.deploymentMode==='reuse'?"throw new Error('Reuse the existing verifier pair; project creation is disabled');\n":railwayCanaryProgram('verifier'),
  'env/broker.env.example':envText({...lifecycle,...auth,...storage,CORS_ORIGIN:o.frontend,DRNIB_PRIVATE_RECORDS_ENABLED:'true',DRNIB_PRIVATE_WEB_ENABLED:'true',DRNIB_DATABASE_URL:missing('BROKER_CANARY_DATABASE_URL')}),
  'env/watchdog.env.example':envText({...lifecycle,DRNIB_DATABASE_URL:missing('WATCHDOG_CANARY_DATABASE_URL')}),
  'env/funding.env.example':envText({...auth,DRNIB_NETWORK:'testnet',DRNIB_MAINNET_ONLY:'false',DRNIB_PRIVATE_FUNDING_ONLY:'true',DRNIB_PRIVATE_FUNDING_HOST:'0.0.0.0',DRNIB_PRIVATE_PAYMENTS_ENABLED:'true',DRNIB_PRIVATE_EXTERNAL_TOOLS_ENABLED:'true',DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',DRNIB_PRIVATE_MAINNET_PAID_TOOLS_ENABLED:'false',DRNIB_PRIVATE_MAINNET_TOOL_MAX_MICRO_USD:'0',DRNIB_PRIVATE_TEST_TENANT_ID:plan.ownerTenantId,DRNIB_DATABASE_URL:missing('FUNDING_CANARY_DATABASE_URL'),ESCROW_CORE:funding.core??missing('REVIEWED_TESTNET_ESCROW_CORE'),ESCROW_SPLITTER:funding.splitter??missing('REVIEWED_TESTNET_SPLITTER'),ESCROW_OPERATOR:funding.operator??missing('OPERATOR_ADDRESS'),ESCROW_TREASURY:funding.treasury??missing('REVIEWED_TESTNET_TREASURY'),ESCROW_FEE_BPS:funding.feeBps??100,ARC_RPC_URL:funding.rpcUrl??NETWORKS.testnet.rpcUrl,ESCROW_KEEPER_KEY:missing('SCOPED_TESTNET_KEEPER_KEY'),DRNIB_AGENT_PRIVATE_KEY:missing('CAPPED_TESTNET_PAYER_KEY'),CIRCLE_API_KEY:missing('GATEWAY_API_KEY')}),
  'env/frontend.env.example':envText({NEXT_PUBLIC_NIBGATE_NETWORK:'testnet',NEXT_PUBLIC_API_URL:'https://testnet-api.nibgate.xyz',NEXT_PUBLIC_DRNIB_ENABLED:'true',NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL:'true',NEXT_PUBLIC_DRNIB_PRIVATE_FULL_ENABLED:'true',NEXT_PUBLIC_DRNIB_PRIVATE_FUNDED:'true',DRNIB_PRIVATE_API_URL:o.broker,DRNIB_PRIVATE_FUNDING_API_URL:o.funding,NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_TRUST_MODE:plan.verifierTrustMode??'independent',NEXT_PUBLIC_DRNIB_PRIVATE_VERIFIER_URL:o.verifier+'/verify',NEXT_PUBLIC_DRNIB_PRIVATE_APP_ID:r.appId,NEXT_PUBLIC_DRNIB_PRIVATE_INSTANCE_ID:r.instanceId,NEXT_PUBLIC_DRNIB_PRIVATE_COMPOSE_HASH:r.composeHash,NEXT_PUBLIC_DRNIB_PRIVATE_OS_HASH:r.osHash,NEXT_PUBLIC_DRNIB_PRIVATE_KMS_ID:r.kmsId,NEXT_PUBLIC_DRNIB_PRIVATE_RELEASE_CONTROLS:JSON.stringify(r.controls),NEXT_PUBLIC_DRNIB_PRIVATE_BOOT_MANIFEST_JSON:'',NEXT_PUBLIC_DRNIB_PRIVATE_BOOT_MANIFEST_SHA256:''}),
  'env/verifier-gateway.env.example':envText({DRNIB_VERIFIER_UPSTREAM_URL:plan.deploymentMode==='reuse'?'http://drnib-qa-verifier.railway.internal:8080/verify':'http://private-verifier.railway.internal:8080/verify',DRNIB_VERIFIER_BROWSER_ORIGINS:o.frontend}),
  'readiness.json':JSON.stringify(readiness,null,2)+'\n',
  'release-policy.json':JSON.stringify(releasePolicy,null,2)+'\n',
  'reviewed-plan.json':JSON.stringify(plan,null,2)+'\n',
 };
 if(plan.deploymentMode==='reuse')files['reuse-service-patches.json']=JSON.stringify({format:'drnib-canary-reuse-v1',scope:'testnet-only',targets:plan.reuseTargets??{},createProjects:false,createPostgresService:false,createVerifierServices:false,createSecondPhalaWorker:false,additionalServicesAllowed:['isolated funding service when legacy service cannot safely be repurposed','watchdog independent of the broker'],requiredBeforeUpdate:['backup current service variables and deployment metadata','preserve old databases, keys, funded jobs and holds','apply caps and tracing off','confirm service source and exact target environment']},null,2)+'\n';
 const policy={DRNIB_PRIVATE_TEST_TENANT_ID:plan.ownerTenantId,PRIVATE_AI_APPROVED_MODEL:'phala/gemma-4-26b-a4b-uncensored',PRIVATE_ACI_GATEWAY_BASE_URL:r.aciGatewayOrigin,PRIVATE_ACI_COMPOSE_HASH:r.aciComposeHash,PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64:preboot.brokerPublicKeySpkiPemBase64??missing('BROKER_PUBLIC_KEY_BASE64'),DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD:String(plan.proposedBudget.aiMicroUsd-(plan.preflightAiMicroUsd??0)),DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD:String(plan.proposedBudget.phalaMicroUsd),DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M:preboot.inputPriceCeiling??missing('CURRENT_INPUT_PRICE_CEILING'),DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M:preboot.outputPriceCeiling??missing('CURRENT_OUTPUT_PRICE_CEILING')};
 files['guest/measured-policy.json']=JSON.stringify(policy,null,2)+'\n';
 files['guest/credentials.env.example']=envText({DRNIB_DATABASE_URL:missing('GUEST_CANARY_DATABASE_URL'),PRIVATE_AI_API_KEY:missing('PHALA_INFERENCE_KEY'),...storage,PRIVATE_HOSTED_JEV_API_KEY:missing('JEV_ZDR_KEY'),PRIVATE_OPENROUTER_RESEARCH_API_KEY:missing('AUTHORIZED_ZDR_FALLBACK_KEY')});
 // No placeholder can be mistaken for reviewed executable compose. The
 // portable preparation command below only materializes after strict review.
 files['guest/compose.inputs.json']=JSON.stringify({image:plan.release.guestImage,policy,terminal:{image:plan.release.terminalImage},modelPool:'phala-openrouter-zdr-canary-v1',fundingRequired:true,hostedJev:{policy:{DRNIB_PRIVATE_HOSTED_JEV_ENABLED:'true',PRIVATE_HOSTED_JEV_CONTEXT_DISCLOSURE:'openrouter-and-typesafe',PRIVATE_HOSTED_JEV_ZDR_VERIFIED:'true',PRIVATE_HOSTED_JEV_WORKSPACE_ID:plan.hostedReviews.jev.workspaceId,PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT:plan.hostedReviews.jev.checkedAt},apiKey:missing('JEV_ZDR_KEY')}},null,2)+'\n';
 const environmentInputs=Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith('env/')||name==='guest/credentials.env.example').map(([name,body])=>[name,body.trim().split('\n').map(line=>{const split=line.indexOf('=');const key=line.slice(0,split),value=JSON.parse(line.slice(split+1));return {key,requiresProvisioning:value.includes('__REQUIRED_')||value.includes('.example')||(key.endsWith('RELEASE_CONTROLS')&&value.includes('false')),publicBuildValue:key.startsWith('NEXT_PUBLIC_')};})]));
 files['deployment-inputs.json']=JSON.stringify({format:'drnib-canary-input-inventory-v1',releaseInputs:readiness.pending,environmentInputs,additionalInputs:['Broker Ed25519 public key (matches private signing credential)','Current approved model input/output price ceilings','Deployment targets: frontend project, control and verifier projects in the Nibgate Railway workspace','Isolated Postgres administrator and four distinct role credentials','Private bucket ACLs, scoped keys and retention policy','Canonical Arc Testnet primary RPC and optional independent backup','Canary frontend origin approved by existing wallet/social-login provider','Phala shape/disk: proposed tdx.medium, 20 GB; verify capacity','Provider spending alerts and scheduled operator shutdown review'],remoteAcceptanceRequired:true},null,2)+'\n';
 return files;
}
export function materializeCanaryCompose(plan,inputs){
 // Compose is an offline pre-boot artifact. New CVM/app/instance identities,
 // the resulting compose measurement and verifier certificate are reviewed
 // after provisioning; requiring them here would create a bootstrap cycle.
 // Final admission still requires the complete canaryReadiness result.
 const deferred=new Set(['guest HTTPS origin','Dedicated canary CVM identity','Independently reviewed appId','Independently reviewed instanceId','Independently reviewed composeHash','Independently reviewed osHash','Independently reviewed verifierSpkiSha256','Reviewed KMS identity','Independent release-control review','Separate approval of proposed $5 incremental operator allowance']);
 if(canaryReadiness(plan).pending.some(input=>!deferred.has(input)))throw Error('CANARY_REVIEW_INCOMPLETE');
 if(inputs.image!==plan.release.guestImage||inputs.terminal?.image!==plan.release.terminalImage||inputs.modelPool!=='phala-openrouter-zdr-canary-v1'||inputs.fundingRequired!==true)throw Error('CANARY_RELEASE_MISMATCH');
 const policy=inputs.policy;
 if(policy.DRNIB_PRIVATE_TEST_TENANT_ID!==plan.ownerTenantId||policy.DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD!==String(plan.proposedBudget.aiMicroUsd-(plan.preflightAiMicroUsd??0))||policy.DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD!==String(plan.proposedBudget.phalaMicroUsd)||policy.PRIVATE_ACI_GATEWAY_BASE_URL!==plan.release.aciGatewayOrigin||policy.PRIVATE_ACI_COMPOSE_HASH!==plan.release.aciComposeHash||policy.PRIVATE_AI_APPROVED_MODEL!=='phala/gemma-4-26b-a4b-uncensored')throw Error('CANARY_MEASURED_POLICY_MISMATCH');
 if(Object.values(inputs.secrets??{}).some(x=>typeof x!=='string'||x.includes('__REQUIRED_'))||MEASURED_POLICY_NAMES.some(k=>typeof policy[k]!=='string'||policy[k].includes('__REQUIRED_')))throw Error('CANARY_INPUTS_INCOMPLETE');
 let database;
 try{database=new URL(inputs.secrets?.DRNIB_DATABASE_URL);}catch{throw Error('CANARY_GUEST_DATABASE_INVALID');}
 if(!['postgres:','postgresql:'].includes(database.protocol)||decodeURIComponent(database.pathname)!=='/'+plan.database||database.searchParams.get('schema')!=='drnib'||!database.username||decodeURIComponent(database.username)!==plan.database+'_guest'||!database.password)throw Error('CANARY_GUEST_DATABASE_INVALID');
 const j=inputs.hostedJev;
 if(j?.policy?.DRNIB_PRIVATE_HOSTED_JEV_ENABLED!=='true'||j.policy.PRIVATE_HOSTED_JEV_CONTEXT_DISCLOSURE!=='openrouter-and-typesafe'||j.policy.PRIVATE_HOSTED_JEV_ZDR_VERIFIED!=='true'||j.policy.PRIVATE_HOSTED_JEV_WORKSPACE_ID!==plan.hostedReviews.jev.workspaceId||j.policy.PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT!==plan.hostedReviews.jev.checkedAt||typeof j.apiKey!=='string'||!j.apiKey||j.apiKey.includes('__REQUIRED_'))throw Error('CANARY_HOSTED_REVIEW_MISMATCH');
 for(const key of ['DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M','DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M'])if(!/^[1-9][0-9]{0,8}$/.test(policy[key]))throw Error('CANARY_PRICE_CEILING_INVALID');
 try{if(!/^[A-Za-z0-9+/]+={0,2}$/.test(policy.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64)||createPublicKey(Buffer.from(policy.PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64,'base64')).asymmetricKeyType!=='ed25519')throw Error();}catch{throw Error('CANARY_BROKER_KEY_INVALID');}
 return privateGuestCompose(inputs);
}
export const sha256=text=>createHash('sha256').update(text).digest('hex');
