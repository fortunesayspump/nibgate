import { createSiweMessage, generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { hashMessage, recoverAddress } from 'viem';
import { ARC_TESTNET } from './chain.js';

export const SIGN_IN_STATEMENT = 'Sign in to Nibgate to verify your wallet.';

export function createSignInNonce() {
  return generateSiweNonce();
}

export function createSignInMessage({ address, chainId = ARC_TESTNET.id, nonce, domain, uri, issuedAt = new Date(), expirationTime }) {
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

export async function verifySignature({ message, signature, address }) {
  const hash = hashMessage(message);
  const recoveredAddress = await recoverAddress({ hash, signature });
  return recoveredAddress.toLowerCase() === address.toLowerCase();
}
