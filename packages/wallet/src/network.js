import { ARC_MAINNET, ARC_TESTNET, activeChain, getAddArcNetworkParams } from './chain.js';

// Accept an explicit Arc target for standalone/CDN consumers whose selected
// network is independent of this package's build environment. Canonicalize
// metadata by ID: caller-supplied RPC URLs are never trusted for repair.
function resolveArcChain(requested = activeChain()) {
  if (requested?.id === ARC_MAINNET.id) return ARC_MAINNET
  if (requested?.id === ARC_TESTNET.id) return ARC_TESTNET
  throw new RangeError('Unsupported Arc target. Choose Arc mainnet or Arc Testnet.')
}

// Only classify errors at the selected-wallet request boundary. A Hub/API 404
// must never become a wallet-RPC diagnosis, and raw provider text can contain
// signatures, request bodies or credential-bearing URLs.
const MESSAGES = {
  'not-found': "Your wallet's Arc RPC returned HTTP 404. Repair its connection or update its saved RPC in wallet settings.",
  unavailable: "Your wallet's Arc RPC could not be reached. Check the connection before paying.",
  timeout: "Your wallet's Arc connection check timed out. Check again before paying.",
  'rate-limited': "Your wallet's Arc RPC is rate limited. Wait a moment, then check again.",
  unsupported: 'This wallet does not support the required connection check or network request.',
  'access-denied': "The RPC used by your wallet denied access. Check its RPC settings before paying.",
  unauthorized: 'Reconnect your wallet and approve account access before continuing.',
  cancelled: 'Wallet request cancelled.',
  pending: 'A wallet request is already pending. Open your wallet to finish it.',
  disconnected: 'The selected wallet is disconnected. Reconnect it before continuing.',
  'wrong-chain': 'Switch the selected wallet to the active Arc network before paying.',
  'invalid-response': 'The selected wallet returned an invalid Arc RPC response. Check its connection before paying.',
  changed: 'The selected wallet network changed during the connection check. Check again before paying.',
}

export class ArcConnectionError extends Error {
  constructor(reason = 'unavailable', { method = '', manual = false, chain: requestedChain } = {}) {
    const safeReason = Object.hasOwn(MESSAGES, reason) ? reason : 'unavailable'
    const chain = resolveArcChain(requestedChain)
    const message = safeReason === 'wrong-chain' ? `Switch the selected wallet to ${chain.name} before paying.` : MESSAGES[safeReason]
    super(`${message}${manual ? ` In your wallet's ${chain.name} settings, set the RPC to ${chain.rpcUrl}, keep chain ID ${chain.id}, then check again.` : ''}`)
    this.name = 'ArcConnectionError'
    this.code = 'ARC_CONNECTION_ERROR'
    this.reason = safeReason
    this.chainId = chain.id
    this.method = method
    this.manual = manual
    this.canRepair = ['not-found', 'unavailable', 'timeout', 'invalid-response', 'wrong-chain', 'access-denied'].includes(safeReason)
  }
}

export function classifyArcRpcError(error, method = '', { chain: requestedChain } = {}) {
  const chain = resolveArcChain(requestedChain)
  if (error instanceof ArcConnectionError) return new ArcConnectionError(error.reason, { method: error.method || method, manual: error.manual, chain })
  const seen = new Set()
  const codes = [], statuses = [], messages = []
  let current = error
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++) {
    seen.add(current)
    if (current.code != null) codes.push(Number(current.code))
    for (const value of [current.status, current.statusCode, current.response?.status]) {
      if (value != null) statuses.push(Number(value))
    }
    messages.push(String(typeof current === 'string' ? current : [current.message, current.shortMessage, current.details].filter((v) => typeof v === 'string').join(' ')).slice(0, 2000))
    current = current.cause || current.data?.originalError
  }
  const text = messages.join(' ')
  let reason = 'unavailable'
  if (codes.includes(4001) || /user (rejected|denied|cancelled)/i.test(text)) reason = 'cancelled'
  else if (codes.includes(4100)) reason = 'unauthorized'
  else if (codes.includes(-32002)) reason = 'pending'
  else if (codes.includes(4200) || codes.includes(-32601)) reason = 'unsupported'
  else if (codes.includes(4900)) reason = 'disconnected'
  else if (codes.includes(4901) || codes.includes(4902)) reason = 'wrong-chain'
  else if (statuses.includes(401) || statuses.includes(403)) reason = 'access-denied'
  else if (statuses.includes(429) || codes.includes(429) || /(?:HTTP|status(?: code)?)\s*[:=]?\s*429\b|rate.?limit/i.test(text)) reason = 'rate-limited'
  else if (statuses.includes(404) || codes.includes(404) || /(?:HTTP|status(?: code)?)\s*[:=]?\s*404\b|404\s+(?:not found)/i.test(text)) reason = 'not-found'
  else if (/timed?\s*out|timeout/i.test(text)) reason = 'timeout'
  return new ArcConnectionError(reason, { method, chain })
}

function assertSelection(assertActive, chain) {
  try { assertActive() } catch { throw new ArcConnectionError('changed', { chain }) }
}

function budget(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 30000) : 9000
}

async function readWallet(provider, method, timeoutMs, chain) {
  if (!provider?.request) throw new ArcConnectionError('disconnected', { method, chain })
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.request({ method })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new ArcConnectionError('timeout', { method, chain })), Math.max(1, timeoutMs)) }),
    ])
  } catch (error) { throw classifyArcRpcError(error, method, { chain }) }
  finally { clearTimeout(timer) }
}

