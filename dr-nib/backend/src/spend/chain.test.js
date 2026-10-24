import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../env.js', () => ({ config: { network: 'testnet' } }));

import { spendChain } from './chain.js';

afterEach(() => vi.unstubAllEnvs());

describe('Dr. Nib RPC routing', () => {
  it('keeps the configured provider primary and the official Arc endpoint last', () => {
    vi.stubEnv('ARC_RPC_URL', 'https://primary.example/rpc');
    vi.stubEnv('NIBGATE_RPC_MIRRORS', 'https://mirror.example/rpc');
    expect(spendChain('mainnet').rpcUrls).toEqual([
      'https://primary.example/rpc',
      'https://mirror.example/rpc',
      'https://rpc.mainnet.arc.io',
    ]);
  });

  it('deduplicates the official endpoint when it is already configured', () => {
    vi.stubEnv('ARC_RPC_URL', 'https://canteen.example/rpc');
    vi.stubEnv('ARC_RPC_FALLBACK_URLS', 'https://rpc.testnet.arc.io');
    expect(spendChain('testnet').rpcUrls).toEqual([
      'https://canteen.example/rpc',
      'https://rpc.testnet.arc.io',
    ]);
  });
});
