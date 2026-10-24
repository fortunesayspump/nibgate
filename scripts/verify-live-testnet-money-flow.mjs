#!/usr/bin/env node
// Guarded, testnet-only held-tip/refund verification.
//
// This script intentionally never prints either private key. Railway injects
// the keeper key at runtime; the ephemeral key is kept in a mode-0600 recovery
// file until every recoverable balance has been returned to the keeper.

import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  parseEther,
  parseUnits,
  toHex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = 5_042_002;
const RPC_URL = process.env.ARC_RPC_URL || process.env.NIBGATE_PAYMENT_RPC_URL || 'https://rpc.testnet.arc.io';
const API_URL = 'https://testnet-api.nibgate.xyz';
const USDC = '0x3600000000000000000000000000000000000000';
const FACTORY = '0xf127a645d7C02a12E0a93B135F8aCF9c3332E518';
const EXPECTED_KEEPER = '0xA0B9Eae592cC3229519744D39d7b67eFb94bd894';
const AMOUNT = '0.01';
const FUNDING = '0.03';
const RECOVERY_FILE = '/tmp/nibgate-testnet-money-flow-recovery.json';

if (process.env.NIBGATE_LIVE_TESTNET_MONEY_FLOW !== '1') {
  throw new Error('Refusing live execution without NIBGATE_LIVE_TESTNET_MONEY_FLOW=1.');
}
if (existsSync(RECOVERY_FILE)) {
  throw new Error(`Refusing to overwrite existing recovery file: ${RECOVERY_FILE}`);
}

const keeperKey = process.env.NIBGATE_KEEPER_PRIVATE_KEY;
if (!/^0x[0-9a-f]{64}$/i.test(keeperKey || '')) throw new Error('A valid keeper key must be injected at runtime.');

const chain = {
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};
const publicClient = createPublicClient({ chain, transport: http(RPC_URL, { timeout: 15_000, retryCount: 1 }) });
const keeper = privateKeyToAccount(keeperKey);
if (keeper.address.toLowerCase() !== EXPECTED_KEEPER.toLowerCase()) {
  throw new Error(`Injected keeper ${keeper.address} does not match the documented testnet holding keeper.`);
}
if (await publicClient.getChainId() !== CHAIN_ID) throw new Error('RPC chain ID mismatch; refusing to transact.');
const factoryCode = await publicClient.getBytecode({ address: FACTORY });
if (!factoryCode || factoryCode === '0x') throw new Error('Documented testnet holding factory has no bytecode.');

const factoryAbi = [
  { type: 'function', name: 'keeper', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'predict', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'address' }] },
];
const onchainKeeper = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'keeper' });
if (onchainKeeper.toLowerCase() !== keeper.address.toLowerCase()) throw new Error('Injected key is not the factory keeper.');

const keeperStart = await publicClient.getBalance({ address: keeper.address });
if (keeperStart < parseEther('0.04')) throw new Error('Keeper has less than the guarded 0.04 testnet-USDC minimum.');

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const domain = `moneyflow-${runId}.example`;
const contentUrl = `https://${domain}/post`;
const base = { contentUrl, title: 'Nibgate testnet money-flow verification', amount: AMOUNT, currency: 'USDC', domain, paymentRail: 'transfer', network: 'testnet' };

async function jsonFetch(path, init = {}) {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${path} returned HTTP ${response.status}: ${body.error || 'unknown error'}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

const challenge = await jsonFetch('/hub/tips/hold', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(base),
});
if (challenge.holdStatus !== 'challenge' || !/^0x[0-9a-f]{40}$/i.test(challenge.box || '')) {
  throw new Error('Hub did not return a valid holding challenge.');
}
const domainHash = keccak256(toHex(domain));
const predicted = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'predict', args: [domainHash] });
if (predicted.toLowerCase() !== challenge.box.toLowerCase()) throw new Error('Hub holding address differs from factory prediction.');

const ephemeralKey = generatePrivateKey();
const ephemeral = privateKeyToAccount(ephemeralKey);
writeFileSync(RECOVERY_FILE, `${JSON.stringify({ chainId: CHAIN_ID, address: ephemeral.address, privateKey: ephemeralKey })}\n`, { mode: 0o600, flag: 'wx' });

const keeperWallet = createWalletClient({ account: keeper, chain, transport: http(RPC_URL) });
const ephemeralWallet = createWalletClient({ account: ephemeral, chain, transport: http(RPC_URL) });
const transactions = {};
let completed = false;

