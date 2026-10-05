// Agent self-model: queryable state about what the agent actually is, has,
// and can do RIGHT NOW — injected fresh every turn so it reasons from
// reality, not from a stale system prompt. (The proprioception pattern:
// models fail not from missing judgment but from missing self-state.)
import { toolSpecs } from '../tools/executor.js';
import { agentAddress, agentUsdcBalance } from '../spend/wallet.js';
import { isSpendConfigured, MAX_TIP_USD, MAX_UNLOCK_USD, MAX_X402_USD } from '../spend/policy.js';
import { spendChain } from '../spend/chain.js';
import { sandboxConfigured } from '../tools/sandbox.js';
import { budgetState } from '../money.js';

/**
 * Snapshot of the agent's own operational state. Cheap parts (tools, caps)
 * always; chain reads (balances) live every call — a stale balance is how
 * agents promise spends they cannot make.
 */
export async function agentState({ runId = null } = {}) {
  const chain = spendChain();
  const tools = toolSpecs().map((t) => ({ name: t.name, cost: t.cost }));
  const state = {
    identity: 'Dr. Nib research agent (machine payer, x-nibgate-actor: agent)',
    network: `${chain.name} (chain ${chain.chainId})`,
    // Live chain access the agent can query directly (no key, no signup):
    // gas price, base fee, block times, token balances, event logs.
    chainRpc: chain.rpcUrl,
    usdc: chain.usdc,
    tools: tools.map((t) => t.name),
    toolCosts: Object.fromEntries(tools.map((t) => [t.name, t.cost])),
    sandbox: sandboxConfigured() ? 'available' : 'unavailable',
    spend: isSpendConfigured()
      ? { wallet: agentAddress(), ceilings: { tip: MAX_TIP_USD, unlock: MAX_UNLOCK_USD, x402: MAX_X402_USD } }
      : 'unconfigured (no spending key — http/run_code/search only)',
  };
  try {
    if (isSpendConfigured()) {
      state.walletBalanceUsd = Number(await agentUsdcBalance());
    }
  } catch {
    state.walletBalanceUsd = 'unknown (balance read failed)';
  }
  if (runId) {
    try {
      const b = await budgetState(runId);
      state.runBudget = { balance: b.balance, spent: b.spend, cap: null };
    } catch {
      state.runBudget = 'unknown';
    }
  }
  return state;
}

/** One compact block for prompts: the agent's body, current and factual. */
export function selfBlock(state, stepBudget) {
  const lines = [
    `You are ${state.identity} on ${state.network}.`,
    `Tools wired RIGHT NOW: ${state.tools.join(', ')} (nothing else exists — never invent names).`,
    `Chain RPC you can query directly (http_request POST or run_code curl): ${state.chainRpc} — eth_gasPrice, eth_feeHistory, eth_getBlockByNumber, eth_call. USDC: ${state.usdc}.`,
    `Sandbox compute: ${state.sandbox}.`,
  ];
  if (typeof state.walletBalanceUsd === 'number') {
    lines.push(`Your wallet ${state.spend.wallet} holds $${state.walletBalanceUsd.toFixed(2)} USDC. Per-call ceilings: tip $${state.spend.ceilings.tip}, unlock $${state.spend.ceilings.unlock}, x402 $${state.spend.ceilings.x402}.`);
  } else {
    lines.push(`Spending: ${state.spend}.`);
  }
  if (state.runBudget && typeof state.runBudget === 'object') {
    lines.push(`This run's budget: $${Number(state.runBudget.balance).toFixed(2)} left, $${Number(state.runBudget.spent).toFixed(2)} spent.`);
  }
  if (stepBudget) lines.push(`Steps remaining incl. this one: ${stepBudget}. Spend them on evidence, not loops.`);
  return lines.join('\n');
}
