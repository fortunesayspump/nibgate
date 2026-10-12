import { activeChain, getAddArcNetworkParams, isActiveChainId } from './chain.js';

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
  // Strict: the wallet must be on THIS build's chain, not merely any Arc
  // chain. A mainnet wallet on a testnet build (or vice versa) would sign
  // with the wrong chainId and the RPC rejects the raw transaction (seen
  // live on Fund) — or worse, it lands on the wrong chain. Never silently
  // proceed; always request the switch.
  if (currentChainId !== undefined && isActiveChainId(currentChainId)) {
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

/**
 * Repair a broken wallet connection: re-add Arc with the known-good RPC
 * endpoint, then switch to it. Wallets keep the FIRST rpc ever configured
 * for a chain — a stale/dead URL saved months ago stays forever and every
 * broadcast dies with an opaque RPC error while reads/signatures all look
 * fine (seen live on Fund: valid calldata, funded wallet, good nonce, RPC
 * rejects every send). Re-adding points the wallet at a live endpoint.
 */
export async function repairArcNetwork(provider) {
  await addArcNetwork(provider);
  const chain = activeChain();
  return { chainId: chain.id, rpcUrl: chain.rpcUrl };
}

export function waitForChainChange(provider, { chainId = activeChain().id, timeoutMs = 30000 } = {}) {
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
