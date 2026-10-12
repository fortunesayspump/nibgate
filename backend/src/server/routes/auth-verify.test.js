import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const dbMock = vi.hoisted(() => ({
  wallet: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
  session: { create: vi.fn() },
}));

vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));

const { verifySignInAndLogin } = await import('@nibgate/internal/auth.js');
const { createSignInMessage } = await import('@nibgate/wallet/siwe.js');
const { activeChainId } = await import('@nibgate/wallet/chain.js');

const KEY = generatePrivateKey();
const account = privateKeyToAccount(KEY);
const CHAIN = activeChainId();
const DOMAIN = 'nibgate.xyz';

function signedMessage({ expirationTime, domain = DOMAIN, nonce = 'test-nonce-123' } = {}) {
  const message = createSignInMessage({
    address: account.address,
    chainId: CHAIN,
    nonce,
    domain,
    uri: `https://${domain}`,
    expirationTime,
  });
  return account.signMessage({ message }).then((signature) => ({ message, signature }));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.wallet.findUnique.mockResolvedValue(null);
  dbMock.user.findUnique.mockResolvedValue(null);
  dbMock.user.create.mockResolvedValue({ id: 'u1', walletAddress: account.address.toLowerCase() });
  dbMock.session.create.mockResolvedValue({});
});

describe('verifySignInAndLogin clock handling', () => {
  it('accepts a fresh message', async () => {
    const { message, signature } = await signedMessage({ expirationTime: new Date(Date.now() + 30 * 60 * 1000) });
    const out = await verifySignInAndLogin({ message, signature, expectedNonce: 'test-nonce-123', expectedDomain: DOMAIN });
    expect(out.user.id).toBe('u1');
    expect(dbMock.session.create).toHaveBeenCalledTimes(1);
  });

  it('names the device clock on a long-expired message', async () => {
    const { message, signature } = await signedMessage({ expirationTime: new Date(Date.now() - 15 * 60 * 1000) });
    await expect(verifySignInAndLogin({ message, signature, expectedNonce: 'test-nonce-123', expectedDomain: DOMAIN }))
      .rejects.toThrow(/automatic date & time/);
    expect(dbMock.session.create).not.toHaveBeenCalled();
  });

  it('tolerates a few minutes of clock skew inside the grace window', async () => {
    const { message, signature } = await signedMessage({ expirationTime: new Date(Date.now() - 3 * 60 * 1000) });
    const out = await verifySignInAndLogin({ message, signature, expectedNonce: 'test-nonce-123', expectedDomain: DOMAIN });
    expect(out.user.id).toBe('u1');
  });

  it('keeps domain mismatches on the generic error, not the clock one', async () => {
    const { message, signature } = await signedMessage({ expirationTime: new Date(Date.now() + 30 * 60 * 1000), domain: 'evil.example' });
    await expect(verifySignInAndLogin({ message, signature, expectedNonce: 'test-nonce-123', expectedDomain: DOMAIN }))
      .rejects.toThrow(/invalid or expired/);
  });

  it('still rejects a wrong nonce first', async () => {
    const { message, signature } = await signedMessage({ expirationTime: new Date(Date.now() + 30 * 60 * 1000), nonce: 'other' });
    await expect(verifySignInAndLogin({ message, signature, expectedNonce: 'test-nonce-123', expectedDomain: DOMAIN }))
      .rejects.toThrow(/Nonce does not match/);
  });
});
