#!/usr/bin/env node
// Deploy a replacement testnet splitter against the existing escrow core.
// The signer key is read from an ignored 0600 JSON file and is never logged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createPublicClient, createWalletClient, encodeDeployData, formatUnits, getAddress, http } = await import(
  pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/index.js')).href
);
const { privateKeyToAccount } = await import(
  pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/accounts/index.js')).href
);

const rpc = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.io';
const chain = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
};
const deploymentFile = path.join(root, 'contracts/deployments/arc-testnet.json');
const signerFile = path.resolve(
  process.env.DRNIB_TESTNET_KEEPER_FILE ||
    path.join(root, 'ops/dr-nib-canary/local/credential-recovery-20261022/testnet-keeper.private.json'),
);
const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
const signer = JSON.parse(fs.readFileSync(signerFile, 'utf8'));
const account = privateKeyToAccount(signer.privateKey);
if (getAddress(account.address) !== getAddress(signer.address)) throw new Error('Keeper file address does not match its key.');
if (deployment.chainId !== chain.id) throw new Error('Recorded deployment is not Arc Testnet.');

const oldEscrow = deployment.escrow;
const core = getAddress(oldEscrow.core);
const keeper = getAddress(account.address);
const treasury = getAddress(oldEscrow.treasury);
const feeBps = BigInt(oldEscrow.feeBps);

const artifact = JSON.parse(
  fs.readFileSync(path.join(root, 'contracts/out/NibgateRunSplitter.sol/NibgateRunSplitter.json'), 'utf8'),
);
const bytecode = artifact.bytecode?.object?.startsWith('0x')
  ? artifact.bytecode.object
  : `0x${artifact.bytecode?.object || ''}`;
if (bytecode === '0x') throw new Error('Build the contracts before deploying.');

const publicClient = createPublicClient({ chain, transport: http(rpc) });
if (await publicClient.getChainId() !== chain.id) throw new Error('RPC is not Arc Testnet.');
if (getAddress(oldEscrow.keeper) === keeper) {
  const splitter = getAddress(oldEscrow.splitter);
  for (const [field, expected] of [['core', core], ['keeper', keeper], ['treasury', treasury], ['feeBps', feeBps]]) {
    const actual = await publicClient.readContract({ address: splitter, abi: artifact.abi, functionName: field });
    if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
      throw new Error(`Recorded replacement splitter ${field} verification failed.`);
    }
  }
  console.log(JSON.stringify({ splitter, keeper, verified: true, alreadyMigrated: true }));
  process.exit(0);
}
const [coreCode, balance] = await Promise.all([
  publicClient.getCode({ address: core }),
  publicClient.getBalance({ address: keeper }),
]);
if (!coreCode || coreCode === '0x') throw new Error('Recorded escrow core has no code.');
const deployData = encodeDeployData({ abi: artifact.abi, bytecode, args: [core, keeper, treasury, feeBps] });
const gas = await publicClient.estimateGas({ account, data: deployData });
const gasPrice = await publicClient.getGasPrice();
const required = gas * gasPrice * 3n / 2n;
console.log(JSON.stringify({
  network: chain.name,
  chainId: chain.id,
  core,
  previousSplitter: getAddress(oldEscrow.splitter),
  previousKeeper: getAddress(oldEscrow.keeper),
  keeper,
  treasury,
  feeBps: Number(feeBps),
  estimatedGas: String(gas),
  requiredWithBufferUSDC: formatUnits(required, 18),
  keeperBalanceUSDC: formatUnits(balance, 18),
  broadcast: process.argv.includes('--broadcast'),
}, null, 2));
if (balance < required) throw new Error('Keeper balance is below the deployment estimate plus 50% buffer.');
if (!process.argv.includes('--broadcast')) process.exit(0);

const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const tx = await wallet.deployContract({
  abi: artifact.abi,
  bytecode,
  args: [core, keeper, treasury, feeBps],
  gas: gas * 6n / 5n,
});
console.log(`Splitter transaction: ${tx}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Replacement splitter deployment failed.');
const splitter = getAddress(receipt.contractAddress);
for (const [field, expected] of [['core', core], ['keeper', keeper], ['treasury', treasury], ['feeBps', feeBps]]) {
  const actual = await publicClient.readContract({ address: splitter, abi: artifact.abi, functionName: field });
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new Error(`Replacement splitter ${field} verification failed.`);
}

const history = Array.isArray(deployment.escrowHistory) ? deployment.escrowHistory : [];
if (!history.some((entry) => String(entry.splitter).toLowerCase() === String(oldEscrow.splitter).toLowerCase())) {
  history.push({ ...oldEscrow, retiredForNewAdmissionsAt: new Date().toISOString() });
}
deployment.escrowHistory = history;
deployment.escrow = {
  ...oldEscrow,
  splitter,
  splitterName: `NibgateRunSplitter (keeper ${keeper}, treasury ${treasury}, feeBps ${feeBps})`,
  splitterTx: tx,
  keeper,
  deployer: keeper,
  migratedAt: new Date().toISOString(),
  previousSplitter: getAddress(oldEscrow.splitter),
};
fs.writeFileSync(deploymentFile, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify({ splitter, keeper, transaction: tx, verified: true }));
