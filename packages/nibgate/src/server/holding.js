import { getContractAddress, keccak256, toHex, encodeFunctionData, recoverMessageAddress, getAddress, parseAbi } from 'viem';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createTipChallenge } from './tip.js';

const ERC20_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

// Nib Tip holding: no-key per-site money boxes + claim tokens.
//
// A holding address is predicted (never deployed until claim) from the
// canonical domain. Payers fund it directly; funds sit visible onchain,
// movable by nobody — not even us, no keys exist. A verified claim triggers
// release(domain, creator): net to the creator, cut to the treasury, one
// atomic transaction.
//
// Contract status: interface pinned here, implementation deploys at mainnet
// launch. Until then, pass explicit factoryAddress/initCodeHash (testnet
// deploys) — the formula never changes, only the constants get pinned.

// Contract status: canonical factories deployed with payer-refund support —
// Arc testnet 2026-09-28 (owner/keeper 0x796a…), Arc mainnet 2026-09-28
// (owner treasury 0x558e…, hub keeper 0x0Ac8…). Owner can rotate the keeper;
// keeper relays hub-verified release/refund. The formula never changes, only
// the constants.
export const HOLDING_DEPLOYMENTS = {
  testnet: {
    chainId: 5042002,
    factoryAddress: '0xf127a645d7c02a12e0a93b135f8acf9c3332e518',
    initCodeHash: '0x0834a6c15bacd21bc1810fffb0d5d9bbf7c790dcdf4d950e1bf57828eb7e6514',
    usdc: '0x3600000000000000000000000000000000000000',
    treasury: '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12',
    feeBps: 500,
    gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
    gatewayMinter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
    gatewayDomain: 26,
    deployTx: '0xa2333e3cb7bedbfce1120b1da2a7e71f8530cf8025c4e907695478ca84707ada',
  },
  mainnet: {
    chainId: 5042,
    factoryAddress: '0x3b25846c3332fcb8140e2ab60aad2b7fb401fe87',
    initCodeHash: '0x94f9f922f2c114eb9c39962fdc532f66cf1e0a8b82f1f9126a23d0ce5c87886e',
    usdc: '0x3600000000000000000000000000000000000000',
    treasury: '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12',
    feeBps: 500,
    gatewayWallet: '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE',
    gatewayMinter: '0x2222222d7164433c4C09B0b0D809a9b52C04C205',
    gatewayDomain: 26,
    deployTx: '0x06fe5b318d78c76d947d38440c14fcd8bdafc21314bc5f34d54c22adf89f263e',
  },
};

// Back-compat aliases (older imports). Prefer HOLDING_DEPLOYMENTS.testnet.
export const HOLDING_FACTORY_PLACEHOLDER = HOLDING_DEPLOYMENTS.testnet.factoryAddress;
export const HOLDING_INIT_CODE_HASH_PLACEHOLDER = HOLDING_DEPLOYMENTS.testnet.initCodeHash;

export function holdingDeployment(network = 'testnet') {
  const raw = String(network || '').toLowerCase();
  const isMainnet = raw === 'mainnet' || raw === 'eip155:5042' || (raw.includes('5042') && !raw.includes('5042002'));
  const name = isMainnet ? 'mainnet' : 'testnet';
  const dep = HOLDING_DEPLOYMENTS[name];
  if (!dep) throw new Error(`No holding deployment for network "${network}".`);
  return { network: name, ...dep };
}

// Minimal factory interface (pinned): predict offchain, deploy + release onchain.
export const HOLDING_FACTORY_ABI = [
  {
    name: 'predict',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'domainHash_', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'deploy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'domainHash_', type: 'bytes32' }],
    outputs: [{ name: 'wallet', type: 'address' }],
  },
  {
    name: 'release',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'domainHash', type: 'bytes32' },
      { name: 'creator', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'refund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'domainHash_', type: 'bytes32' },
      { name: 'payer', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'wallet', type: 'address' }],
  },
  {
    name: 'Release',
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'domainHash', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'protocolFee', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Refunded',
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'domainHash', type: 'bytes32', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
];

