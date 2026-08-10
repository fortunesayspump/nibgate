import { ARC_TESTNET, getAddArcNetworkParams, isArcNetwork } from './chain.js';

export async function ensureArcNetwork(provider, { currentChainId, wait = true, timeoutMs = 10000, onSwitch } = {}) {
  if (!provider?.request) {
    throw new Error('Wallet provider is not available.');
  }
  if (currentChainId !== undefined && isArcNetwork(currentChainId)) {
    return { switched: false, chainId: currentChainId };
  }
  await switchToArcNetwork(provider);
  if (wait) {
    await waitForChainChange(provider, { chainId: ARC_TESTNET.id, timeoutMs });
  }
  onSwitch?.();
  return { switched: true, chainId: ARC_TESTNET.id };
}

export async function switchToArcNetwork(provider) {
  try {
    const result = await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
    if (result?.code === 4902) {
      await addArcNetwork(provider);
    }
  } catch (error) {
    if (error?.code === 4902 || BigInt(error?.code) === 4902n) {
      await addArcNetwork(provider);
      return;
    }
    throw error;
  }
}

async function addArcNetwork(provider) {
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [getAddArcNetworkParams()],
  });
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: ARC_TESTNET.chainIdHex }],
  });
}

export function waitForChainChange(provider, { chainId = ARC_TESTNET.id, timeoutMs = 10000 } = {}) {
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

    provider.on?.('chainChanged', onChainChanged);
  });
}
