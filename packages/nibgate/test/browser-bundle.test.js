import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));

// Exercise the actual published script build, not an ESM import of source.
beforeAll(() => {
  execFileSync(process.execPath, ['scripts/bundle.mjs'], { cwd: packageRoot });
}, 30_000);

describe('standalone browser bundles', () => {
  for (const filename of ['nibgate.js', 'nibgate.min.js']) {
    it(`${filename} initializes and creates a Gateway payment proof without Node globals or network`, async () => {
      const fetch = vi.fn(() => { throw new Error('Unexpected network request'); });
      const context = createContext({
        console, crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams,
        atob, btoa, fetch,
        setTimeout, clearTimeout,
        // Initialization does not need DOM APIs. Keep window equal to globalThis
        // just as it is for a classic script in a browser.
      });
      runInContext('window = globalThis', context);
      expect(runInContext('typeof require', context)).toBe('undefined');
      expect(runInContext('typeof process', context)).toBe('undefined');
      expect(runInContext('typeof Buffer', context)).toBe('undefined');
      const script = readFileSync(new URL(`../dist/${filename}`, import.meta.url), 'utf8');
      runInContext(script, context, { filename });
      expect(typeof context.Nibgate.createNibgate).toBe('function');
      expect(typeof context.Nibgate.tipContent).toBe('function');

      const address = '0x1111111111111111111111111111111111111111';
      const signTypedData = vi.fn(async () => `0x${'11'.repeat(65)}`);
      const adapter = await context.Nibgate.createCircleGatewayBrowserAdapter({
        signer: { address, signTypedData },
      });
      expect(adapter.network).toBe('eip155:5042002');
      const result = await adapter.pay({ challenge: {
        x402Version: 2,
        resource: { url: 'https://example.test/article' },
        accepts: [{
          scheme: 'exact', network: 'eip155:5042002', amount: '10000',
          asset: '0x3600000000000000000000000000000000000000',
          payTo: '0x2222222222222222222222222222222222222222',
          maxTimeoutSeconds: 300,
          extra: {
            name: 'GatewayWalletBatched', version: '1',
            verifyingContract: '0x3333333333333333333333333333333333333333',
          },
        }],
      } });
      const proof = JSON.parse(atob(result.paymentSignature));
      expect(proof.x402Version).toBe(2);
      expect(proof.accepted.network).toBe('eip155:5042002');
      expect(result.metadata.payer).toBe(address);
      expect(signTypedData).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    });
  }
});
