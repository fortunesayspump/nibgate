import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The network policy is enforced at import of env.js, so it must be tested by
// actually importing it in a child process — the same way a boot would.
const cwd = path.resolve(import.meta.dirname, '..');

function bootEnv(extra) {
  return {
    ...process.env,
    VITEST: '1', // skip local .env loading, keep the child hermetic
    HUB_DATABASE_URL: 'postgresql://localhost/x',
    DRNIB_DATABASE_URL: 'postgresql://localhost/x?schema=drnib_test',
    ...extra,
  };
}

function importEnv(extra) {
  return execFileSync(process.execPath, ['-e', "import('./src/env.js').then(() => console.log('UP'))"], {
    cwd,
    env: bootEnv(extra),
    encoding: 'utf8',
  });
}

describe('mainnet-only guard', () => {
  it('refuses to boot mainnet-only against a testnet hub', () => {
    expect(() => importEnv({ DRNIB_MAINNET_ONLY: '1', HUB_API_URL: 'https://testnet-api.nibgate.xyz' })).toThrow();
  });

  it('boots mainnet-only against the mainnet hub', () => {
    expect(importEnv({ DRNIB_MAINNET_ONLY: '1', HUB_API_URL: 'https://api.nibgate.xyz' })).toContain('UP');
  });

  it('leaves a testnet deployment alone when the flag is unset', () => {
    expect(importEnv({ HUB_API_URL: 'https://testnet-api.nibgate.xyz' })).toContain('UP');
  });

  it('honours an explicit DRNIB_NETWORK over URL inference', () => {
    expect(() => importEnv({ DRNIB_MAINNET_ONLY: '1', DRNIB_NETWORK: 'testnet', HUB_API_URL: 'https://api.nibgate.xyz' })).toThrow();
  });
});
