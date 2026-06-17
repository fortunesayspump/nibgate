import { BatchEvmScheme } from '@circle-fin/x402-batching/client';
import { createWalletClient, custom, defineChain, getAddress } from 'viem';

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network']
    }
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://testnet.arcscan.app'
    }
  },
  testnet: true
});

const ARC_CHAIN_HEX = `0x${ARC_TESTNET.id.toString(16)}`;
const PAYMENT_REQUIRED_HEADER = 'PAYMENT-REQUIRED';
const PAYMENT_SIGNATURE_HEADER = 'Payment-Signature';

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

function decodeBase64Json(value: string) {
  const decoded = atob(value);
  return JSON.parse(decoded);
}

function encodeBase64Json(value: unknown) {
  return btoa(JSON.stringify(value));
}

function setBusy(form: HTMLFormElement, busy: boolean) {
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submit) return;

  submit.disabled = busy;
  submit.textContent = busy ? 'Waiting for wallet...' : submit.dataset.label || submit.textContent || 'Pay';
}

function setMessage(form: HTMLFormElement, message: string, tone: 'neutral' | 'error' | 'success' = 'neutral') {
  const outlet = form.querySelector<HTMLElement>('[data-unlock-message]');
  if (!outlet) return;

  outlet.textContent = message;
  outlet.dataset.tone = tone;
}

async function ensureArcNetwork(provider: EthereumProvider) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }]
    });
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? Number(error.code) : null;
    if (code !== 4902) throw error;

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: ARC_CHAIN_HEX,
        chainName: ARC_TESTNET.name,
        rpcUrls: ARC_TESTNET.rpcUrls.default.http,
        blockExplorerUrls: [ARC_TESTNET.blockExplorers.default.url],
        nativeCurrency: ARC_TESTNET.nativeCurrency
      }]
    });
  }
}

async function payWithWallet(form: HTMLFormElement) {
  const provider = window.ethereum;
  if (!provider) {
    throw new Error('No browser wallet found. Open this page in a wallet-enabled browser to pay as the reader.');
  }

  const routeId = form.dataset.routeId;
  const routePath = form.dataset.routePath;
  if (!routeId || !routePath) throw new Error('Missing route metadata.');

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = Array.isArray(accounts) ? String(accounts[0] || '') : '';
  if (!account) throw new Error('No wallet account was returned.');

  await ensureArcNetwork(provider);

  const walletClient = createWalletClient({
    account: getAddress(account),
    chain: ARC_TESTNET,
    transport: custom(provider)
  });

  const signer = {
    address: getAddress(account),
    signTypedData: (params: Parameters<typeof walletClient.signTypedData>[0]) => walletClient.signTypedData(params)
  };

  setMessage(form, 'Checking price and preparing payment request...');
  const probe = await fetch(`/api/content/${routeId}/access?actor=human`, {
    credentials: 'include'
  });

  if (probe.ok) {
    window.location.href = routePath;
    return;
  }

  if (probe.status !== 402) {
    throw new Error(`Unexpected response from paywall: ${probe.status}`);
  }

  const header = probe.headers.get(PAYMENT_REQUIRED_HEADER);
  if (!header) throw new Error('The paywall did not return a PAYMENT-REQUIRED header.');

  const paymentRequired = decodeBase64Json(header);
  const accepted = paymentRequired.accepts?.find((option: Record<string, unknown>) => {
    return option.network === `eip155:${ARC_TESTNET.id}` &&
      option.extra?.name === 'GatewayWalletBatched' &&
      option.extra?.version === '1';
  });

  if (!accepted) {
    throw new Error('No Arc Testnet Gateway payment option is available for this route.');
  }

  setMessage(form, 'Approve the typed-data payment request in your wallet.');
  const scheme = new BatchEvmScheme(signer);
  const paymentPayload = await scheme.createPaymentPayload(paymentRequired.x402Version ?? 2, accepted);
  const paymentHeader = encodeBase64Json({
    ...paymentPayload,
    resource: paymentRequired.resource,
    accepted
  });

  setMessage(form, 'Submitting payment to Circle Gateway...');
  const paid = await fetch(`/api/content/${routeId}/access?actor=human`, {
    credentials: 'include',
    headers: {
      [PAYMENT_SIGNATURE_HEADER]: paymentHeader
    }
  });

  if (!paid.ok) {
    const error = await paid.json().catch(() => ({}));
    throw new Error(error.error || error.detail || `Payment failed with status ${paid.status}`);
  }

  setMessage(form, 'Payment settled. Opening content...', 'success');
  await paid.json().catch(() => null);
  window.location.href = routePath;
}

function initWalletForms() {
  const forms = document.querySelectorAll<HTMLFormElement>('[data-wallet-unlock]');
  for (const form of forms) {
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.dataset.label = submit.textContent || 'Pay with your wallet';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setBusy(form, true);
      setMessage(form, 'Connecting wallet...');

      try {
        await payWithWallet(form);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Payment failed.';
        setMessage(form, message, 'error');
      } finally {
        setBusy(form, false);
      }
    });
  }
}

initWalletForms();
