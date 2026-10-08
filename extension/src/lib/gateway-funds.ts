// Gateway funding: deposit wallet USDC into Circle Gateway, withdraw it back.
// Uses the same @circle-fin/x402-batching GatewayClient the hub SDK uses
// (deposit/withdraw/transfer), powered by the embedded wallet's session key.
// Keys never leave the worker; the address-mismatch guard refuses to move
// funds if derivation ever drifts from the unlocked account.
import { GatewayClient } from '@circle-fin/x402-batching/client';
import { activeNetwork, getNetwork } from './network';
import { ensureUnlocked, sessionPrivateKey, unlockedAccountAddress } from './embedded-wallet';

export async function gatewayFundsClient(): Promise<GatewayClient> {
  await ensureUnlocked();
  const key = sessionPrivateKey();
  const address = unlockedAccountAddress();
  if (!key || !address) throw new Error('Wallet is locked — unlock to move Gateway funds.');
  const net = await activeNetwork();
  const name = await getNetwork();
  const client = new GatewayClient({
    chain: name === 'mainnet' ? 'arc' : 'arcTestnet',
    privateKey: key,
    rpcUrl: net.rpcUrl,
  });
  // Fund-safety: the SDK account must be OUR account, or we touch nothing.
  if (client.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Signer mismatch — refusing to move funds.');
  }
  return client;
}

// Wallet → Gateway. Two onchain txs under the hood (approve + deposit); the
// SDK surfaces both hashes. Never a plain USDC transfer — those lose funds.
export async function depositToGateway(amountUsdc: number): Promise<{ depositTxHash?: string; approveTxHash?: string }> {
  if (!(amountUsdc > 0)) throw new Error('Deposit amount must be above zero.');
  const client = await gatewayFundsClient();
  const out = await client.deposit(String(amountUsdc));
  return { depositTxHash: String(out?.depositTxHash || ''), approveTxHash: String((out as { approveTxHash?: unknown })?.approveTxHash || '') };
}

// Gateway → wallet. Instant same-chain transfer flow (attestation + mint),
// handled end-to-end by the SDK. Trustless 7-day path is emergency-only and
// intentionally not exposed here.
export async function withdrawFromGateway(amountUsdc: number): Promise<{ txHash?: string }> {
  if (!(amountUsdc > 0)) throw new Error('Withdraw amount must be above zero.');
  const client = await gatewayFundsClient();
  const out = await client.withdraw(String(amountUsdc));
  const raw = out as { txHash?: unknown; mintTxHash?: unknown; transactionHash?: unknown };
  return { txHash: String(raw?.txHash || raw?.mintTxHash || raw?.transactionHash || '') };
}
