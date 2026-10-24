import { createHash } from 'node:crypto';
import { createPublicClient, fallback, hashMessage, http, recoverAddress } from 'viem';

const ERC1271_MAGIC_VALUE = '0x1626ba7e';
const ERC1271_ABI = [{
  type: 'function',
  name: 'isValidSignature',
  stateMutability: 'view',
  inputs: [
    { name: 'hash', type: 'bytes32' },
    { name: 'signature', type: 'bytes' },
  ],
  outputs: [{ name: '', type: 'bytes4' }],
}];

function cleanDomain(value = '') {
  try {
    const parsed = new URL(String(value).includes('://') ? String(value) : `https://${value}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  } catch { return ''; }
}

function cleanAddress(value = '') {
  const address = String(value).trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : '';
}

export function usdcUnits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const scaled = amount * 1e6;
  const units = Math.round(scaled);
  if (Math.abs(scaled - units) > 1e-6) return null;
  return Number.isSafeInteger(units) && units > 0 ? units : null;
}

export function refundAuthorizationMessage({ network, domain, payer, amount, expiresAt, nonce }) {
  const networkName = String(network || '').toLowerCase();
  const canon = cleanDomain(domain);
  const address = cleanAddress(payer);
  const units = usdcUnits(amount);
  const expires = Number(expiresAt);
  const cleanNonce = String(nonce || '').trim().toLowerCase();
  if (!['mainnet', 'testnet'].includes(networkName) || !canon || !address || !units
    || !Number.isSafeInteger(expires) || expires <= 0 || !/^[a-f0-9]{32,128}$/.test(cleanNonce)) {
    throw new Error('Invalid refund authorization fields.');
  }
  return [
    'Nibgate tip refund', `network:${networkName}`, `domain:${canon}`,
    `wallet:${address}`, `amount:${units}`, `expires:${expires}`, `nonce:${cleanNonce}`,
  ].join('\n');
}

export function validateRefundMessage({ message, network, domain, payer, amount, now = Date.now() }) {
  const raw = String(message || '');
  const rows = raw.split('\n');
  if (rows.length !== 7 || rows[0] !== 'Nibgate tip refund') return { valid: false, reason: 'invalid refund message format' };
  const values = Object.fromEntries(rows.slice(1).map((row) => {
    const separator = row.indexOf(':');
    return separator > 0 ? [row.slice(0, separator), row.slice(separator + 1)] : ['', ''];
  }));
  const expiresAt = Number(values.expires);
  let expected;
  try { expected = refundAuthorizationMessage({ network, domain, payer, amount, expiresAt, nonce: values.nonce }); }
  catch { return { valid: false, reason: 'invalid refund message fields' }; }
  if (raw !== expected) return { valid: false, reason: 'refund message binding mismatch' };
  if (expiresAt <= now) return { valid: false, reason: 'refund authorization expired' };
  if (expiresAt - now > 15 * 60_000) return { valid: false, reason: 'refund authorization expiry is too far in the future' };
  return { valid: true, digest: createHash('sha256').update(raw).digest('hex'), expiresAt, amountUnits: usdcUnits(amount) };
}

// 1.2.0 extension compatibility. Legacy signatures did not bind network or
// amount, so they are accepted only for a short window and can authorize only
// a full refund of the server-computed held balance. New clients must use the
// strict seven-line message above.
export function validateLegacyRefundMessage({ message, domain, payer, now = Date.now() }) {
  const raw = String(message || '');
  const rows = raw.split('\n');
  if (rows.length !== 4 || rows[0] !== 'Nibgate tip refund') {
    return { valid: false, reason: 'invalid legacy refund message format' };
  }
  const canon = cleanDomain(domain);
  const address = cleanAddress(payer);
  if (!canon || !address || rows[1] !== `Domain: ${canon}` || rows[2] !== `Wallet: ${address}` || !rows[3].startsWith('Issued: ')) {
    return { valid: false, reason: 'legacy refund message binding mismatch' };
  }
  const issuedAt = Date.parse(rows[3].slice('Issued: '.length));
  if (!Number.isFinite(issuedAt)) return { valid: false, reason: 'invalid legacy refund issue time' };
  if (issuedAt > now + 60_000) return { valid: false, reason: 'legacy refund issue time is in the future' };
  const expiresAt = issuedAt + 15 * 60_000;
  if (expiresAt <= now) return { valid: false, reason: 'legacy refund authorization expired' };
  return {
    valid: true,
    legacy: true,
    digest: createHash('sha256').update(raw).digest('hex'),
    expiresAt,
    amountUnits: null,
  };
}

export async function verifyWalletControl({ address, message, signature, rpcUrl, rpcMirrors, chain, publicClientFactory = createPublicClient }) {
  const expected = String(address || '').toLowerCase();
  const hash = hashMessage(message);
  try {
    const recovered = await recoverAddress({ hash, signature });
    if (recovered.toLowerCase() === expected) return true;
  } catch {
    // Contract-wallet signatures are not recoverable as an EOA.
  }

  try {
    const configured = rpcMirrors ?? process.env.NIBGATE_RPC_MIRRORS ?? process.env.ARC_RPC_FALLBACK_URLS ?? '';
    const mirrors = Array.isArray(configured) ? configured : String(configured).split(',');
    const urls = [...new Set([rpcUrl, ...mirrors.map((url) => String(url).trim()).filter(Boolean), chain.rpcUrl].filter(Boolean))];
    const client = publicClientFactory({
      chain: {
        id: chain.chainId,
        name: chain.label || chain.name,
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: { default: { http: urls } },
      },
      transport: fallback(urls.map((url) => http(url, { timeout: 5_000, retryCount: 0 })), { rank: false }),
    });
    const rpcChainId = await client.getChainId();
    if (Number(rpcChainId) !== Number(chain.chainId)) return false;
    const code = await client.getBytecode({ address });
    if (!code || code === '0x') return false;
    const result = await client.readContract({
      address,
      abi: ERC1271_ABI,
      functionName: 'isValidSignature',
      args: [hash, signature],
    });
    return String(result).toLowerCase() === ERC1271_MAGIC_VALUE;
  } catch {
    return false;
  }
}