export function canonicalDomainKey(domain = '') {
  return String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0];
}

export function domainHashFor(domain = '') {
  const key = canonicalDomainKey(domain);
  if (!key) throw new Error('domainHashFor requires a domain.');
  return keccak256(toHex(key));
}

// Predict the no-key holding address for a site. Pure, offchain, free.
// factoryAddress/initCodeHash pin to the deployed factory at mainnet.
export function mintHoldingAddress(domain, options = {}) {
  const key = canonicalDomainKey(domain);
  if (!key) throw new Error('mintHoldingAddress requires a domain.');
  const factoryAddress = options.factoryAddress || HOLDING_FACTORY_PLACEHOLDER;
  const initCodeHash = options.initCodeHash || HOLDING_INIT_CODE_HASH_PLACEHOLDER;
  return getContractAddress({
    opcode: 'CREATE2',
    from: factoryAddress,
    salt: domainHashFor(key),
    bytecodeHash: initCodeHash,
  });
}

// Build the release calldata: net to creator, cut to treasury, atomic.
// Verification happens offchain (hub claim flow); this is just the call.
export function buildHoldingRelease({ domain, creator, factoryAddress }) {
  const factory = String(factoryAddress || '');
  const to = String(creator || '');
  if (!factory || !to) throw new Error('buildHoldingRelease requires domain, creator, factoryAddress.');
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: HOLDING_FACTORY_ABI,
      functionName: 'release',
      args: [domainHashFor(domain), getAddress(to)],
    }),
    value: 0n,
  };
}

// Submit a release with a keeper key. Returns the tx hash.
export async function submitHoldingRelease(call, { privateKey, rpcUrl, chainId }) {
  if (!call?.to || !call?.data) throw new Error('submitHoldingRelease requires a release call.');
  if (!privateKey || !rpcUrl) throw new Error('submitHoldingRelease requires privateKey and rpcUrl.');
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: Number(chainId) || 5042002,
    name: 'arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const txHash = await client.sendTransaction({ to: call.to, data: call.data, value: call.value ?? 0n });
  // Wait for inclusion so a reverted release (e.g. empty box) surfaces as an
  // error instead of a silent "success".
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Holding release reverted (tx ${txHash}).`);
  return txHash;
}

export function buildHoldingRefund({ domain, payer, amountUsdc, factoryAddress }) {
  const factory = String(factoryAddress || '');
  const to = String(payer || '');
  const amount = Number(amountUsdc || 0);
  if (!factory || !to || !(amount > 0)) throw new Error('buildHoldingRefund requires domain, payer, amountUsdc, factoryAddress.');
  return {
    to: getAddress(factory),
    data: encodeFunctionData({
      abi: HOLDING_FACTORY_ABI,
      functionName: 'refund',
      args: [domainHashFor(domain), getAddress(to), BigInt(Math.round(amount * 1e6))],
    }),
    value: 0n,
  };
}

// Submit a refund with a keeper key. Returns the tx hash.
export async function submitHoldingRefund(call, { privateKey, rpcUrl, chainId }) {
  if (!call?.to || !call?.data) throw new Error('submitHoldingRefund requires a refund call.');
  if (!privateKey || !rpcUrl) throw new Error('submitHoldingRefund requires privateKey and rpcUrl.');
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: Number(chainId) || 5042002,
    name: 'arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const txHash = await client.sendTransaction({ to: call.to, data: call.data, value: call.value ?? 0n });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Holding refund reverted (tx ${txHash}).`);
  return txHash;
}

// Which wallet a hold pays: the predicted no-key box for the domain.
export function holdingRecipient(domain, options = {}) {
  return mintHoldingAddress(domain, options);
}

