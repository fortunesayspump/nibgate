import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdingRpcUrls } from '../src/server/holding.js';

afterEach(() => vi.unstubAllEnvs());

describe('holding RPC routing', () => {
  it('keeps the configured provider primary and official same-chain fallback last', () => {
    expect(holdingRpcUrls('https://primary.example/rpc', 5042002, 'https://mirror.example/rpc')).toEqual([
      'https://primary.example/rpc',
      'https://mirror.example/rpc',
      'https://rpc.testnet.arc.io',
    ]);
    expect(holdingRpcUrls('https://primary.example/rpc', 5042, 'https://rpc.mainnet.arc.io')).toEqual([
      'https://primary.example/rpc',
      'https://rpc.mainnet.arc.io',
    ]);
  });

  it('uses deployment mirrors before the official endpoint and deduplicates them', () => {
    vi.stubEnv('NIBGATE_RPC_MIRRORS', 'https://mirror.example/rpc, https://rpc.testnet.arc.io');
    expect(holdingRpcUrls('https://primary.example/rpc', 5042002)).toEqual([
      'https://primary.example/rpc',
      'https://mirror.example/rpc',
      'https://rpc.testnet.arc.io',
    ]);
  });
});
