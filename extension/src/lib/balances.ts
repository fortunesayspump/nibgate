// Read-only balances (no keys anywhere): onchain USDC via RPC eth_call,
// Gateway ledger via the facilitator balances endpoint. Runs in the
// background worker so content scripts and popup stay dumb.
import { activeNetwork } from './network';

const USDC = '0x3600000000000000000000000000000000000000';
const BALANCE_OF = '0x70a08231';

export type Balances = { wallet: number | null; gateway: number | null };

function isWallet(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((value || '').trim());
}

async function walletUsdc(address: string, rpcUrl: string, timeoutMs: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const data = BALANCE_OF + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: USDC, data }, 'latest'] }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body?.result) return null;
    return Number(BigInt(body.result)) / 1e6;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function gatewayUsdc(address: string, gatewayApi: string, domain: number, timeoutMs: number): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${gatewayApi}/v1/balances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'USDC', sources: [{ depositor: address, domain }] }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const b = data?.balances?.[0];
    const raw = b?.balance ?? b?.available ?? null;
    return raw == null ? null : Number(raw) / 1e6;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBalances(address: string, { timeoutMs = 12000 } = {}): Promise<Balances> {
  if (!isWallet(address)) return { wallet: null, gateway: null };
  const net = await activeNetwork();
  const [wallet, gateway] = await Promise.all([
    walletUsdc(address, net.rpcUrl, timeoutMs),
    gatewayUsdc(address, net.gatewayApi, net.gatewayDomain, timeoutMs),
  ]);
  return { wallet, gateway };
}
