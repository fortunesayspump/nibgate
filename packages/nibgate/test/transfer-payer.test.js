import { beforeEach, describe, expect, it, vi } from 'vitest';
const receipt = vi.hoisted(() => ({ value: null }));
vi.mock('viem', async (original) => ({ ...await original(), createPublicClient: () => ({ waitForTransactionReceipt: vi.fn(async () => receipt.value) }) }));
import { createTransferVerifier, ARC_USDC } from '../src/server/fee-wallet.js';
const owner = '0x0000000000000000000000000000000000000001';
const relayer = '0x0000000000000000000000000000000000000009';
const recipient = '0x0000000000000000000000000000000000000002';
const topic = (address) => `0x${address.slice(2).padStart(64, '0')}`;
beforeEach(() => { receipt.value = { status: 'success', from: relayer, logs: [{ address: ARC_USDC, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', topic(owner), topic(recipient)], data: '0x0f4240' }] }; });
describe('verified transfer owner attribution', () => {
  it('exposes token owner separately from transaction relayer', async () => {
    const payment = { recipient, amount: 1 };
    const verify = createTransferVerifier({ receiptConfirmations: 1 });
    expect(await verify({ resource: {}, txHash: '0xtx', payment })).toBe(true);
    expect(payment.transferPayer).toBe(owner);
    expect(payment.payer).toBe(relayer);
  });
  it('does not invent an owner from a missing transfer topic', async () => {
    receipt.value.logs[0].topics[1] = undefined;
    const payment = { recipient, amount: 1 };
    await createTransferVerifier({ receiptConfirmations: 1 })({ resource: {}, txHash: '0xtx', payment });
    expect(payment.transferPayer).toBeUndefined();
  });
});
