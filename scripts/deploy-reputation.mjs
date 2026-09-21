import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const viemEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/index.js');
const viemAccountsEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/accounts/index.js');
const { createPublicClient, createWalletClient, encodeFunctionData, http } = await import(viemEntry);
const { privateKeyToAccount } = await import(viemAccountsEntry);

const { networkDefaults } = await import('./network.mjs');
const { network, rpcUrl, chainId, chainName } = networkDefaults({
  rpcEnv: ['NIBGATE_REPUTATION_RPC_URL', 'ARC_TESTNET_RPC_URL', 'RPC_URL'],
  chainIdEnv: ['NIBGATE_REPUTATION_CHAIN_ID', 'CHAIN_ID'],
  chainNameEnv: ['NIBGATE_REPUTATION_CHAIN_NAME'],
});
const isMainnet = network === 'mainnet';
const configuredPrivateKey = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY
  || process.env.DEPLOYER_PRIVATE_KEY
  || process.env.E2E_BUYER_PRIVATE_KEY
  || '';
const privateKey = configuredPrivateKey;
const owner = process.env.NIBGATE_REPUTATION_OWNER
  || process.env.DEPLOYER_OWNER
  || '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12';

if (!privateKey) {
  throw new Error('Set NIBGATE_DEPLOYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY before deploying reputation contracts.');
}

const chain = {
  id: chainId,
  name: chainName,
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
};

function readArtifact(name) {
  const artifactPath = path.join(rootDir, 'contracts/out/NibgateReputation.sol', `${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const rawBytecode = artifact.bytecode?.object || artifact.bytecode;
  return {
    abi: artifact.abi,
    bytecode: rawBytecode.startsWith('0x') ? rawBytecode : `0x${rawBytecode}`
  };
}

const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

const implementationArtifact = readArtifact('NibgateReputation');
const proxyArtifact = readArtifact('NibgateReputationProxy');

console.log(`Deploying Nibgate reputation to ${chainName} (${chainId})`);
console.log(`RPC: ${rpcUrl}`);
console.log(`Deployer: ${account.address}`);
console.log(`Owner: ${owner}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer balance: ${balance.toString()} wei`);

const implementationHash = await walletClient.deployContract({
  abi: implementationArtifact.abi,
  bytecode: implementationArtifact.bytecode,
  args: []
});
console.log(`Implementation tx: ${implementationHash}`);
const implementationReceipt = await publicClient.waitForTransactionReceipt({ hash: implementationHash });
const implementationAddress = implementationReceipt.contractAddress;
console.log(`Implementation: ${implementationAddress}`);

const initData = encodeFunctionData({
  abi: implementationArtifact.abi,
  functionName: 'initialize',
  args: [owner]
});

const proxyHash = await walletClient.deployContract({
  abi: proxyArtifact.abi,
  bytecode: proxyArtifact.bytecode,
  args: [implementationAddress, initData]
});
console.log(`Proxy tx: ${proxyHash}`);
const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash });
const proxyAddress = proxyReceipt.contractAddress;
console.log(`Proxy: ${proxyAddress}`);

const outputPath = path.join(rootDir, isMainnet ? 'contracts/deployments/arc-mainnet.json' : 'contracts/deployments/arc-testnet.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
// Merge with any existing file (arc-mainnet.json ships official Circle
// addresses + pending slots — never clobber them with a reputation-only write).
const existing = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : {};
const output = {
  ...existing,
  chainId,
  chainName,
  rpcUrl,
  deployer: account.address,
  owner,
  implementationAddress,
  implementationTx: implementationHash,
  proxyAddress,
  proxyTx: proxyHash,
  deployedAt: new Date().toISOString(),
  reputation: {
    ...(existing.reputation || {}),
    status: 'DEPLOYED',
    owner,
    implementationAddress,
    implementationTx: implementationHash,
    proxyAddress,
    proxyTx: proxyHash,
    deployedAt: new Date().toISOString(),
  },
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log('');
console.log('Use this backend/frontend env value:');
console.log(`NIBGATE_REPUTATION_CONTRACT=${proxyAddress}`);
console.log(`Wrote ${outputPath}`);
