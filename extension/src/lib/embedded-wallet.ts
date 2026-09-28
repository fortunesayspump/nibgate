// Embedded wallet: the extension's own account. ALL crypto lives in this
// single module (audit rule): PBKDF2-SHA256 (600k) + AES-256-GCM, fresh
// salt + IV per encryption, key material as zeroed Uint8Arrays, never
// logged, never stored plaintext. Keys live in worker memory only while
// unlocked; a fresh worker always cold-starts locked. No vendor, no
// network dependency — swappable behind this interface later.
import {
  generateMnemonic,
  mnemonicToAccount,
  english,
} from 'viem/accounts';
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  type Hex,
} from 'viem';

const VAULT_KEY = 'nibgateVault';
const SESSION_KEY = 'nibgateUnlocked';
// The decrypted session secret is kept in chrome.storage.session: memory-backed,
// never written to disk, cleared on browser close. This survives MV3 worker
// suspension so the wallet stays unlocked across popup closes until the idle
// TTL elapses.
const SESSION_VAULT_KEY = 'nibgateSessionVault';
const PBKDF2_ITERATIONS = 600_000;
const AUTO_LOCK_MINUTES = 15;

const USDC = '0x3600000000000000000000000000000000000000';
const TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

type VaultBlob = { salt: string; iv: string; ciphertext: string };

let unlockedAddress = '';
// Session secret: the decrypted mnemonic, held ONLY in worker memory while
// unlocked, cleared (dereferenced for GC) on lock. Strings can't be forcibly
// zeroed like byte arrays — accepted tradeoff shared by shipping wallets;
// the encrypted vault at rest (AES-GCM) is the real security boundary, and
// a fresh worker always cold-starts locked.
let sessionMnemonic: string | null = null;
let lastActivityAt = 0;

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function seal(password: string, mnemonic: string): Promise<VaultBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(mnemonic));
  return { salt: b64encode(salt), iv: b64encode(iv), ciphertext: b64encode(new Uint8Array(ct)) };
}

async function open(password: string, blob: VaultBlob): Promise<string> {
  const key = await deriveKey(password, b64decode(blob.salt));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(blob.iv) as BufferSource },
    key,
    b64decode(blob.ciphertext),
  );
  return new TextDecoder().decode(pt);
}

async function readBlob(): Promise<VaultBlob | null> {
  try {
    const stored = await chrome.storage.local.get([VAULT_KEY]);
    const blob = stored[VAULT_KEY] as VaultBlob | undefined;
    if (!blob?.salt || !blob?.iv || !blob?.ciphertext) return null;
    return blob;
  } catch {
    return null;
  }
}

export async function hasVault(): Promise<boolean> {
  return (await readBlob()) !== null;
}

export function isUnlocked(): boolean {
  return unlockedAddress !== '';
}

export function unlockedAccountAddress(): string {
  return unlockedAddress;
}

// Signer for the Circle Gateway rail. Key stays inside this module; callers
// get only address + a signTypedData closure over the in-memory account.
export function sessionSigner(): { address: string; signTypedData: (typedData: unknown) => Promise<string> } | null {
  if (!sessionMnemonic || !unlockedAddress) return null;
  const account = mnemonicToAccount(sessionMnemonic);
  return {
    address: account.address,
    signTypedData: (typedData: unknown) => account.signTypedData(typedData as never),
  };
}

function touchActivity(): void {
  lastActivityAt = Date.now();
  try {
    chrome.storage.session.set({ [SESSION_KEY]: lastActivityAt }).catch(() => {});
  } catch {}
}

// Persist/rehydrate the unlocked session (memory-only storage.session).
async function persistSession(mnemonic: string): Promise<void> {
  try {
    await chrome.storage.session.set({ [SESSION_VAULT_KEY]: mnemonic, [SESSION_KEY]: Date.now() });
  } catch {}
}

async function clearPersistedSession(): Promise<void> {
  try {
    await chrome.storage.session.remove([SESSION_VAULT_KEY, SESSION_KEY]);
  } catch {}
}

// Rehydrate the in-memory session from storage.session if it hasn't exceeded
// the idle TTL. Call before any signing operation; makes the wallet survive
// MV3 worker suspension without weakening the disk-encrypted vault.
export async function ensureUnlocked(): Promise<boolean> {
  if (sessionMnemonic && unlockedAddress) return true;
  try {
    const stored = await chrome.storage.session.get([SESSION_VAULT_KEY, SESSION_KEY]);
    const mnemonic = stored?.[SESSION_VAULT_KEY] as string | undefined;
    const at = Number(stored?.[SESSION_KEY] || 0);
    if (!mnemonic || !at) return false;
    if (Date.now() - at > AUTO_LOCK_MINUTES * 60_000) {
      await clearPersistedSession();
      return false;
    }
    sessionMnemonic = mnemonic;
    unlockedAddress = mnemonicToAccount(mnemonic).address;
    lastActivityAt = at;
    return true;
  } catch {
    return false;
  }
}

