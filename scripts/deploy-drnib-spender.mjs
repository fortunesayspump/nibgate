#!/usr/bin/env node
// Deploy NibgateSpenderV2 on Arc testnet or mainnet.
// Dry-run by default. No key is printed, saved, or passed on the command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viem = await import(pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/index.js')).href);
const { privateKeyToAccount } = await import(pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/accounts/index.js')).href);
const { createPublicClient, createWalletClient, encodeDeployData, formatUnits, getAddress, http } = viem;
const network = process.env.DRNIB_SPENDER_NETWORK || 'mainnet';
if (!['testnet', 'mainnet'].includes(network)) throw new Error('DRNIB_SPENDER_NETWORK must be testnet or mainnet.');
const isTestnet = network === 'testnet';
const deploymentPath = isTestnet ? 'arc-testnet-spender.json' : 'arc-mainnet.json';
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'contracts/deployments', deploymentPath), 'utf8'));
if (deployment.spenderV2?.address) throw new Error(`${network} V2 spender already recorded. Inspect it rather than redeploying.`);
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/deploy-artifacts/NibgateSpenderV2.json'), 'utf8'));
const rpc = isTestnet
  ? process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.io'
  : process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const chainId = isTestnet ? 5042002 : 5042;
const chainDeployment = isTestnet
  ? JSON.parse(fs.readFileSync(path.join(root, 'contracts/deployments/arc-testnet.json'), 'utf8'))
  : deployment;
const usdc = getAddress(chainDeployment.escrow.usdc);
const owner = getAddress(isTestnet ? deployment.owner : deployment.escrow.keeper);
const agent = getAddress(process.env.DRNIB_SPENDER_AGENT || '0x0000000000000000000000000000000000000000');
if (agent === '0x0000000000000000000000000000000000000000') throw new Error('DRNIB_SPENDER_AGENT public address required.');
const dailyCap = 2_000_000n;
const broadcast = process.argv.includes('--broadcast');
const key = isTestnet ? process.env.ESCROW_KEEPER_KEY || '' : process.env.NIBGATE_DEPLOYER_PRIVATE_KEY || '';
if (!key) throw new Error(`Deployment key missing for ${network}.`);
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
if (getAddress(account.address) !== getAddress(isTestnet ? deployment.owner : deployment.deployer)) throw new Error('Signer differs from recorded deployer.');
const chain = { id: chainId, name: isTestnet ? 'Arc Testnet' : 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const pub = createPublicClient({ chain, transport: http(rpc) });
if (await pub.getChainId() !== chainId) throw new Error(`RPC is not Arc ${network}.`);
const usdcCode = await pub.getCode({ address: usdc });
if (!usdcCode || usdcCode === '0x') throw new Error('USDC code missing on RPC.');
const args = [usdc, owner, agent, dailyCap, false];
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args });
const [gas, gasPrice, balance] = await Promise.all([
  pub.estimateGas({ account: account.address, data }),
  pub.getGasPrice(),
  pub.getBalance({ address: account.address }),
]);
const required = gas * gasPrice * 3n / 2n;
console.log(JSON.stringify({ network, chainId, deployer: account.address, owner, agent, usdc,
  dailyCapUSDC: '2', restrictRecipients: false, estimatedGas: String(gas), requiredWithBufferUSDC: formatUnits(required, 18),
  deployerBalanceUSDC: formatUnits(balance, 18), broadcast }, null, 2));
if (balance < required) throw new Error('Deployer balance below estimated gas plus 50% buffer.');
if (!broadcast) process.exit(0);

const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const tx = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args, gas: gas * 6n / 5n });
console.log(`Deployment transaction: ${tx}`);
const receipt = await pub.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed; inspect transaction before retrying.');
const address = getAddress(receipt.contractAddress);
for (const [field, expected] of [['usdc', usdc], ['owner', owner], ['agent', agent], ['dailyCap', dailyCap], ['paused', false], ['restrictRecipients', false]]) {
  const actual = await pub.readContract({ address, abi: artifact.abi, functionName: field });
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new Error(`Deployed ${field} verification failed.`);
}
console.log(JSON.stringify({ address, tx, owner, agent, dailyCap: String(dailyCap), verified: true }, null, 2));
