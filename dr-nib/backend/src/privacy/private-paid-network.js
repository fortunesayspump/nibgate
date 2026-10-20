import {NETWORKS,NETWORK_HOSTS} from '@nibgate/internal/networks.js';
const invalid=()=>Error('PRIVATE_PAID_NETWORK_DISABLED');
/** Mainnet support is inert until a separately approved operator config enables
 * it and supplies an exact per-operation ceiling. Durable run budgets and
 * disclosure approvals remain enforced by the outer private money boundary. */
export function privatePaidNetwork(env=process.env){
 const name=env.DRNIB_NETWORK;
 if(env.DRNIB_PRIVATE_PAID_TOOLS_ENABLED!=='true'||!['testnet','mainnet'].includes(name)||!/^0x[0-9a-f]{64}$/i.test(env.DRNIB_AGENT_PRIVATE_KEY??''))throw invalid();
 let maxMicroUsd=2000000;
 if(name==='mainnet'){
  const cap=env.DRNIB_PRIVATE_MAINNET_TOOL_MAX_MICRO_USD;
  if(env.DRNIB_PRIVATE_MAINNET_PAID_TOOLS_ENABLED!=='true'||!(/^[1-9][0-9]{0,6}$/).test(cap??'')||Number(cap)>2000000||env.HUB_API_URL?.replace(/\/+$/,'')!==NETWORK_HOSTS.mainnet.apiBase)throw invalid();
  maxMicroUsd=Number(cap);
 }
 return {network:NETWORKS[name],hubOrigin:NETWORK_HOSTS[name].apiBase,maxMicroUsd};
}
export function privatePaidToolsEnabled(env){try{return !!privatePaidNetwork(env)}catch{return false}}
