import { createSiweMessage, generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { createPublicClient, hashMessage, http, recoverAddress } from 'viem';
import { activeChain } from './chain.js';

export const SIGN_IN_STATEMENT = 'Sign in to Nibgate to verify your wallet.';

export function createSignInNonce() {
  return generateSiweNonce();
}

export function createSignInMessage({ address, chainId = activeChain().id, nonce, domain, uri, issuedAt = new Date(), expirationTime }) {
  return createSiweMessage({
    address,
    chainId,
    domain,
    nonce,
    uri,
    version: '1',
    statement: SIGN_IN_STATEMENT,
    issuedAt,
    expirationTime,
  });
}

export function parseSignInMessage(message) {
  return parseSiweMessage(message);
}

export function validateSignInMessage({ message, expected = {} }) {
  const parsed = typeof message === 'string' ? parseSiweMessage(message) : message;
  if (!parsed) return false;

  const { address, chainId, domain, nonce, scheme, time } = expected;
  const valid = validateSiweMessage({
    message: parsed,
    address,
    domain,
    nonce,
    scheme,
    time,
  });
  if (!valid) return false;
  if (chainId !== undefined && parsed.chainId !== chainId) return false;
  return true;
}

const ERC1271_MAGICVALUE = '0x1626ba7e';
const ERC1271_ABI = [
  {
    type: 'function',
    name: 'isValidSignature',
    stateMutability: 'view',
    inputs: [
      { name: 'hash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes4' }],
  },
];

export async function verifySignature({ message, signature, address, rpcUrl, chain = activeChain() }) {
  const hash = hashMessage(message);
  const recoveredAddress = await recoverAddress({ hash, signature });
  if (recoveredAddress.toLowerCase() === address.toLowerCase()) return true;
  // Smart-contract wallets (Safe, Coinbase Smart Wallet, …) can't be
  // recovered — fall back to EIP-1271. Reads only; fails closed.
  try {
    const client = createPublicClient({
      chain: {
        id: chain.id,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: { default: { http: [rpcUrl || chain.rpcUrl] } },
      },
      transport: http(rpcUrl || chain.rpcUrl),
    });
    const code = await client.getBytecode({ address });
    if (!code || code === '0x') return false;
    const result = await client.readContract({
      address,
      abi: ERC1271_ABI,
      functionName: 'isValidSignature',
      args: [hash, signature],
    });
    return String(result).toLowerCase() === ERC1271_MAGICVALUE;
  } catch {
    return false;
  }
}