// Build the box-funding challenge for a hold. Mirrors the tip challenge
// envelope so every client parses one shape. Both rails pay the box:
//  - direct: on-chain USDC transfer lands immediately.
//  - gateway: Circle credits the box's Gateway ledger; the box implements
//    ERC-1271 so the hub can later withdraw that credit onchain into the box
//    (see withdrawHoldingBoxGateway). No hub shell, no custody in between.
export function buildHoldingRequirement(input = {}, options = {}) {
  const dep = holdingDeployment(options.network);
  const box = holdingRecipient(input.domain, { ...options, factoryAddress: dep.factoryAddress, initCodeHash: dep.initCodeHash });
  const challenge = createTipChallenge(
    {
      contentUrl: input.contentUrl,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      recipient: box,
    },
    {
      network: `eip155:${dep.chainId}`,
      paymentRail: options.paymentRail,
      paymentMode: options.paymentMode,
      holdPolicy: 'funds held in a no-key onchain box until the site owner claims; never expire; refundable to the payer while unclaimed',
    },
  );
  return { box, recipient: box, domainHash: domainHashFor(input.domain), challenge, feeBps: dep.feeBps, deployment: dep };
}

// Deploy (materialize) a domain's box via the permissionless factory. Needed
// before a Gateway withdrawal so the ERC-1271 check has code to call.
export async function deployHoldingBox(domain, options = {}) {
  const dep = holdingDeployment(options.network);
  const privateKey = options.privateKey;
  const rpcUrl = options.rpcUrl;
  if (!privateKey || !rpcUrl) throw new Error('deployHoldingBox requires privateKey and rpcUrl.');
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: dep.chainId,
    name: 'arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const hash = await client.writeContract({
    address: getAddress(dep.factoryAddress),
    abi: HOLDING_FACTORY_ABI,
    functionName: 'deploy',
    args: [domainHashFor(domain)],
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return { box: holdingRecipient(domain, { factoryAddress: dep.factoryAddress, initCodeHash: dep.initCodeHash }), tx: hash };
}

// Materialize a box's Gateway ledger credit on-chain using the box's ERC-1271
// self-burn authorization. Reuses the shared fee-wallet withdrawal machinery
// (collected exactly like gateway unlocks). Deploys the box first via our
// factory, then withdraws with the fee-wallet deploy step skipped.
export async function withdrawHoldingBoxGateway(domain, options = {}) {
  const dep = holdingDeployment(options.network);
  const box = options.box || holdingRecipient(domain, { factoryAddress: dep.factoryAddress, initCodeHash: dep.initCodeHash });
  const { withdrawGatewayBalanceFor, gatewayBalanceFor } = await import('./fee-wallet.js');
  const gatewayApi = options.gatewayApi || undefined;
  const waitMs = Number(options.waitMs || 0);
  const deadline = Date.now() + waitMs;
  let available = 0n;
  do {
    const balance = await gatewayBalanceFor(box, { domain: dep.gatewayDomain, gatewayApi }).catch(() => null);
    available = BigInt(balance?.available ?? balance?.balance ?? 0);
    if (available > 0n || Date.now() >= deadline) break;
    // Circle batched settlement is deferred; poll until the credit lands.
    await new Promise((r) => setTimeout(r, 5000));
  } while (true);
  if (available <= 0n) return { box, withdrew: false, available: '0' };
  await deployHoldingBox(domain, { privateKey: options.privateKey, rpcUrl: options.rpcUrl, network: options.network });
  const out = await withdrawGatewayBalanceFor(box, {
    keeperKey: options.privateKey,
    domain: dep.gatewayDomain,
    gatewayWallet: dep.gatewayWallet,
    gatewayMinter: dep.gatewayMinter,
    gatewayApi,
    rpcUrl: options.rpcUrl,
    skipEnsureDeploy: true,
  });
  return { box, withdrew: true, available: available.toString(), ...out };
}

