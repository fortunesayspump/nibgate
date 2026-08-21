#!/usr/bin/env node
/**
 * Deploy GatewayFeeWalletFactory to Arc testnet.
 *
 * Records the deployment in contracts/deployments/arc-testnet.json alongside
 * the reputation contracts. Requires the deployer key in env (same convention
 * as deploy-reputation.mjs):
 *
 *   NIBGATE_DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-revenue-factory.mjs
 *
 * Optional overrides: NIBGATE_FEE_SETTER, NIBGATE_TREASURY,
 * NIBGATE_FEE_BPS (default 100 = 1%), NIBGATE_MAX_FEE_BPS (default 500 = 5%).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const viemEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/index.js');
const viemAccountsEntry = path.join(rootDir, 'backend/node_modules/viem/_esm/accounts/index.js');
const { createPublicClient, createWalletClient, http, getAddress } = await import(viemEntry);
const { privateKeyToAccount } = await import(viemAccountsEntry);

const rpcUrl = process.env.NIBGATE_REVENUE_RPC_URL
  || process.env.ARC_TESTNET_RPC_URL
  || process.env.RPC_URL
  || 'https://rpc.testnet.arc.io';
const chainId = Number.parseInt(process.env.NIBGATE_REVENUE_CHAIN_ID || process.env.CHAIN_ID || '5042002', 10);
const chainName = process.env.NIBGATE_REVENUE_CHAIN_NAME || 'Arc Testnet';
const privateKey = process.env.NIBGATE_DEPLOYER_PRIVATE_KEY
  || process.env.DEPLOYER_PRIVATE_KEY
  || '';

const TREASURY = getAddress(process.env.NIBGATE_TREASURY || '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12');
const USDC = '0x3600000000000000000000000000000000000000';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
const DOMAIN = 26;
const MAX_FEE_BPS = Number.parseInt(process.env.NIBGATE_MAX_FEE_BPS || '500', 10);
const INITIAL_FEE_BPS = Number.parseInt(process.env.NIBGATE_FEE_BPS || '100', 10);

if (!privateKey) {
  throw new Error('Set NIBGATE_DEPLOYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY before deploying the revenue factory.');
}

const chain = {
  id: chainId,
  name: chainName,
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};

function artifact(name) {
  const a = JSON.parse(fs.readFileSync(path.join(rootDir, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
  const rawBytecode = a.bytecode?.object || a.bytecode;
  return { abi: a.abi, bytecode: rawBytecode.startsWith('0x') ? rawBytecode : `0x${rawBytecode}` };
}

const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
const feeSetter = getAddress(process.env.NIBGATE_FEE_SETTER || account.address);
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

const factoryArtifact = artifact('GatewayFeeWalletFactory');

console.log(`Deploying GatewayFeeWalletFactory to ${chainName} (${chainId})`);
console.log(`RPC: ${rpcUrl}`);
console.log(`Deployer: ${account.address}`);
console.log(`Fee setter: ${feeSetter}`);
console.log(`Treasury: ${TREASURY}`);
console.log(`USDC: ${USDC}`);
console.log(`Gateway wallet/minter/domain: ${GATEWAY_WALLET} / ${GATEWAY_MINTER} / ${DOMAIN}`);
console.log(`Fee bps: ${INITIAL_FEE_BPS} (cap ${MAX_FEE_BPS})`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer balance: ${balance.toString()} wei`);
if (balance <= 0n) throw new Error('Deployer has no gas — fund it with Arc testnet ETH first.');

const hash = await walletClient.deployContract({
  abi: factoryArtifact.abi,
  bytecode: factoryArtifact.bytecode,
  args: [TREASURY, feeSetter, USDC, GATEWAY_WALLET, GATEWAY_MINTER, DOMAIN, MAX_FEE_BPS, INITIAL_FEE_BPS],
});
console.log(`Factory deploy tx: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const factoryAddress = receipt.contractAddress;
console.log(`GatewayFeeWalletFactory: ${factoryAddress}`);

const deploymentsPath = path.join(rootDir, 'contracts/deployments/arc-testnet.json');
const deployments = fs.existsSync(deploymentsPath) ? JSON.parse(fs.readFileSync(deploymentsPath, 'utf8')) : {};
deployments.revenue = {
  factoryAddress,
  factoryTx: hash,
  treasury: TREASURY,
  feeSetter,
  usdc: USDC,
  gatewayWallet: GATEWAY_WALLET,
  gatewayMinter: GATEWAY_MINTER,
  domain: DOMAIN,
  feeBps: INITIAL_FEE_BPS,
  maxFeeBps: MAX_FEE_BPS,
  deployedAt: new Date().toISOString(),
};
fs.writeFileSync(deploymentsPath, `${JSON.stringify(deployments, null, 2)}\n`);

console.log('');
console.log('Use these backend env values:');
console.log(`NIBGATE_FEE_WALLET_FACTORY=${factoryAddress}`);
console.log(`NIBGATE_HOSTED_PAY=true`);
console.log(`NIBGATE_FEE_KEEPER=true`);
console.log(`Wrote ${deploymentsPath}`);