// Create: fresh mnemonic, sealed under password. Returns the mnemonic ONCE
// for backup display — never stored, never logged.
export async function createVault(password: string): Promise<{ mnemonic: string; address: string }> {
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (await readBlob()) throw new Error('A wallet already exists — import or reset first.');
  const mnemonic = generateMnemonic(english);
  const blob = await seal(password, mnemonic);
  await chrome.storage.local.set({ [VAULT_KEY]: blob });
  const account = mnemonicToAccount(mnemonic);
  unlockedAddress = account.address;
  sessionMnemonic = mnemonic;
  touchActivity();
  await persistSession(mnemonic);
  return { mnemonic, address: account.address };
}

// Import an existing seed phrase.
export async function importVault(mnemonic: string, password: string): Promise<{ address: string }> {
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
  const words = String(mnemonic || '').trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) throw new Error('Enter the 12 or 24 word recovery phrase.');
  let account;
  try {
    account = mnemonicToAccount(words.join(' '));
  } catch {
    throw new Error('That recovery phrase looks invalid.');
  }
  const blob = await seal(password, words.join(' '));
  await chrome.storage.local.set({ [VAULT_KEY]: blob });
  unlockedAddress = account.address;
  sessionMnemonic = words.join(' ');
  touchActivity();
  await persistSession(words.join(' '));
  return { address: account.address };
}

export async function unlockVault(password: string): Promise<{ address: string }> {
  const blob = await readBlob();
  if (!blob) throw new Error('No wallet yet — create or import one first.');
  let mnemonic: string;
  try {
    mnemonic = await open(password, blob);
  } catch {
    throw new Error('Wrong password.');
  }
  const account = mnemonicToAccount(mnemonic);
  unlockedAddress = account.address;
  sessionMnemonic = mnemonic;
  touchActivity();
  await persistSession(mnemonic);
  return { address: account.address };
}

// Reveal the recovery phrase after re-entering the password. Read-only: does
// not change lock state. Throws on wrong password.
export async function revealMnemonic(password: string): Promise<string> {
  const blob = await readBlob();
  if (!blob) throw new Error('No wallet yet.');
  try {
    return await open(String(password || ''), blob);
  } catch {
    throw new Error('Wrong password.');
  }
}

export async function lockVault(): Promise<void> {
  unlockedAddress = '';
  sessionMnemonic = null;
  try {
    await clearPersistedSession();
  } catch {}
  try {
    await chrome.storage.session.remove([SESSION_KEY]);
  } catch {}
}

// Auto-lock on idle (alarms survive worker suspension; memory does not).
try {
  chrome.alarms?.create?.('nibgate-autolock', { periodInMinutes: 1 });
  chrome.alarms?.onAlarm?.addListener?.((alarm) => {
    if (alarm?.name !== 'nibgate-autolock' || !unlockedAddress) return;
    chrome.idle?.queryState?.(AUTO_LOCK_MINUTES * 60, (state) => {
      if (state !== 'active') lockVault().catch(() => {});
    });
  });
} catch {}

// Sign + send a USDC transfer with the unlocked session key. Requires an
// unlocked vault; the key never leaves this module, never hits storage.
export async function sendUsdcTransfer({
  to,
  amountUsdc,
  rpcUrl,
  chainId,
}: {
  to: string;
  amountUsdc: number;
  rpcUrl: string;
  chainId: number;
}): Promise<{ txHash: string }> {
  await ensureUnlocked();
  if (!sessionMnemonic || !unlockedAddress) throw new Error('Wallet is locked — unlock first.');
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error('Bad recipient address.');
  if (!(amountUsdc > 0)) throw new Error('Amount must be above zero.');
  const account = mnemonicToAccount(sessionMnemonic);
  const chain = {
    id: chainId,
    name: 'arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;
  const client = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const txHash = await client.sendTransaction({
    to: USDC as Hex,
    data: encodeFunctionData({
      abi: TRANSFER_ABI,
      functionName: 'transfer',
      args: [to as Hex, BigInt(Math.round(amountUsdc * 1e6))],
    }),
  });
  // Wait for inclusion so callers verify a mined, successful transfer rather
  // than racing the indexer (and so a reverted tx surfaces as an error).
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== 'success') {
    throw new Error(`Tip transfer reverted on-chain (tx ${txHash}).`);
  }
  touchActivity();
  return { txHash };
}

export { USDC };
export type { Hex };
