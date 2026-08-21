#!/usr/bin/env node
/**
 * E2E: GatewayFeeWalletFactory on a local anvil node.
 *
 * Proves the production revenue path end to end:
 *   1. deploy GatewayFeeWalletFactory + MockUSDC
 *   2. deploy a per-creator wallet via the factory (CREATE2)
 *   3. factory.predictedWallet(creator) == actual deployed address
 *   4. fund the wallet, distribute() → 99/1 split to creator/treasury
 *   5. setFeeBps policy: mutable within cap, capped at deploy
 *
 *   anvil --port 8545 &
 *   node scripts/e2e-revenue-factory.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const { createPublicClient, createWalletClient, http, getAddress, formatUnits } = await import(path.join(rootDir, 'backend/node_modules/viem/_esm/index.js'));
const { privateKeyToAccount } = await import(path.join(rootDir, 'backend/node_modules/viem/_esm/accounts/index.js'));

const RPC = process.env.ANVIL_RPC || 'http://127.0.0.1:8545';
const PRIVATE_KEY = process.env.ANVIL_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const CHAIN_ID = 31337;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC) });
const walletClient = createWalletClient({ transport: http(RPC) });

const USDC = '0x3600000000000000000000000000000000000000';
const GATEWAY_WALLET = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
const DOMAIN = 26;
const MAX_FEE_BPS = 500;
const INITIAL_FEE_BPS = 100;
const TREASURY = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12';
const FEE_SETTER = account.address;

function artifact(name) {
  const a = JSON.parse(readFileSync(path.join(rootDir, `contracts/out/${name}.sol/${name}.json`), 'utf8'));
  return { ...a, bytecode: typeof a.bytecode === 'string' ? a.bytecode : a.bytecode.object };
}

async function deploy(name, args, abi) {
  const a = artifact(name);
  const hash = await walletClient.deployContract({ abi: abi || a.abi, bytecode: a.bytecode, account, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress;
}

async function main() {
  console.log(`== Revenue factory e2e (anvil ${RPC}, chain ${CHAIN_ID}) ==`);

  console.log('\n== 1. Deploy MockUSDC + factory ==');
  const usdc = await deploy('MockUSDC');
  console.log('  MockUSDC:', usdc);
  const factory = await deploy('GatewayFeeWalletFactory', [
    TREASURY, FEE_SETTER, usdc, GATEWAY_WALLET, GATEWAY_MINTER, DOMAIN, MAX_FEE_BPS, INITIAL_FEE_BPS,
  ]);
  console.log('  GatewayFeeWalletFactory:', factory);

  console.log('\n== 2. Deploy a creator wallet via the factory ==');
  const creator = '0x2c5C6423993ba5102E5b0e1cE3079b9C26aa23bD';
  const predicted = await publicClient.readContract({
    address: factory, abi: artifact('GatewayFeeWalletFactory').abi,
    functionName: 'predictedWallet', args: [creator],
  });
  console.log('  predictedWallet(creator):', predicted);
  const tx = await walletClient.writeContract({
    address: factory, abi: artifact('GatewayFeeWalletFactory').abi,
    functionName: 'deploy', account, args: [creator],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  const deployed = await publicClient.readContract({
    address: factory, abi: artifact('GatewayFeeWalletFactory').abi,
    functionName: 'wallets', args: [creator],
  });
  console.log('  wallets[creator]:', deployed);
  if (getAddress(predicted).toLowerCase() !== getAddress(deployed).toLowerCase()) {
    throw new Error('PREDICTED != DEPLOYED — CREATE2 address drift');
  }
  console.log('  PASS: predicted == deployed (no drift)');

  console.log('\n== 3. Fund the wallet, distribute() 99/1 ==');
  const mintHash = await walletClient.writeContract({
    address: usdc, abi: artifact('MockUSDC').abi, functionName: 'mint', account, args: [deployed, 1_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  const bal = await publicClient.readContract({
    address: usdc, abi: artifact('MockUSDC').abi, functionName: 'balanceOf', args: [deployed],
  });
  console.log('  wallet USDC balance:', bal.toString(), `(${formatUnits(bal, 6)})`);
  const distTx = await walletClient.writeContract({
    address: deployed, abi: artifact('GatewayFeeWallet').abi, functionName: 'distribute', account,
  });
  await publicClient.waitForTransactionReceipt({ hash: distTx });
  const creatorBal = await publicClient.readContract({
    address: usdc, abi: artifact('MockUSDC').abi, functionName: 'balanceOf', args: [creator],
  });
  const treasuryBal = await publicClient.readContract({
    address: usdc, abi: artifact('MockUSDC').abi, functionName: 'balanceOf', args: [TREASURY],
  });
  console.log(`  creator: ${formatUnits(creatorBal, 6)} / treasury: ${formatUnits(treasuryBal, 6)}`);
  if (creatorBal !== 990_000n || treasuryBal !== 10_000n) {
    throw new Error(`SPLIT MISMATCH — expected 990000/10000, got ${creatorBal}/${treasuryBal}`);
  }
  console.log('  PASS: 99/1 split correct');

  console.log('\n== 4. Fee policy: mutable within cap, capped ==');
  const setHash = await walletClient.writeContract({
    address: deployed, abi: artifact('GatewayFeeWallet').abi, functionName: 'setFeeBps', account, args: [250],
  });
  await publicClient.waitForTransactionReceipt({ hash: setHash });
  const feeBps = await publicClient.readContract({
    address: deployed, abi: artifact('GatewayFeeWallet').abi, functionName: 'feeBps',
  });
  console.log('  feeBps after setFeeBps(250):', feeBps.toString());
  if (BigInt(feeBps) !== 250n) throw new Error('setFeeBps(250) did not apply');
  const capped = await publicClient.readContract({
    address: deployed, abi: artifact('GatewayFeeWallet').abi, functionName: 'setFeeBps',
    args: [MAX_FEE_BPS + 1],
  }).then(() => 'ACCEPTED (BAD)', () => 'reverted (good)');
  console.log('  setFeeBps(cap+1):', capped);
  if (!capped.includes('reverted')) throw new Error('feeBps above cap accepted');
  console.log('  PASS: fee mutable within immutable maxFeeBps cap');

  console.log('\n== 5. SDK keeper leg: direct-rail distribute() ==');

  // Simulate a direct-rail receipt: buyer sends USDC straight to the fee wallet.
  const keeperMint = await walletClient.writeContract({
    address: usdc, abi: artifact('MockUSDC').abi, functionName: 'mint', account, args: [deployed, 500_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash: keeperMint });

  const { feeWalletUsdcBalance, distributeFeeWallet } = await import(
    path.join(rootDir, 'packages/nibgate/src/server/fee-wallet.js')
  );
  const before = await feeWalletUsdcBalance(deployed, {
    rpcUrl: RPC, usdcAddress: usdc, publicClient,
  });
  console.log('  SDK feeWalletUsdcBalance:', before.toString());
  if (before !== 500_000n) throw new Error(`balance mismatch ${before}`);

  const result = await distributeFeeWallet(deployed, {
    rpcUrl: RPC, keeperKey: PRIVATE_KEY, usdcAddress: usdc, publicClient, walletClient,
  });
  console.log('  SDK distributeFeeWallet:', JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  if (!result.distributed) throw new Error('distribute did not run');

  const after = await feeWalletUsdcBalance(deployed, { rpcUrl: RPC, usdcAddress: usdc, publicClient });
  if (after !== 0n) throw new Error(`wallet should be drained, got ${after}`);
  console.log('  PASS: SDK keeper leg drained the wallet');

  console.log('\nALL PASS — GatewayFeeWalletFactory revenue path + SDK keeper leg work on anvil.');
  process.exit(0);
}

main().catch((e) => { console.error('\nE2E FAIL:', e.message); process.exit(1); });