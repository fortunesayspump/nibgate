// The agent's own wallet: a custodial hot key held server-side, funded with
// USDC on Arc (which is also the gas token, so one balance covers value and
// fees). This is deliberately NOT an escrow — nothing locks, nothing vests;
// the run ledger is the budget and per-call ceilings are the brakes.
//
// Reads (address, balance) are free. The only write is a direct USDC
// transfer; x402/Gateway flows sign through @circle-fin/x402-batching in
// unlocks.js instead.
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, erc20Abi, http } from 'viem';
import { spendChain } from './chain.js';
import { agentKey } from './policy.js';

function clients() {
  const chain = spendChain();
  const account = privateKeyToAccount(agentKey());
  const viemChain = {
    id: chain.chainId,
    name: `arc-${chain.name}`,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  };
  const transport = http(chain.rpcUrl);
  return {
    chain,
    account,
    public: createPublicClient({ chain: viemChain, transport }),
    wallet: createWalletClient({ chain: viemChain, transport, account }),
  };
}

export function agentAddress() {
  return privateKeyToAccount(agentKey()).address;
}

/** USDC balance of the agent wallet, in whole dollars. */
export async function agentUsdcBalance() {
  const { chain, account, public: pub } = clients();
  const raw = await pub.readContract({
    address: chain.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });
  return Number(raw) / 1e6;
}

/**
 * Direct USDC transfer. Returns the tx hash. The caller (tips.js) verifies
 * the effect with the hub; the ledger records the spend with this hash.
 */
export async function sendUsdc(to, amountUsd) {
  const { chain, wallet, public: pub } = clients();
  const value = BigInt(Math.round(Number(amountUsd) * 1e6));
  const hash = await wallet.writeContract({
    address: chain.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, value],
  });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

const SPENDER_ABI = [
  { type: 'function', name: 'spend', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowed', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'dailyCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'spentInWindow', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

/**
 * Gate 2 mandate address, when the deployment routes tips through it.
 * Unset = legacy direct-EOA path. Set = contract path exclusively (no
 * silent fallback: a mandate you can silently bypass is theater).
 */
export function spenderAddress() {
  const a = (process.env.DRNIB_SPENDER_ADDRESS || '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : '';
}

/**
 * Spend through the NibgateSpender mandate instead of the raw EOA.
 * Pre-checks (free reads) give clear errors before gas is spent; the
 * contract re-enforces everything onchain regardless.
 */
export async function spendViaContract(to, amountUsd) {
  const spender = spenderAddress();
  if (!spender) throw new Error('spender mandate not configured (DRNIB_SPENDER_ADDRESS)');
  const { wallet, public: pub } = clients();
  const value = BigInt(Math.round(Number(amountUsd) * 1e6));
  const [paused, ok, cap, spent] = await Promise.all([
    pub.readContract({ address: spender, abi: SPENDER_ABI, functionName: 'paused' }),
    pub.readContract({ address: spender, abi: SPENDER_ABI, functionName: 'allowed', args: [to] }),
    pub.readContract({ address: spender, abi: SPENDER_ABI, functionName: 'dailyCap' }),
    pub.readContract({ address: spender, abi: SPENDER_ABI, functionName: 'spentInWindow' }),
  ]);
  if (paused) throw new Error('spender mandate is paused by the keeper');
  if (!ok) throw new Error('recipient not allowlisted on the spender mandate');
  if (spent + value > cap) throw new Error('spender daily cap would be exceeded');
  const hash = await wallet.writeContract({ address: spender, abi: SPENDER_ABI, functionName: 'spend', args: [to, value] });
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}
