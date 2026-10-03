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