// Keeper funds a box onchain (used to mirror a gateway credit into the box, or
// to pre-fund). Returns the tx hash.
export async function fundHoldingBox(domain, amountUsdc, options = {}) {
  const dep = holdingDeployment(options.network);
  const box = options.box || holdingRecipient(domain, { factoryAddress: dep.factoryAddress, initCodeHash: dep.initCodeHash });
  const privateKey = options.privateKey;
  const rpcUrl = options.rpcUrl;
  if (!privateKey || !rpcUrl) throw new Error('fundHoldingBox requires privateKey and rpcUrl.');
  const account = privateKeyToAccount(privateKey);
  const chain = {
    id: dep.chainId,
    name: 'arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const hash = await client.writeContract({
    address: dep.usdc,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [getAddress(box), BigInt(Math.round(Number(amountUsdc) * 1e6))],
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`Box funding transfer reverted (tx ${hash}).`);
  return hash;
}

// Canonical claim message: domain + wallet + expiry, one line each.
export function claimMessage({ domain, wallet, expiresAt }) {
  const key = canonicalDomainKey(domain);
  const address = String(wallet || '').trim();
  if (!key || !address) throw new Error('claimMessage requires domain and wallet.');
  return [
    'Nibgate tip claim',
    `domain:${key}`,
    `wallet:${address.toLowerCase()}`,
    `expires:${Number(expiresAt) || 0}`,
  ].join('\n');
}

// Mint a claim token with any viem-compatible signMessage fn.
export async function mintClaimToken({ domain, wallet, expiresAt }, signMessage) {
  if (typeof signMessage !== 'function') throw new Error('mintClaimToken requires a signMessage function.');
  const message = claimMessage({ domain, wallet, expiresAt });
  const signature = await signMessage(message);
  return { domain: canonicalDomainKey(domain), wallet: String(wallet).toLowerCase(), expiresAt: Number(expiresAt) || 0, message, signature };
}

// Verify a claim token: recovers the signer, checks binding + expiry.
export async function verifyClaimToken({ message, signature, domain, wallet, maxAgeMs, now = Date.now() }) {
  if (!message || !signature) return { valid: false, reason: 'missing message or signature' };
  let signer;
  try {
    signer = (await recoverMessageAddress({ message, signature })).toLowerCase();
  } catch {
    return { valid: false, reason: 'unrecoverable signature' };
  }
  const lines = Object.fromEntries(
    String(message).split('\n').map((l) => l.split(':').map((s) => s.trim())).filter((p) => p.length === 2),
  );
  if (lines.domain && domain && canonicalDomainKey(domain) !== lines.domain) {
    return { valid: false, signer, reason: 'domain mismatch' };
  }
  const expectedWallet = String(wallet || lines.wallet || '').toLowerCase();
  if (expectedWallet && signer !== expectedWallet) {
    return { valid: false, signer, reason: 'signer is not the claimed wallet' };
  }
  const expires = Number(lines.expires || 0);
  if (expires && now > expires) return { valid: false, signer, reason: 'expired' };
  if (maxAgeMs && lines.created) {
    if (now - Number(lines.created) > maxAgeMs) return { valid: false, signer, reason: 'stale' };
  }
  return { valid: true, signer };
}

// Tip intent for the unresolved flow: validated pledge object, no money moved.
export function createTipIntent({ url, contentUrl, title, amount, payerWallet, minAmount = 0 } = {}) {
  const target = String(contentUrl || url || '');
  if (!target) throw new Error('createTipIntent requires a url.');
  const value = Number(amount);
  if (!(value > 0)) throw new Error('createTipIntent requires amount > 0.');
  if (Number(minAmount) > 0 && value < Number(minAmount)) {
    throw new Error(`Tip ${value} is below the ${minAmount} minimum.`);
  }
  return {
    type: 'tip-intent',
    contentUrl: target,
    title: title || null,
    amount: value,
    payerWallet: payerWallet || null,
    timestamp: new Date().toISOString(),
  };
}
