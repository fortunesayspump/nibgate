// Full non-Nibgate creator flow E2E, both rails:
//   extension tips a random site (unresolved) → funds the domain holding box
//   → owner verifies the site → claims → keeper release pays creator net +
//   treasury cut. Direct rail lands onchain immediately; gateway rail credits
//   the box's Gateway ledger and the box's ERC-1271 self-withdrawal
//   materializes it at claim (Circle batch settlement is async, so a claim
//   still settling returns 202 pending-settlement).
//
// Guarded: needs E2E_FUNDED=1, the local hub on :3005, keeper funds, docker DB.
import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createPublicClient, createWalletClient, http as viemHttp, parseAbi, getContractAddress, keccak256, toHex } from 'viem';
import { privateKeyToAccount, generatePrivateKey, mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import { bytesToHex } from 'viem';
import { depositToGateway, getGatewayBalances } from '../../packages/nibgate/src/server/gateway.js';
import { gatewayBalanceFor } from '../../packages/nibgate/src/server/fee-wallet.js';

const EXT_PATH = path.resolve('extension/dist');
const HUB = process.env.E2E_HUB_API || 'http://localhost:3005';
const RPC = 'https://rpc.testnet.arc.io';
const CHAIN_ID = 5042002;
const USDC = '0x3600000000000000000000000000000000000000';
const TREASURY = '0x558e7BFaF2Cf1A494F44E50D92431Afc060c9D12';
const FACTORY = '0xe6bdDa4aDE140d93F5116d3ce5516D1eE26934B0';
const INIT_CODE_HASH = '0x83902979ef3b0f085d1c9a6930d7fecbf01c74df7a5969d467a73581ff82d9fc';
const TIP = 0.01;
const TIP_WEI = 10000n;

const ERC20 = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

function envValue(content: string, key: string): string {
  const line = content.split(/\r?\n/).find((l) => l.trim().startsWith(key + '='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

function lanIp(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) if (info.family === 'IPv4' && !info.internal && info.address.startsWith('192.168.')) return info.address;
  }
  return '127.0.0.1';
}

const ARTICLE = `<!doctype html><html><head><title>Random Blog Post</title></head><body><main><article>
<h1>Random Blog Post</h1>
<p>${'An ordinary site with no Nibgate SDK, no wallet, nothing. '.repeat(40)}</p>
</article></main></body></html>`;

async function hubUp(): Promise<boolean> {
  try {
    return (await fetch(`${HUB}/api/hub/stats`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function runFlow(rail: 'transfer' | 'gateway') {
  const env = await readFile(path.resolve('backend/.env'), 'utf8');
  const keeperKey = envValue(env, 'NIBGATE_KEEPER_PRIVATE_KEY') as `0x${string}`;
  const keeper = privateKeyToAccount(keeperKey);
  const chain = { id: CHAIN_ID, name: 'arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
  const pub = createPublicClient({ chain, transport: viemHttp(RPC) });
  const keeperWallet = createWalletClient({ account: keeper, chain, transport: viemHttp(RPC) });

  const owner = privateKeyToAccount(generatePrivateKey());
  // Fresh payer each run: Circle Gateway rejects well-known public addresses.
  const mnemonic = generateMnemonic(english);

  // Local random site.
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(ARTICLE); });
  await new Promise<void>((r) => server.listen(0, '0.0.0.0', r));
  const port = (server.address() as { port: number }).port;
  const host = lanIp();
  // The hub canonicalizes domains (host only, no port); match that key.
  const domain = host;
  const pageUrl = `http://${host}:${port}/post`;
  const box = getContractAddress({ opcode: 'CREATE2', from: FACTORY, salt: keccak256(toHex(domain)), bytecodeHash: INIT_CODE_HASH });
  // Start unresolved: clear any prior verification for this domain.
  execFileSync('node', ['e2e/reset-domain.mjs', domain], { cwd: path.resolve('.'), env: { ...process.env } });

  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-flow-')), {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) { await new Promise((r) => setTimeout(r, 500)); sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')); }
    const id = new URL(sw!.url()).hostname;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const imported = await popup.evaluate(
      ([mnemonic, password]) => new Promise<{ ok: boolean; address?: string; error?: string }>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_IMPORT', mnemonic, password }, resolve);
      }),
      [mnemonic, 'e2e-flow-password'] as const,
    );
    expect(imported.ok, imported.error).toBeTruthy();
    const embedded = imported.address as `0x${string}`;
    const embeddedKey = bytesToHex(mnemonicToAccount(mnemonic).getHdKey().privateKey!);

    await popup.evaluate(
      ([addr, hub, r]) => new Promise<void>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.storage.local.set({ nibgateCustomHubApi: hub, nibgateNetwork: 'testnet', nibgateWatchAddress: addr, nibgateRail: r }, () => resolve());
      }),
      [embedded, HUB, rail] as const,
    );

    // Fund the fresh payer onchain: direct tips pay from it; gateway tips
    // need onchain funds to deposit into Circle Gateway first.
    await pub.waitForTransactionReceipt({ hash: await keeperWallet.writeContract({ address: USDC, abi: ERC20, functionName: 'transfer', args: [embedded, rail === 'gateway' ? 40000n : 20000n] }) });
    if (rail === 'gateway') {
      // Reuse an existing Gateway balance when present (the public test
      // mnemonic address is swept, so don't depend on fresh onchain funds).
      const gwBal = await getGatewayBalances({ buyerPrivateKey: embeddedKey, buyerChain: 'arcTestnet' });
      const avail = Number((gwBal as { gateway?: { available?: string | number } })?.gateway?.available || 0) / 1e6;
      if (avail < TIP) {
        const dep = await depositToGateway('0.02', { buyerPrivateKey: embeddedKey, buyerChain: 'arcTestnet', buyerRpcUrl: RPC });
        expect(dep.ok, JSON.stringify(dep, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBeTruthy();
      }
    }
    // Re-unlock: the MV3 worker may have been suspended while funding.
    const unlocked = await popup.evaluate(
      (pw) => new Promise<{ ok: boolean }>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_UNLOCK', password: pw }, resolve);
      }),
      'e2e-flow-password',
    );
    expect(unlocked.ok).toBeTruthy();

    // Tip the random site via the extension (custom amount, review-confirm).
    const boxBefore = await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [box] });
    const page = await context.newPage();
    page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(String(TIP)) : d.accept()));
    await page.goto(pageUrl);
    const card = page.locator('#nibgate-card');
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await card.locator('[data-tip="custom"]').click();
    await expect(card.locator('[data-tip-status]')).toContainText('Held for the creator', { timeout: 180000 });
    // Creator "waiting" indicator shows the held count/total.
    await expect(card.locator('[data-tip-status]')).toContainText('waiting', { timeout: 10000 });

    // Box is funded + a held row exists.
    const heldRes = await fetch(`${HUB}/api/hub/tips/held?domain=${encodeURIComponent(domain)}`);
    const held = await heldRes.json();
    expect(held.tips.length, JSON.stringify(held)).toBeGreaterThan(0);
    expect(held.tips[0].payeeWallet.toLowerCase()).toBe(box.toLowerCase());
    if (rail === 'transfer') {
      // Direct rail lands onchain immediately.
      await expect.poll(async () => Number(await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [box] })), { timeout: 60000 }).toBe(Number(boxBefore) + Number(TIP_WEI));
    } else {
      // Gateway rail: the credit must land in the box's Gateway ledger
      // (available + pending batch before Circle settles onchain).
      await expect
        .poll(async () => {
          const b = await gatewayBalanceFor(box, { domain: 26 }).catch(() => null);
          return Number(b?.available || 0) + Number(b?.pending || 0);
        }, { timeout: 60000 })
        .toBeGreaterThanOrEqual(Number(TIP_WEI));
    }

    // Owner verifies (owner-link), then claims.
    const verified = JSON.parse(
      execFileSync('node', ['e2e/verify-owner.mjs', domain, owner.address], {
        cwd: path.resolve('.'),
        env: { ...process.env },
      }).toString(),
    );
    const ownerBefore = await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [owner.address] });
    const treasuryBefore = await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [TREASURY] });
    // Circle batches settle asynchronously; retry the claim until the box's
    // credit is withdrawable, then release.
    let claimed: { releaseTx?: string; status?: string } = {};
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${HUB}/api/hub/tips/claim`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: verified.siteId, token: verified.token }),
      });
      claimed = await res.json();
      if (claimed.releaseTx || res.status !== 202) break;
      await new Promise((r) => setTimeout(r, 20000));
    }
    if (claimed.releaseTx) {
      await pub.waitForTransactionReceipt({ hash: claimed.releaseTx });
      const net = (await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [owner.address] })) - ownerBefore;
      const fee = (await pub.readContract({ address: USDC, abi: ERC20, functionName: 'balanceOf', args: [TREASURY] })) - treasuryBefore;
      const gross = Number(net) + Number(fee);
      expect(gross).toBeGreaterThan(0);
      expect(Number(fee)).toBe(Math.floor((gross * 500) / 10000));
    } else if (rail === 'gateway') {
      // External Circle batch still settling after the budget: the hold and
      // ledger credit are proven above; release is validated when it settles.
      expect(claimed.status, JSON.stringify(claimed)).toBe('pending-settlement');
    } else {
      expect(claimed.releaseTx, JSON.stringify(claimed)).toBeTruthy();
    }

    // Domain now resolves to the owner.
    const resolved = await (await fetch(`${HUB}/api/hub/resolve?url=${encodeURIComponent(`http://${domain}/anything`)}`)).json();
    expect(resolved.wallet?.toLowerCase()).toBe(owner.address.toLowerCase());
  } finally {
    await context.close();
    server.close();
  }
}

test('non-Nibgate flow: direct rail funds the box, owner claims', async () => {
  test.skip(process.env.E2E_FUNDED !== '1', 'set E2E_FUNDED=1 to run');
  test.setTimeout(900000);
  test.skip(!(await hubUp()), `hub not reachable at ${HUB}`);
  await runFlow('transfer');
});

test('non-Nibgate flow: gateway rail credits the box, owner claims', async () => {
  test.skip(process.env.E2E_FUNDED !== '1', 'set E2E_FUNDED=1 to run');
  test.setTimeout(900000);
  test.skip(!(await hubUp()), `hub not reachable at ${HUB}`);
  await runFlow('gateway');
});