function parseChain(value, chain) {
  const id = typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) ? Number(value) :
    typeof value === 'number' ? value : NaN
  if (!Number.isSafeInteger(id) || id <= 0) throw new ArcConnectionError('invalid-response', { method: 'eth_chainId', chain })
  return id
}

// A successful check proves only that reads respond on this selected provider.
// It cannot reveal/force its saved RPC URL or guarantee a future broadcast.
export async function checkArcConnection(provider, { timeoutMs = 9000, chain: requestedChain, assertActive = () => {} } = {}) {
  const chain = resolveArcChain(requestedChain)
  const deadline = Date.now() + budget(timeoutMs)
  const read = async (method) => {
    assertSelection(assertActive, chain)
    const result = await readWallet(provider, method, deadline - Date.now(), chain)
    assertSelection(assertActive, chain)
    return result
  }
  const chainId = parseChain(await read('eth_chainId'), chain)
  if (chainId !== chain.id) throw new ArcConnectionError('wrong-chain', { method: 'eth_chainId', chain })
  const blockNumber = await read('eth_blockNumber')
  if (typeof blockNumber !== 'string' || !/^0x[0-9a-f]+$/i.test(blockNumber)) {
    throw new ArcConnectionError('invalid-response', { method: 'eth_blockNumber', chain })
  }
  if (parseChain(await read('eth_chainId'), chain) !== chainId) throw new ArcConnectionError('changed', { method: 'eth_chainId', chain })
  return { chainId, blockNumber, checkedAt: Date.now() }
}

export async function ensureArcNetwork(provider, { wait = true, timeoutMs = 9000, onSwitch, chain: requestedChain, assertActive = () => {} } = {}) {
  const chain = resolveArcChain(requestedChain)
  // Never trust a cached currentChainId: external wallet RPCs can be broken
  // while the wallet still reports the expected chain from local metadata.
  assertSelection(assertActive, chain)
  const chainId = parseChain(await readWallet(provider, 'eth_chainId', budget(timeoutMs), chain), chain)
  assertSelection(assertActive, chain)
  let switched = false
  if (chainId !== chain.id) {
    try { await switchToArcNetwork(provider, { chain, assertActive }) }
    catch (error) { throw classifyArcRpcError(error, 'wallet_switchEthereumChain', { chain }) }
    if (wait) {
      try { await waitForChainChange(provider, { chainId: chain.id, timeoutMs: budget(timeoutMs) }) }
      catch (error) { throw classifyArcRpcError(error, 'wallet_switchEthereumChain', { chain }) }
    }
    switched = true
    onSwitch?.()
  }
  return { switched, ...await checkArcConnection(provider, { timeoutMs, chain, assertActive }) }
}

export async function switchToArcNetwork(provider, { chain: requestedChain, assertActive = () => {} } = {}) {
  const chain = resolveArcChain(requestedChain);
  assertSelection(assertActive, chain)
  try {
    const result = await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }],
    });
    assertSelection(assertActive, chain)
    if (result?.code === 4902) {
      await addArcNetwork(provider, chain, assertActive);
    }
  } catch (error) {
    if (isMissingChain(error)) {
      await addArcNetwork(provider, chain, assertActive);
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

async function addArcNetwork(provider, chain, assertActive) {
  assertSelection(assertActive, chain)
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [getAddArcNetworkParams(chain)],
  });
  assertSelection(assertActive, chain)
  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: chain.chainIdHex }],
  });
  assertSelection(assertActive, chain)
}

// User-initiated only. EIP-3085 does not promise replacement of an existing
// RPC, so a successful add/switch is followed by actual selected-wallet reads.
const repairs = new WeakSet()
export async function repairArcNetwork(provider, { timeoutMs = 9000, assertActive = () => {}, chain: requestedChain } = {}) {
  const chain = resolveArcChain(requestedChain)
  if (!provider?.request) throw new ArcConnectionError('disconnected', { chain })
  if (repairs.has(provider)) throw new ArcConnectionError('pending', { chain })
  const guard = () => {
    try { assertActive() } catch { throw new ArcConnectionError('changed', { chain }) }
  }
  let method = 'wallet_addEthereumChain'
  repairs.add(provider)
  try {
    guard()
    await provider.request({ method, params: [getAddArcNetworkParams(chain)] })
    guard()
    method = 'wallet_switchEthereumChain'
    await provider.request({ method, params: [{ chainId: chain.chainIdHex }] })
    guard()
    await waitForChainChange(provider, { chainId: chain.id, timeoutMs: budget(timeoutMs) })
    guard()
    const health = await checkArcConnection(provider, { timeoutMs, chain, assertActive })
    guard()
    return { ...health, requestedRpcUrl: chain.rpcUrl }
  } catch (error) {
    const classified = classifyArcRpcError(error, method, { chain })
    const manual = !['cancelled', 'pending', 'unauthorized', 'disconnected', 'changed'].includes(classified.reason)
    throw new ArcConnectionError(classified.reason, { method: classified.method, manual, chain })
  } finally { repairs.delete(provider) }
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
      reject(new ArcConnectionError('timeout', { method: 'wallet_switchEthereumChain' }));
    }, timeoutMs);

    // Race-proof: the switch may already have landed before the listener
    // attached (or the wallet may never emit when nothing changed).
    if (provider?.request) {
      Promise.resolve().then(() => provider.request({ method: 'eth_chainId' })).then((id) => {
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
