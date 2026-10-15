#!/usr/bin/env node
// Deploy the stock ERC-8183 core and Nibgate's run splitter on Arc mainnet.
// Run `forge build --root contracts` first. The signing key stays in the
// environment; this script never prints it or passes it on a command line.
// DRNIB_ESCROW_DRY_RUN=1 performs every public-chain preflight without a key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createPublicClient, createWalletClient, encodeDeployData, formatUnits,
  getAddress, getContractAddress, http } = await import(pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/index.js')).href);
const { privateKeyToAccount } = await import(pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/accounts/index.js')).href);

const RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const USDC = getAddress('0x3600000000000000000000000000000000000000');
const TREASURY = getAddress(process.env.NIBGATE_TREASURY || '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12');
const FEE_BPS = 100n;
const dryRun = process.env.DRNIB_ESCROW_DRY_RUN === '1';
const deploymentFile = path.join(root, 'contracts/deployments/arc-mainnet.json');
const existing = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
if (existing.escrow?.core || existing.escrow?.splitter) throw new Error('Mainnet escrow is already recorded; verify those addresses instead of deploying again.');

const key = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY || '';
if (!dryRun && !key) throw new Error('NIBGATE_DEPLOYER_PRIVATE_KEY is required to broadcast.');
const account = key ? privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`) : null;
const deployer = getAddress(account?.address || existing.deployer);
if (getAddress(existing.deployer) !== deployer) throw new Error('Signer does not match the recorded Arc mainnet deployer.');

const keeperKey = process.env.NIBGATE_KEEPER_PRIVATE_KEY || process.env.ESCROW_KEEPER_KEY || '';
const derivedKeeper = keeperKey ? privateKeyToAccount(keeperKey.startsWith('0x') ? keeperKey : `0x${keeperKey}`).address : null;
const keeper = getAddress(derivedKeeper || process.env.DRNIB_ESCROW_KEEPER_ADDRESS || '0x0000000000000000000000000000000000000000');
if (keeper === '0x0000000000000000000000000000000000000000') throw new Error('A mainnet escrow keeper address or key is required.');
if (derivedKeeper && process.env.DRNIB_ESCROW_KEEPER_ADDRESS && keeper !== getAddress(process.env.DRNIB_ESCROW_KEEPER_ADDRESS)) {
  throw new Error('Configured keeper address does not match the keeper key.');
}

function artifact(file) {
  const value = JSON.parse(fs.readFileSync(path.join(root, 'contracts/out', file), 'utf8'));
  const raw = value.bytecode?.object;
  if (!raw || raw === '0x') throw new Error(`Build the contract before deploying: ${file}`);
  return { abi: value.abi, bytecode: raw.startsWith('0x') ? raw : `0x${raw}` };
}

const coreArtifact = artifact('AgenticCommerce.sol/ACPCore.json');
const splitterArtifact = artifact('NibgateRunSplitter.sol/NibgateRunSplitter.json');
const chain = { id: 5042, name: 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const publicClient = createPublicClient({ chain, transport: http(RPC) });
if (await publicClient.getChainId() !== 5042) throw new Error('RPC is not Arc mainnet (chain 5042).');
const usdcCode = await publicClient.getCode({ address: USDC });
if (!usdcCode || usdcCode === '0x') throw new Error('Arc mainnet USDC contract is missing.');

const nonce = await publicClient.getTransactionCount({ address: deployer });
const predictedCore = getContractAddress({ from: deployer, nonce: BigInt(nonce) });
const coreData = encodeDeployData({ ...coreArtifact, args: [USDC] });
const splitterData = encodeDeployData({ ...splitterArtifact, args: [predictedCore, keeper, TREASURY, FEE_BPS] });
const [coreGas, splitterGas, gasPrice, balance] = await Promise.all([
  publicClient.estimateGas({ account: deployer, data: coreData }),
  publicClient.estimateGas({ account: deployer, data: splitterData }),
  publicClient.getGasPrice(),
  publicClient.getBalance({ address: deployer }),
]);
const required = (coreGas + splitterGas) * gasPrice * 3n / 2n;
console.log(JSON.stringify({ network: 'Arc mainnet', chainId: 5042, deployer, keeper, treasury: TREASURY,
  nonce, predictedCore, estimatedGas: String(coreGas + splitterGas), gasPriceGwei: formatUnits(gasPrice, 9),
  requiredWithBufferUSDC: formatUnits(required, 18), deployerBalanceUSDC: formatUnits(balance, 18), dryRun }, null, 2));
if (balance < required) throw new Error('Deployer balance is below the two-contract estimate plus 50% gas buffer; no transaction sent.');
if (dryRun) process.exit(0);

const wallet = createWalletClient({ account, chain, transport: http(RPC) });
const coreTx = await wallet.deployContract({ ...coreArtifact, args: [USDC], gas: coreGas * 6n / 5n });
console.log(`Core transaction: ${coreTx}`);
const coreReceipt = await publicClient.waitForTransactionReceipt({ hash: coreTx });
if (coreReceipt.status !== 'success' || !coreReceipt.contractAddress) throw new Error('Core deployment failed; inspect its transaction before retrying.');
const coreAddress = getAddress(coreReceipt.contractAddress);
if (coreAddress !== getAddress(predictedCore)) throw new Error('Core address differs from the preflight prediction; splitter was not deployed.');
if (getAddress(await publicClient.readContract({ address: coreAddress, abi: coreArtifact.abi, functionName: 'DEFAULT_TOKEN' })) !== USDC) {
  throw new Error('Core token verification failed; splitter was not deployed.');
}

const splitterTx = await wallet.deployContract({ ...splitterArtifact, args: [coreAddress, keeper, TREASURY, FEE_BPS], gas: splitterGas * 6n / 5n });
console.log(`Splitter transaction: ${splitterTx}`);
const splitterReceipt = await publicClient.waitForTransactionReceipt({ hash: splitterTx });
if (splitterReceipt.status !== 'success' || !splitterReceipt.contractAddress) throw new Error('Splitter deployment failed; inspect its transaction before retrying.');
const splitterAddress = getAddress(splitterReceipt.contractAddress);
for (const [field, expected] of [['core', coreAddress], ['keeper', keeper], ['treasury', TREASURY], ['feeBps', FEE_BPS]]) {
  const actual = await publicClient.readContract({ address: splitterAddress, abi: splitterArtifact.abi, functionName: field });
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new Error(`Splitter ${field} verification failed.`);
}

existing.escrow = { core: coreAddress, coreTx, splitter: splitterAddress, splitterTx,
  keeper, treasury: TREASURY, feeBps: Number(FEE_BPS), usdc: USDC, deployer,
  deployedAt: new Date().toISOString() };
fs.writeFileSync(deploymentFile, `${JSON.stringify(existing, null, 2)}\n`);
console.log(`Recorded escrow at ${coreAddress} and ${splitterAddress}. Funded mainnet runs remain gated until external review and keeper readiness.`);
