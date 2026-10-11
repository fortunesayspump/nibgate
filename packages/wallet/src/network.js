import { activeChain, getAddArcNetworkParams, isArcNetwork } from './chain.js';

export async function ensureArcNetwork(provider, { currentChainId, wait = true, timeoutMs = 10000, onSwitch } = {}) {
  if (!provider?.request) {
    throw new Error('Wallet provider is not available.');
  }
  // Read the chain first: requesting a switch when already on Arc shows no
  // prompt on some wallets and emits no chainChanged, so the wait below
  // burns 10s and fails with "did not switch in time" (seen live on Fund).
  if (currentChainId === undefined) {
    try {
      const id = await provider.request({ method: 'eth_chainId' });
      currentChainId = typeof id === 'string' && /^0x/i.test(id) ? Number(id) : id;
    } catch {
      /* unreadable — fall through to the switch attempt */
    }
  }
  if (currentChainId !== undefined && isArcNetwork(currentChainId)) {
    return { switched: false, chainId: currentChainId };
  }
  await switchToArcNetwork(provider);
  if (wait) {
    await waitForChainChange(provider, { chainId: activeChain().id, timeoutMs });
  }
  onSwitch?.();
  return { switched: true, chainId: activeChain().id };
}

export async function switchToArcNetwork(provider) {
  const chain = activeChain();
  try {
    const result = await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
    if (result?.code === 4902) {
      await addArcNetwork(provider);
    }
  } catch (error) {
    if (isMissingChain(error)) {
      await addArcNetwork(provider);
      return;
    }
    throw error;
  }
}

function isMissingChain(error) {
  const code = error?.code;
  if (code === 4902 || code === '4902') return true;
  if (typeof code === 'string' && /^0x[0-9a-f]+$/i.test(code)) {
    try { return BigInt(code) === 4902n; } catch { return false; }
  }
  return false;
}

async function addArcNetwork(provider) {
  const chain = activeChain();
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [getAddArcNetworkParams()],
  });
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: chain.chainIdHex }],
  });
}

export function waitForChainChange(provider, { chainId = activeChain().id, timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      provider.removeListener?.('chainChanged', onChainChanged);
    };

    const onChainChanged = (value) => {
      const next = typeof value === 'string' && /^0x/i.test(value) ? Number(value) : value;
      if (next === chainId) {
        cleanup();
        resolve();
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Wallet did not switch networks in time.'));
    }, timeoutMs);

    // Race-proof: the switch may already have landed before the listener
    // attached (or the wallet may never emit when nothing changed).
    if (provider?.request) {
      provider.request({ method: 'eth_chainId' }).then((id) => {
        const cur = typeof id === 'string' && /^0x/i.test(id) ? Number(id) : id;
        if (cur === chainId) {
          cleanup();
          resolve();
        }
      }).catch(() => { /* wait for the event instead */ });
    }

    provider.on?.('chainChanged', onChainChanged);
  });
}
