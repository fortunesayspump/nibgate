export const MEASURED_POLICY_NAMES=Object.freeze(['DRNIB_PRIVATE_TEST_TENANT_ID','PRIVATE_AI_APPROVED_MODEL','PRIVATE_ACI_GATEWAY_BASE_URL','PRIVATE_ACI_COMPOSE_HASH','PRIVATE_BROKER_PUBLIC_KEY_SPKI_PEM_B64','DRNIB_PRIVATE_AI_MONTHLY_CAP_MICRO_USD','DRNIB_PRIVATE_INFRA_MONTHLY_CEILING_MICRO_USD','DRNIB_PRIVATE_AI_INPUT_PRICE_CEILING_MICRO_USD_PER_M','DRNIB_PRIVATE_AI_OUTPUT_PRICE_CEILING_MICRO_USD_PER_M']);
export const ENCRYPTED_SECRET_NAMES=Object.freeze(['DRNIB_DATABASE_URL','PRIVATE_AI_API_KEY','R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','DRNIB_R2_BUCKET']);
export const HOSTED_JEV_POLICY_NAMES=Object.freeze(['DRNIB_PRIVATE_HOSTED_JEV_ENABLED','PRIVATE_HOSTED_JEV_CONTEXT_DISCLOSURE','PRIVATE_HOSTED_JEV_ZDR_VERIFIED','PRIVATE_HOSTED_JEV_WORKSPACE_ID','PRIVATE_HOSTED_JEV_LOGGING_REVIEWED_AT']);
const exact=(object,names)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).sort().join(',')===[...names].sort().join(',');
/** Trust policy is literal measured code input. Only the explicitly separate
 * credential/ciphertext-storage fields may resolve from encrypted secrets. */
export function privateGuestCompose({image,policy,secrets,hostedJev,fundingRequired=false,terminal,modelPool='single'}){
 if(!['single','gemma-qwen-canary-v1','phala-openrouter-zdr-canary-v1'].includes(modelPool))throw Error('Invalid measured model pool');
 if(typeof fundingRequired!=='boolean')throw Error('Invalid funding release policy');
 if(!/^docker\.io\/fortunesayspump\/nibgate-private-guest@sha256:[0-9a-f]{64}$/.test(image)||!exact(policy,MEASURED_POLICY_NAMES)||!exact(secrets,ENCRYPTED_SECRET_NAMES))throw Error('Incomplete measured release policy');
 if(Object.values(policy).some(v=>typeof v!=='string'||!v||/[\r\n\0$]/.test(v))||Object.values(secrets).some(v=>typeof v!=='string'||!v||/[\r\n\0]/.test(v)))throw Error('Invalid release value');
 const hosted=['      - '+JSON.stringify('PRIVATE_AI_MODEL_POOL='+modelPool)];
 if(modelPool==='phala-openrouter-zdr-canary-v1'){
  if(!hostedJev)throw Error('Hosted research logging review unavailable');
  hosted.push('      - PRIVATE_OPENROUTER_RESEARCH_API_KEY=${PRIVATE_OPENROUTER_RESEARCH_API_KEY}');
 }
 if(hostedJev!==undefined){
  if(!exact(hostedJev,['policy','apiKey'])||!exact(hostedJev.policy,HOSTED_JEV_POLICY_NAMES)||typeof hostedJev.apiKey!=='string'||!hostedJev.apiKey||/[\r\n\0]/.test(hostedJev.apiKey)||Object.values(hostedJev.policy).some(v=>typeof v!=='string'||!v||/[\r\n\0$]/.test(v)))throw Error('Incomplete hosted JEV measured policy');
  hosted.push(...HOSTED_JEV_POLICY_NAMES.map(name=>'      - '+JSON.stringify(name+'='+hostedJev.policy[name])),'      - PRIVATE_HOSTED_JEV_API_KEY=${PRIVATE_HOSTED_JEV_API_KEY}');
 }
 const companionEnv=[],guestMounts=[],services=[],volumes=[];
 if(terminal!==undefined){
  if(!exact(terminal,['image'])||!/^docker\.io\/fortunesayspump\/nibgate-private-guest@sha256:[0-9a-f]{64}$/.test(terminal.image))throw Error('Invalid measured terminal image');
  companionEnv.push('      - DRNIB_PRIVATE_TERMINAL_SOCKET=/run/drnib-terminal/service.sock');
  guestMounts.push('      - drnib-terminal-socket:/run/drnib-terminal:ro');volumes.push('  drnib-terminal-socket: {}');
  services.push('  drnib-private-terminal:',`    image: ${terminal.image}`,'    restart: unless-stopped','    read_only: true','    mem_limit: 640m','    cpus: 0.75','    pids_limit: 128','    cap_drop: [ALL]','    cap_add: [SYS_ADMIN, SYS_PTRACE, SYS_CHROOT, SETUID, SETGID, CHOWN, DAC_OVERRIDE, KILL]','    security_opt:','      - no-new-privileges:true','      - apparmor=unconfined','      - seccomp=/etc/drnib-terminal-seccomp.json','    network_mode: none','    volumes:','      - drnib-terminal-socket:/run/drnib-terminal','    tmpfs:','      - /tmp:rw,nosuid,nodev,size=201326592','    logging:','      driver: "none"');
 }
 return ['services:','  drnib-private-guest:',`    image: ${image}`,'    restart: unless-stopped','    ports:','      - "3102:3102"','    volumes:','      - /var/run/dstack.sock:/var/run/dstack.sock:ro',...guestMounts,...(terminal?['    mem_limit: 768m','    pids_limit: 192']:[]),'    logging:','      driver: "none"','    environment:','      - NODE_ENV=production','      - PORT=3102','      - DRNIB_PRIVATE_FULL_ENABLED=true','      - DRNIB_PRIVATE_WORKFLOW_ENABLED=true',`      - DRNIB_PRIVATE_FUNDING_REQUIRED=${fundingRequired}`,'      - DRNIB_PRIVATE_REVIEW_ATTESTATION_ENABLED=true',...MEASURED_POLICY_NAMES.map(name=>'      - '+JSON.stringify(name+'='+policy[name])),...ENCRYPTED_SECRET_NAMES.map(name=>'      - '+name+'=${'+name+'}'),...hosted,...companionEnv,...services,...(volumes.length?['volumes:',...volumes]:[]),''].join('\n');
}