async function sendWithNonceRetry(send, label) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try { return await send(); }
    catch (error) {
      const message = String(error?.message || error);
      if (attempt === 3 || !/(nonce too low|already known|replacement transaction underpriced)/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  throw new Error(`${label} failed after nonce retries.`);
}

try {
  transactions.fund = await sendWithNonceRetry(
    () => keeperWallet.sendTransaction({ to: ephemeral.address, value: parseEther(FUNDING) }),
    'ephemeral funding',
  );
  const fundingReceipt = await publicClient.waitForTransactionReceipt({ hash: transactions.fund, timeout: 120_000 });
  if (fundingReceipt.status !== 'success') throw new Error('Ephemeral funding reverted.');

  const ephemeralFunded = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [ephemeral.address] });
  if (ephemeralFunded < parseUnits(AMOUNT, 6)) throw new Error('Native funding did not expose the expected ERC-20 USDC balance.');

  transactions.hold = await ephemeralWallet.writeContract({
    address: USDC, abi: erc20Abi, functionName: 'transfer', args: [challenge.box, parseUnits(AMOUNT, 6)],
  });
  const holdReceipt = await publicClient.waitForTransactionReceipt({ hash: transactions.hold, timeout: 120_000 });
  if (holdReceipt.status !== 'success') throw new Error('Holding-box transfer reverted.');

  const recorded = await jsonFetch('/hub/tips/hold', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...base, txHash: transactions.hold, walletAddress: ephemeral.address }),
  });
  if (recorded.holdStatus !== 'held' || recorded.tip?.payerWallet?.toLowerCase() !== ephemeral.address.toLowerCase()) {
    throw new Error('Hub did not persist the verified payer as a held tip.');
  }

  const held = await jsonFetch(`/hub/tips/held?domain=${encodeURIComponent(domain)}&limit=100`);
  const matching = (held.tips || []).filter((tip) => String(tip.txHash).toLowerCase() === transactions.hold.toLowerCase());
  if (matching.length !== 1 || matching[0].status !== 'held' || Number(matching[0].amount) !== Number(AMOUNT)) {
    throw new Error('Public held-tip read does not match the recorded transfer.');
  }

  const expiresAt = Date.now() + 5 * 60_000;
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const nonceHex = [...nonce].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const message = [
    'Nibgate tip refund', 'network:testnet', `domain:${domain}`,
    `wallet:${ephemeral.address.toLowerCase()}`, `amount:${parseUnits(AMOUNT, 6)}`,
    `expires:${expiresAt}`, `nonce:${nonceHex}`,
  ].join('\n');
  const signature = await ephemeral.signMessage({ message });
  const refunded = await jsonFetch('/hub/tips/refund', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain, payer: ephemeral.address, amount: Number(AMOUNT), message, signature }),
  });
  if (!refunded.success || !/^0x[0-9a-f]{64}$/i.test(refunded.refundTx || '')) throw new Error('Hub refund response is missing its transaction proof.');
  transactions.refund = refunded.refundTx;
  const refundReceipt = await publicClient.waitForTransactionReceipt({ hash: transactions.refund, timeout: 120_000 });
  if (refundReceipt.status !== 'success') throw new Error('Keeper refund transaction reverted.');

  const boxBalance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [challenge.box] });
  if (boxBalance !== 0n) throw new Error(`Holding box retained ${boxBalance} base units after full refund.`);
  const heldAfter = await jsonFetch(`/hub/tips/held?domain=${encodeURIComponent(domain)}&limit=100`);
  if ((heldAfter.tips || []).some((tip) => String(tip.txHash).toLowerCase() === transactions.hold.toLowerCase())) {
    throw new Error('Refunded tip remains in the public held-tip result.');
  }

  // Return nearly all recoverable value. Keep 0.002 USDC temporarily for the
  // sweep transaction's gas, then drain the native remainder less a 2x fee cap.
  const tokenBalance = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [ephemeral.address] });
  const reserve = parseUnits('0.002', 6);
  if (tokenBalance > reserve) {
    transactions.returnToken = await ephemeralWallet.writeContract({
      address: USDC, abi: erc20Abi, functionName: 'transfer', args: [keeper.address, tokenBalance - reserve],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactions.returnToken, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error('Token return transaction reverted.');
  }

  const nativeBalance = await publicClient.getBalance({ address: ephemeral.address });
  const gasPrice = await publicClient.getGasPrice();
  const gasLimit = 21_000n;
  const feeReserve = gasLimit * gasPrice * 2n;
  if (nativeBalance > feeReserve) {
    transactions.returnNative = await ephemeralWallet.sendTransaction({ to: keeper.address, value: nativeBalance - feeReserve, gas: gasLimit, gasPrice });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactions.returnNative, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error('Native remainder return transaction reverted.');
  }

  const remainingUnits = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [ephemeral.address] });
  completed = true;
  unlinkSync(RECOVERY_FILE);
  console.log(JSON.stringify({
    success: true,
    verifiedAt: new Date().toISOString(),
    network: 'Arc Testnet', chainId: CHAIN_ID,
    keeper: keeper.address, ephemeral: ephemeral.address, domain,
    factory: FACTORY, box: challenge.box, amountUsdc: AMOUNT,
    transactions, tipId: recorded.tip.id, refundId: refunded.id,
    finalBoxBalanceUsdc: formatUnits(boxBalance, 6),
    finalEphemeralBalanceUsdc: formatUnits(remainingUnits, 6),
    assertions: [
      'keeper identity and factory role matched',
      'factory bytecode and deterministic box prediction matched',
      'direct transfer mined and payer was chain-derived',
      'held tip persisted and was publicly readable',
      'strict network/domain/wallet/amount/expiry/nonce signature accepted',
      'keeper refund mined and database no longer reports the tip as held',
      'holding box balance returned to zero',
    ],
  }, null, 2));
} finally {
  if (!completed) {
    console.error(JSON.stringify({
      success: false,
      ephemeral: ephemeral.address,
      recoveryFile: RECOVERY_FILE,
      transactions,
      warning: 'Recovery file retained. Do not rerun or delete it until the balance is reconciled.',
    }, null, 2));
  }
}
