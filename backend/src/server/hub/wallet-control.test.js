import { describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { refundAuthorizationMessage, validateLegacyRefundMessage, validateRefundMessage, verifyWalletControl } from './wallet-control.js';

const payer = '0x00000000000000000000000000000000000000a1';
const domain = 'creator.example';
const expiresAt = Date.parse('2026-10-24T02:10:00.000Z');
const amount = 2.5;
const message = refundAuthorizationMessage({ network: 'testnet', domain, payer, amount, expiresAt, nonce: 'ab'.repeat(16) });

describe('refund wallet control', () => {
  it('binds a short-lived refund authorization to the exact domain and payer', () => {
    const now = Date.parse('2026-10-24T02:05:00.000Z');
    const input = { message, network: 'testnet', domain, payer, amount, now };
    expect(validateRefundMessage(input)).toMatchObject({ valid: true, amountUnits: 2_500_000 });
    expect(validateRefundMessage({ ...input, network: 'mainnet' }).valid).toBe(false);
    expect(validateRefundMessage({ ...input, domain: 'attacker.example' }).valid).toBe(false);
    expect(validateRefundMessage({ ...input, payer: '0x00000000000000000000000000000000000000b2' }).valid).toBe(false);
    expect(validateRefundMessage({ ...input, amount: 2.4 }).valid).toBe(false);
    expect(validateRefundMessage({ ...input, now: expiresAt + 1 }).valid).toBe(false);
  });

  it('accepts the exact 1.2.0 shape only while fresh', () => {
    const now = Date.parse('2026-10-24T02:00:00.000Z');
    const legacy = `Nibgate tip refund\nDomain: creator.example\nWallet: ${payer}\nIssued: 2026-10-24T01:50:00.000Z`;
    expect(validateLegacyRefundMessage({ message: legacy, domain, payer, now }))
      .toMatchObject({ valid: true, legacy: true, amountUnits: null });
    expect(validateLegacyRefundMessage({ message: legacy, domain: 'other.example', payer, now }).valid).toBe(false);
    expect(validateLegacyRefundMessage({ message: legacy, domain, payer, now: now + 6 * 60_000 }).valid).toBe(false);
  });

  it('rejects future and malformed 1.2.0 messages', () => {
    const now = Date.parse('2026-10-24T02:00:00.000Z');
    const future = `Nibgate tip refund\nDomain: creator.example\nWallet: ${payer}\nIssued: 2026-10-24T02:02:00.000Z`;
    expect(validateLegacyRefundMessage({ message: future, domain, payer, now }).valid).toBe(false);
    expect(validateLegacyRefundMessage({ message: 'Nibgate tip refund', domain, payer, now }).valid).toBe(false);
  });

  it('accepts an ordinary EOA signature without an RPC read', async () => {
    const account = privateKeyToAccount('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    const signature = await account.signMessage({ message });
    const publicClientFactory = vi.fn();
    await expect(verifyWalletControl({
      address: account.address, message, signature, rpcUrl: 'https://rpc.invalid',
      chain: { chainId: 5042, name: 'test' }, publicClientFactory,
    })).resolves.toBe(true);
    expect(publicClientFactory).not.toHaveBeenCalled();
  });

  it('falls back to ERC-1271 for a deployed smart-contract wallet', async () => {
    const readContract = vi.fn().mockResolvedValue('0x1626ba7e');
    const getBytecode = vi.fn().mockResolvedValue('0x6000');
    const getChainId = vi.fn().mockResolvedValue(5042);
    await expect(verifyWalletControl({
      address: payer, message, signature: '0x1234', rpcUrl: 'https://rpc.invalid',
      chain: { chainId: 5042, name: 'test' }, publicClientFactory: () => ({ getChainId, getBytecode, readContract }),
    })).resolves.toBe(true);
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: payer, functionName: 'isValidSignature', args: [expect.stringMatching(/^0x[\da-f]{64}$/), '0x1234'],
    }));
  });

  it('fails closed for code-less addresses and bad ERC-1271 results', async () => {
    const base = { address: payer, message, signature: '0x1234', rpcUrl: 'https://rpc.invalid', chain: { chainId: 5042, name: 'test' } };
    const getChainId = async () => 5042;
    await expect(verifyWalletControl({ ...base, publicClientFactory: () => ({ getChainId, getBytecode: async () => '0x', readContract: vi.fn() }) })).resolves.toBe(false);
    await expect(verifyWalletControl({ ...base, publicClientFactory: () => ({ getChainId, getBytecode: async () => '0x6000', readContract: async () => '0xffffffff' }) })).resolves.toBe(false);
    await expect(verifyWalletControl({ ...base, publicClientFactory: () => ({ getChainId: async () => 5042002, getBytecode: async () => '0x6000', readContract: async () => '0x1626ba7e' }) })).resolves.toBe(false);
  });
});
