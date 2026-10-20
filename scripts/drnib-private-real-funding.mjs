// Owner's local payment boundary. Copy only required existing keeper/config;
// never load AI, R2, recovery, session-token or document-key credentials.
import {readFile} from 'node:fs/promises';
import {localAuthTransport} from './drnib-private-auth-transport.mjs';
const service=JSON.parse(await readFile('/tmp/drnib-launch-existing-research-vars.json','utf8'));
const broker=JSON.parse(await readFile('/tmp/drnib-private-broker-vars.json','utf8'));
const identity=JSON.parse(await readFile('/tmp/drnib-jev-fresh-owner.json','utf8'));
const database=JSON.parse(await readFile('/tmp/drnib-private-funding-db.json','utf8'));
if(identity.id!=='dcd8bc4b-e59b-4264-909f-0b5cb17ced72'||identity.walletAddress?.toLowerCase()!=='0x2777596932557a9a927ad6acccde69b9c8a03d2c')throw Error('Wrong owner funding identity');
const values={...database,DRNIB_PRIVATE_FUNDING_ONLY:'true',DRNIB_PRIVATE_TEST_TENANT_ID:identity.id,DRNIB_PRIVATE_PAYMENTS_ENABLED:'true',DRNIB_PRIVATE_EXTERNAL_TOOLS_ENABLED:'true',DRNIB_PRIVATE_PAID_TOOLS_ENABLED:'true',PORT:'3105',DRNIB_NETWORK:'testnet',PRIVATE_BROKER_AUTH_URL:broker.PRIVATE_BROKER_AUTH_URL,NIBGATE_SESSION_COOKIE:'auth_session_testnet'};
for(const key of ['ESCROW_KEEPER_KEY','ESCROW_OPERATOR','ESCROW_CORE','ESCROW_SPLITTER','ESCROW_TREASURY','ESCROW_FEE_BPS','ARC_RPC_URL','HUB_API_URL','SEARXNG_URL'])if(service[key])values[key]=service[key];
if(process.env.DRNIB_LOCAL_HUB_AUTH_TRANSPORT_ORIGIN){
 const canonical='https://testnet-api.nibgate.xyz',transport=process.env.DRNIB_LOCAL_HUB_AUTH_TRANSPORT_ORIGIN;
 localAuthTransport(canonical+'/api/auth/me',transport);
 values.PRIVATE_BROKER_AUTH_URL=transport+'/api/auth/me';
 if(values.HUB_API_URL){const hub=new URL(values.HUB_API_URL);if(hub.origin!==canonical)throw Error('Unexpected existing test Hub');values.HUB_API_URL=transport+(hub.pathname==='/'?'':hub.pathname);}
}
if(process.env.DRNIB_LOCAL_SEARCH_URL){if(process.env.DRNIB_LOCAL_SEARCH_URL!=='http://127.0.0.1:3110')throw Error('Unreviewed local public search endpoint');values.SEARXNG_URL=process.env.DRNIB_LOCAL_SEARCH_URL;}
if(service.DRNIB_AGENT_PRIVATE_KEY)values.DRNIB_AGENT_PRIVATE_KEY=service.DRNIB_AGENT_PRIVATE_KEY;
if(!values.ESCROW_KEEPER_KEY||!values.ESCROW_OPERATOR)throw Error('Existing testnet payment configuration missing');
const target=new URL(values.DRNIB_DATABASE_URL);if(target.pathname!=='/drnib_private_synthetic'||target.username!=='drnib_private_funding_testnet')throw Error('Wrong funding database');
// Keep inherited process credentials out of this separate payment process.
for(const key of Object.keys(process.env))if(!['PATH','HOME','USER','TMPDIR','SHELL','LANG','TERM','NODE_EXTRA_CA_CERTS'].includes(key))delete process.env[key];
Object.assign(process.env,values);
if(process.argv.includes('--preflight')){
 try{const {assertEscrowOperational}=await import('../dr-nib/backend/src/escrow/jobs.js');await assertEscrowOperational();console.log('Existing testnet escrow contracts, chain and keeper gas passed read-only checks; no transaction sent.');}
 catch(error){const reasons={'Escrow is not configured.':'configuration-missing','Escrow contracts are unavailable on the configured network.':'chain-or-contract-mismatch','Settlement keeper needs gas funds.':'keeper-gas-reserve-missing'};console.error(JSON.stringify({testnetEscrowPreflight:false,reason:reasons[error.message]??'rpc-or-verification-unavailable',transactionSent:false}));process.exitCode=1;}
}else{
const {createPrivateFundingApp}=await import('../dr-nib/backend/src/privacy/private-funding-main.js');
// Match the local broker's upstream-auth allowance. Log only fixed HTTP
// metadata, never cookies, identity payloads, public tool bodies or keys.
const {createPrivateBrokerAuth}=await import('../dr-nib/backend/src/privacy/private-broker-auth.js');
const authenticate=createPrivateBrokerAuth({env:{...process.env,PRIVATE_BROKER_AUTH_TIMEOUT_MS:'15000'},fetchImpl:async(...args)=>{
 const started=Date.now();try{const response=await fetch(...args);console.log('[money-auth]',{status:response.status,elapsedMs:Date.now()-started});return response;}
 catch{console.warn('[money-auth]',{unavailable:true,elapsedMs:Date.now()-started});throw Error('Account check unavailable');}
}});
const app=createPrivateFundingApp({authenticate});
const server=app.listen(3105,'127.0.0.1',()=>{app.locals.startSettlementReconciler();console.log('Real private funding service: http://127.0.0.1:3105 (testnet, public money metadata only)');});
server.prependListener('request',(req,res)=>{const started=Date.now();res.once('finish',()=>console.log('[private-money-route]',{method:req.method,path:/^\/v1\/private\/runs\/[0-9a-f-]{36}\/escrow(?:\/(?:register|complete|cancel))?$/.test(req.url??'')?req.url.replace(/[0-9a-f-]{36}/,':id'):'other',status:res.statusCode,elapsedMs:Date.now()-started}));});

}
