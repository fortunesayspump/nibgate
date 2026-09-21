// Active Arc network for this subblogs stack. NIBGATE_NETWORK=mainnet|testnet,
// default testnet (a missing var must never move real money). Kept local
// (no @nibgate/* import) so the backend runs on either workspace or registry
// builds of the shared packages.
const TESTNET = {
  name: 'testnet',
  chainId: 5042002,
  caip2: 'eip155:5042002',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerUrl: 'https://testnet.arcscan.app',
  gatewayApi: 'https://gateway-api-testnet.circle.com',
  gatewayApiV1: 'https://gateway-api-testnet.circle.com/v1',
  gatewayDomain: 26,
  reputationContract: '0x9f27fd62e75f86a3c7addfdba443aab1f930e281',
};

const MAINNET = {
  name: 'mainnet',
  chainId: 5042,
  caip2: 'eip155:5042',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
  gatewayApi: 'https://gateway-api.circle.com',
  gatewayApiV1: 'https://gateway-api.circle.com/v1',
  gatewayDomain: 26,
  // No mainnet reputation deployment yet — set NIBGATE_REPUTATION_CONTRACT
  // explicitly after deploying (see contracts/deployments/arc-mainnet.json).
  reputationContract: '',
};

function activeNetworkName() {
  return String(process.env.NIBGATE_NETWORK || 'testnet').toLowerCase() === 'mainnet'
    ? 'mainnet'
    : 'testnet';
}

function activeNetwork() {
  return activeNetworkName() === 'mainnet' ? MAINNET : TESTNET;
}

function activeChainId() {
  return activeNetwork().chainId;
}

function activeCaip2() {
  return activeNetwork().caip2;
}

function activeGatewayApiV1() {
  return process.env.NIBGATE_GATEWAY_API || activeNetwork().gatewayApiV1;
}

function activeReputationContract() {
  return process.env.NIBGATE_REPUTATION_CONTRACT || activeNetwork().reputationContract;
}

function activeReputationChainId() {
  return Number(process.env.NIBGATE_REPUTATION_CHAIN_ID || activeNetwork().chainId);
}

module.exports = {
  TESTNET,
  MAINNET,
  activeNetworkName,
  activeNetwork,
  activeChainId,
  activeCaip2,
  activeGatewayApiV1,
  activeReputationContract,
  activeReputationChainId,
};
