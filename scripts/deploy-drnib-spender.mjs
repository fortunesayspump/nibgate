#!/usr/bin/env node
// Deploy one NibgateSpender using the mainnet backend's existing deployer key.
// Dry-run by default. No key is printed, saved, or passed on the command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viem = await import(pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/index.js')).href);
const { privateKeyToAccount } = await import(pathToFileURL(path.join(root, 'backend/node_modules/viem/_esm/accounts/index.js')).href);
const { createPublicClient, createWalletClient, encodeDeployData, formatUnits, getAddress, http } = viem;
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'contracts/deployments/arc-mainnet.json'), 'utf8'));
if (deployment.spender?.address) throw new Error('Mainnet spender already recorded. Inspect it rather than redeploying.');
const artifact = JSON.parse(fs.readFileSync(path.join(root, 'contracts/deploy-artifacts/NibgateSpender.json'), 'utf8'));
const rpc = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const usdc = getAddress(deployment.usdc);
const owner = getAddress(deployment.escrow.keeper);
const agent = getAddress(process.env.DRNIB_SPENDER_AGENT || '0x0000000000000000000000000000000000000000');
if (agent === '0x0000000000000000000000000000000000000000') throw new Error('DRNIB_SPENDER_AGENT public address required.');
const dailyCap = 2_000_000n;
const broadcast = process.argv.includes('--broadcast');
const key = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY || '';
if (!key) throw new Error('NIBGATE_DEPLOYER_PRIVATE_KEY missing from the service environment.');
const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`);
if (getAddress(account.address) !== getAddress(deployment.deployer)) throw new Error('Signer differs from recorded mainnet deployer.');
const chain = { id: 5042, name: 'Arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const pub = createPublicClient({ chain, transport: http(rpc) });
if (await pub.getChainId() !== 5042) throw new Error('RPC is not Arc mainnet.');
const usdcCode = await pub.getCode({ address: usdc });
if (!usdcCode || usdcCode === '0x') throw new Error('USDC code missing on RPC.');
const args = [usdc, owner, agent, dailyCap];
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args });
const [gas, gasPrice, balance] = await Promise.all([
  pub.estimateGas({ account: account.address, data }),
  pub.getGasPrice(),
  pub.getBalance({ address: account.address }),
]);
const required = gas * gasPrice * 3n / 2n;
console.log(JSON.stringify({ chainId: 5042, deployer: account.address, owner, agent, usdc,
  dailyCapUSDC: '2', estimatedGas: String(gas), requiredWithBufferUSDC: formatUnits(required, 18),
  deployerBalanceUSDC: formatUnits(balance, 18), broadcast }, null, 2));
if (balance < required) throw new Error('Deployer balance below estimated gas plus 50% buffer.');
if (!broadcast) process.exit(0);

const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const tx = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args, gas: gas * 6n / 5n });
console.log(`Deployment transaction: ${tx}`);
const receipt = await pub.waitForTransactionReceipt({ hash: tx });
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed; inspect transaction before retrying.');
const address = getAddress(receipt.contractAddress);
for (const [field, expected] of [['usdc', usdc], ['owner', owner], ['agent', agent], ['dailyCap', dailyCap], ['paused', false]]) {
  const actual = await pub.readContract({ address, abi: artifact.abi, functionName: field });
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new Error(`Deployed ${field} verification failed.`);
}
console.log(JSON.stringify({ address, tx, owner, agent, dailyCap: String(dailyCap), verified: true }, null, 2));
