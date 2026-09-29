// Funded E2E on REAL external blogs: import + fund a wallet, navigate to random
// third-party content pages, click the injected tip UI, and assert the payment
// is HELD for the (unknown) creator. No claim here — that is covered by
// extension-tip-flow.spec.ts against a local fixture.
//
// Guarded: needs E2E_FUNDED=1, the local hub on :3005 (testnet), keeper funds,
// docker DB. Never enable against mainnet.
import { test, expect, chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http as viemHttp, parseAbi } from 'viem';
import { privateKeyToAccount, mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import { collectRandomUrls } from '../random-blogs.mjs';

const EXT_PATH = path.resolve('extension/dist');
const HUB = process.env.E2E_HUB_API || 'http://localhost:3005';
const RPC = process.env.E2E_RPC_URL || 'https://rpc.testnet.arc.io';
const CHAIN_ID = 5042002;
const USDC = '0x3600000000000000000000000000000000000000' as const;
const TIP = '0.01';
const TIP_FUND = 50000n; // 0.05 USDC (6dp) covers a few small tips
const COUNT = Math.max(1, Math.min(5, Number(process.env.RANDOM_TIP_COUNT || 2)));

const ERC20 = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

function envValue(content: string, key: string): string {
  const line = content.split(/\r?\n/).find((l) => l.trim().startsWith(key + '='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

async function hubUp(): Promise<boolean> {
  try {
    return (await fetch(`${HUB}/api/hub/stats`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function findArticleLinks(page: import('@playwright/test').Page, max = 4): Promise<string[]> {
  return page.evaluate((limit) => {
    const origin = location.origin;
    const bad = /(tag|category|author|page|about|contact|archive|feed|rss|login|signin|subscribe|privacy|terms|search|comment|share|donate|shop|cart|index|tos)/i;
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({ a, url: (a as HTMLAnchorElement).href }))
      .filter(({ url }) => {
        try {
          const u = new URL(url);
          return u.origin === origin && !bad.test(u.pathname) && u.pathname.replace(/\/$/, '').split('/').filter(Boolean).length >= 1;
        } catch {
          return false;
        }
      });
    const inArticle = anchors.filter(({ a }) => a.closest('article,main,.post,.entry-content,.post-content,.entry'));
    const pool = (inArticle.length ? inArticle : anchors)
      .map(({ a, url }) => {
        const seg = new URL(url).pathname.replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
        const slug = seg.length >= 8 && /[-_]/.test(seg) ? 2 : seg.length >= 6 ? 1 : 0;
        return { url, slug, text: (a.textContent || '').trim().length };
      })
      .sort((x, y) => y.slug - x.slug || y.text - x.text);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of pool) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      out.push(p.url);
      if (out.length >= limit) break;
    }
    return out;
  }, max);
}

test('funded random external: click tip → held for the creator', async () => {
  test.skip(process.env.E2E_FUNDED !== '1', 'set E2E_FUNDED=1 to run');
  test.setTimeout(COUNT * 300000 + 120000);
  test.skip(!(await hubUp()), `hub not reachable at ${HUB}`);

  const env = await readFile(path.resolve('backend/.env'), 'utf8');
  const keeperKey = envValue(env, 'NIBGATE_KEEPER_PRIVATE_KEY') as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(keeperKey)) test.skip(true, 'NIBGATE_KEEPER_PRIVATE_KEY missing');
  const keeper = privateKeyToAccount(keeperKey);
  const chain = { id: CHAIN_ID, name: 'arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
  const pub = createPublicClient({ chain, transport: viemHttp(RPC) });
  const keeperWallet = createWalletClient({ account: keeper, chain, transport: viemHttp(RPC) });

  const mnemonic = generateMnemonic(english);
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'nib-tiprand-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });

  try {
    let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 20 && !sw; i++) {
      await new Promise((r) => setTimeout(r, 500));
      sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
    }
    const id = new URL(sw!.url()).hostname;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    const imported = await popup.evaluate(
      ([m, pw]) =>
        new Promise<{ ok: boolean; address?: string; error?: string }>((resolve) => {
          // @ts-expect-error chrome injected in extension pages
          chrome.runtime.sendMessage({ type: 'VAULT_IMPORT', mnemonic: m, password: pw }, resolve);
        }),
      [mnemonic, 'e2e-tiprand-password'] as const,
    );
    expect(imported.ok, imported.error).toBeTruthy();
    const embedded = imported.address as `0x${string}`;

    await popup.evaluate(
      ([addr, hub]) =>
        new Promise<void>((resolve) => {
          // @ts-expect-error chrome injected in extension pages
          chrome.storage.local.set(
            { nibgateCustomHubApi: hub, nibgateNetwork: 'testnet', nibgateWatchAddress: addr, nibgateRail: 'transfer' },
            () => resolve(),
          );
        }),
      [embedded, HUB] as const,
    );

    // Fund the payer onchain (direct transfer rail).
    await pub.waitForTransactionReceipt({
      hash: await keeperWallet.writeContract({ address: USDC, abi: ERC20, functionName: 'transfer', args: [embedded, TIP_FUND] }),
    });
    const unlocked = await popup.evaluate(
      (pw) =>
        new Promise<{ ok: boolean }>((resolve) => {
          // @ts-expect-error chrome injected in extension pages
          chrome.runtime.sendMessage({ type: 'VAULT_UNLOCK', password: pw }, resolve);
        }),
      'e2e-tiprand-password',
    );
    expect(unlocked.ok).toBeTruthy();
    await popup.close();

    const urls = await collectRandomUrls(COUNT * 4, process.env.RANDOM_BLOG_SOURCE || 'mixed');
    let tipped = 0;
    const done: string[] = [];

    for (const url of urls) {
      if (tipped >= COUNT) break;
      const host = new URL(url).hostname.replace(/^www\./, '');
      const page = await context.newPage();
      page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept(TIP) : d.accept()));
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        // Reached a content page? If not, walk into the site's first article.
        let card = page.locator('#nibgate-card');
        if ((await card.count()) === 0) {
          const links = await findArticleLinks(page).catch(() => [] as string[]);
          for (const link of links) {
            await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
            card = page.locator('#nibgate-card');
            if ((await card.count()) === 1) break;
          }
        }
        if ((await card.count()) !== 1) continue;

        await card.locator('[data-tip="custom"]').click();
        await expect(card.locator('[data-tip-status]')).toContainText('Held for the creator', { timeout: 180000 });

        const heldRes = await fetch(`${HUB}/api/hub/tips/held?domain=${encodeURIComponent(host)}`);
        const held = await heldRes.json();
        expect(held.tips?.length, `held tip for ${host}: ${JSON.stringify(held)}`).toBeGreaterThan(0);
        tipped += 1;
        done.push(`${host} → held ${held.tips.length}`);
        console.error(`[tip-random] OK ${host} — held for creator (${held.tips.length} waiting)`);
      } catch (e) {
        console.error(`[tip-random] skip ${host}: ${(e as Error)?.message || e}`);
      } finally {
        await page.close().catch(() => {});
      }
    }

    expect(tipped, `expected at least 1 random external tip to be held; ${JSON.stringify(done)}`).toBeGreaterThan(0);
    console.error(`[tip-random] tipped ${tipped} random external site(s): ${done.join('; ')}`);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }
});
