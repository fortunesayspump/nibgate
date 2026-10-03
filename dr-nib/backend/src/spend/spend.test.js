import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../llm/provider.js', () => ({
  isLlmConfigured: () => true,
  chatJson: vi.fn(),
}));

import { checkAmount, isSpendConfigured, MAX_TIP_USD } from './policy.js';
import { agentAddress } from './wallet.js';
import { previewPrice } from './unlocks.js';
import { generateDirectData } from '../llm/generate.js';
import { chatJson } from '../llm/provider.js';

const TEST_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('spend policy', () => {
  it('is off without an agent key', () => {
    expect(isSpendConfigured()).toBe(false);
  });

  it('caps each kind independently', () => {
    expect(checkAmount('tip', 0.5).ok).toBe(true);
    expect(checkAmount('tip', MAX_TIP_USD + 1).ok).toBe(false);
    expect(checkAmount('unlock', 0.01).ok).toBe(true);
    expect(checkAmount('tip', -1).ok).toBe(false);
    expect(checkAmount('tip', NaN).ok).toBe(false);
  });

  it('derives the agent address offline from a test key', () => {
    vi.stubEnv('DRNIB_AGENT_PRIVATE_KEY', TEST_KEY);
    expect(agentAddress()).toBe('0xFCAd0B19bB29D4674531d6f115237E16AfCE377c');
    expect(isSpendConfigured()).toBe(true);
  });
});

describe('402 price preview', () => {
  const mockRes = (status, { header = null, body = '' } = {}) => ({
    status,
    headers: { get: (k) => (k === 'payment-required' ? header : null) },
    text: async () => body,
  });

  it('reads free (non-402) as zero', async () => {
    expect(await previewPrice('https://x.example/free', async () => mockRes(200))).toEqual({ price: 0, free: true });
  });

  it('reads base-unit amounts off a JSON challenge', async () => {
    const body = JSON.stringify({ accepts: [{ maxAmountRequired: '25000', asset: 'USDC' }] });
    const out = await previewPrice('https://x.example/paid', async () => mockRes(402, { body }));
    expect(out.price).toBeCloseTo(0.025, 6);
    expect(out.free).toBe(false);
  });

  it('refuses a 402 with no readable price', async () => {
    const out = await previewPrice('https://x.example/paid', async () => mockRes(402, { body: '{"nope":true}' }));
    expect(out.unknown).toBe(true);
  });
});

describe('direct-data spend proposals', () => {
  it('validates tip/unlock/pay shapes and rejects the rest', async () => {
    vi.mocked(chatJson).mockResolvedValue({
      data: {
        calls: [
          { tool: 'tip_creator', input: { contentUrl: 'https://x.example/a', amount: 0.25 }, why: 'decisive source' },
          { tool: 'unlock_content', input: { url: 'https://x.example/gated' }, why: 'body needed' },
          { tool: 'pay_x402', input: { url: 'https://api.example/data' }, why: 'dataset' },
        ],
      },
      usage: null,
      model: 'test',
    });
    const out = await generateDirectData({
      brief: { topic: 't' },
      queries: ['q'],
      tools: ['http_request', 'tip_creator', 'unlock_content', 'pay_x402'],
    });
    expect(out.source).toBe('llm');
    expect(out.calls.map((c) => c.tool)).toEqual(['tip_creator', 'unlock_content', 'pay_x402']);
  });

  it('drops off-spec spend calls to the bank (empty)', async () => {
    vi.mocked(chatJson).mockResolvedValue({ data: { calls: [{ tool: 'tip_creator', input: { amount: 'lots' }, why: 'x' }] }, usage: null, model: 'test' });
    const out = await generateDirectData({ brief: {}, queries: [], tools: ['tip_creator'] });
    expect(out.calls).toEqual([]);
    expect(out.source).toBe('fallback');
  });
});
