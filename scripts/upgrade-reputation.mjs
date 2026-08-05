import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const viemEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/index.js');
const viemAccountsEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/accounts/index.js');
const { createPublicClient, createWalletClient, http } = await import(viemEntry);
const { privateKeyToAccount } = await import(viemAccountsEntry);

const rpcUrl = process.env.NIBGATE_REPUTATION_RPC_URL
  || process.env.ARC_TESTNET_RPC_URL
  || process.env.RPC_URL
  || 'https://rpc.testnet.arc.io';
const chainId = Number.parseInt(process.env.NIBGATE_REPUTATION_CHAIN_ID || process.env.CHAIN_ID || '5042002', 10);
const chainName = process.env.NIBGATE_REPUTATION_CHAIN_NAME || 'Arc Testnet';
const privateKey = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || '';
const proxyAddress = process.env.NIBGATE_REPUTATION_CONTRACT
  || '0x9f27fd62e75f86a3c7addfdba443aab1f930e281';

if (!privateKey) {
  throw new Error('Set NIBGATE_DEPLOYER_PRIVATE_KEY (the proxy owner key) before upgrading.');
}

const chain = {
  id: chainId,
  name: chainName,
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }
};

const artifact = JSON.parse(fs.readFileSync(
  path.join(rootDir, 'contracts/out/NibgateReputationV2.sol/NibgateReputationV2.json'), 'utf8'
));
const bytecode = artifact.bytecode.object.startsWith('0x') ? artifact.bytecode.object : `0x${artifact.bytecode.object}`;

const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

console.log(`Upgrading Nibgate reputation to ${chainName} (${chainId})`);
console.log(`RPC: ${rpcUrl}`);
console.log(`Proxy: ${proxyAddress}`);
console.log(`Upgrader (must be owner): ${account.address}`);

const currentImpl = await publicClient.readContract({
  address: proxyAddress,
  abi: [{ type: 'function', name: 'implementation', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
  functionName: 'implementation'
});
console.log(`Current implementation: ${currentImpl}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Upgrader balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);

const implHash = await walletClient.deployContract({ abi: artifact.abi, bytecode, args: [] });
console.log(`Deploy v2 implementation tx: ${implHash}`);
const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash });
const newImpl = implReceipt.contractAddress;
console.log(`New v2 implementation: ${newImpl}`);

const upgradeHash = await walletClient.writeContract({
  address: proxyAddress,
  abi: [{ type: 'function', name: 'upgradeTo', stateMutability: 'nonpayable', inputs: [{ name: 'newImplementation', type: 'address' }], outputs: [] }],
  functionName: 'upgradeTo',
  args: [newImpl]
});
console.log(`Upgrade tx: ${upgradeHash}`);
const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeHash });
console.log(`Upgrade mined in block ${upgradeReceipt.blockNumber}`);

const verifyImpl = await publicClient.readContract({
  address: proxyAddress,
  abi: [{ type: 'function', name: 'implementation', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
  functionName: 'implementation'
});
console.log(`Verified implementation after upgrade: ${verifyImpl}`);

const outputPath = path.join(rootDir, 'contracts/deployments/arc-testnet.json');
const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
output.v2 = {
  implementationAddress: newImpl,
  implementationTx: implHash,
  upgradeTx: upgradeHash,
  upgradedAt: new Date().toISOString(),
  rpcUrl
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Updated ${outputPath}`);
