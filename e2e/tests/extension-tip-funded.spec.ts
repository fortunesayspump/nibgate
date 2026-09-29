// Funded live-signing E2E for a RESOLVED creator (payee = creator fee wallet),
// both rails hand in hand:
//   - direct transfer: embedded wallet sends USDC to the fee-wallet payee
//   - Circle Gateway: embedded wallet signs a batched authorization
// Then the hub verifies and records a settled Tip with the right provider.
//
// Guarded: only runs when E2E_FUNDED=1 and the local hub + keeper key are
// reachable. Never enable against mainnet.
import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http as viemHttp, parseAbi, bytesToHex, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount, generateMnemonic, english } from 'viem/accounts';
import { depositToGateway, getGatewayBalances } from '../../packages/nibgate/src/server/gateway.js';

const EXT_PATH = path.resolve('extension/dist');
const HUB = process.env.E2E_HUB_API || 'http://localhost:3005';
const RPC = process.env.E2E_RPC_URL || 'https://rpc.testnet.arc.io';
const CHAIN_ID = 5042002;
const USDC = '0x3600000000000000000000000000000000000000' as const;
const CREATOR = '0x7e27AFBA45D880BA94B0C08eFd1523D2dEe627FE';
const TIP = '1';

const ERC20 = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

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

function lanIp(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) if (info.family === 'IPv4' && !info.internal && info.address.startsWith('192.168.')) return info.address;
  }
  return '127.0.0.1';
}

const ARTICLE = `<!doctype html><html><head>
<title>Resolved Tip Fixture</title>
<meta name="nibgate:recipient" content="${CREATOR}">
</head><body><main><article>
<h1>Resolved Tip Fixture</h1>
<p>${'Paid content that is long enough to be extracted as an article. '.repeat(40)}</p>
</article></main></body></html>`;

async function runResolved(rail: 'transfer' | 'gateway', mode: 'settle' | 'fail' = 'settle') {
  const env = await readFile(path.resolve('backend/.env'), 'utf8').catch(() => '');
  const keeperKey = envValue(env, 'NIBGATE_KEEPER_PRIVATE_KEY') as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(keeperKey)) test.skip(true, 'NIBGATE_KEEPER_PRIVATE_KEY missing');
  const rpcUrl = envValue(env, 'ARC_RPC_URL') || envValue(env, 'NIBGATE_PAYMENT_RPC_URL') || RPC;
  const keeper = privateKeyToAccount(keeperKey);
  const chain = { id: CHAIN_ID, name: 'arc', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } } as const;
  const pub = createPublicClient({ chain, transport: viemHttp(rpcUrl) });
  const keeperWallet = createWalletClient({ account: keeper, chain, transport: viemHttp(rpcUrl) });

  const mnemonic = generateMnemonic(english);
  const embeddedKey = bytesToHex(mnemonicToAccount(mnemonic).getHdKey().privateKey!);
  const contentUrl = `http://${lanIp()}:3099/post`;

  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(ARTICLE); });
  await new Promise<void>((r) => server.listen(3099, '0.0.0.0', r));

  const context = await chromium.launchPersistentContext(await mkdtemp(path.join(os.tmpdir(), 'nib-res-')), {
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
      ([m, pw]) => new Promise<{ ok: boolean; address?: string; error?: string }>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_IMPORT', mnemonic: m, password: pw }, resolve);
      }),
      [mnemonic, 'e2e-resolved-password'] as const,
    );
    expect(imported.ok, imported.error).toBeTruthy();
    const embedded = imported.address as `0x${string}`;
    await popup.evaluate(
      ([addr, hub, r]) => new Promise<void>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.storage.local.set({ nibgateCustomHubApi: hub, nibgateNetwork: 'testnet', nibgateWatchAddress: addr, nibgateRail: r }, () => resolve());
      }),
      [embedded, HUB, rail] as const,
    );

    // Fund the payer onchain; gateway needs a Gateway balance.
    if (mode === 'settle') {
      await pub.waitForTransactionReceipt({ hash: await keeperWallet.writeContract({ address: USDC, abi: ERC20, functionName: 'transfer', args: [embedded, 2_000_000n] }) });
      if (rail === 'gateway') {
        const bal = await getGatewayBalances({ buyerPrivateKey: embeddedKey, buyerChain: 'arcTestnet' });
        if (Number((bal as { gateway?: { available?: string } })?.gateway?.available || 0) < 1_500_000) {
          const dep = await depositToGateway('1.5', { buyerPrivateKey: embeddedKey, buyerChain: 'arcTestnet', buyerRpcUrl: rpcUrl });
          expect(dep.ok, JSON.stringify(dep, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBeTruthy();
        }
      }
    }

    // Re-unlock: the MV3 worker may have been suspended while funding.
    const unlocked = await popup.evaluate(
      (pw) => new Promise<{ ok: boolean }>((resolve) => {
        // @ts-expect-error chrome injected in extension pages
        chrome.runtime.sendMessage({ type: 'VAULT_UNLOCK', password: pw }, resolve);
      }),
      'e2e-resolved-password',
    );
    expect(unlocked.ok).toBeTruthy();

    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(contentUrl);
    const card = page.locator('#nibgate-card');
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await card.getByRole('button', { name: `$${TIP}`, exact: true }).click();
    if (mode === 'fail') {
      // No funds: the wallet must surface a clear error, never a silent success.
      await expect(card.locator('[data-tip-status]')).toContainText(/revert|insufficient|exceeds|failed/i, { timeout: 60000 });
      return;
    }
    await expect(card.locator('[data-tip-status]')).toContainText('Tipped', { timeout: 180000 });

    // A settled tip row with the right provider must exist for this URL.
    const expectedProvider = rail === 'gateway' ? 'circle-gateway' : 'direct-transfer';
    let row: { paymentProvider?: string; status?: string } | null = null;
    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${HUB}/api/hub/tips?contentUrl=${encodeURIComponent(contentUrl)}`);
      if (res.ok) {
        const body = await res.json();
        row = (body?.tips || []).find((t: { status?: string }) => t.status === 'settled') || null;
        if (row) break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(row, 'expected a settled hub Tip row').toBeTruthy();
    expect(row!.paymentProvider).toBe(expectedProvider);
  } finally {
    await context.close();
    server.close();
  }
}

test('funded resolved: direct rail settles via the fee-wallet payee', async () => {
  test.skip(process.env.E2E_FUNDED !== '1', 'set E2E_FUNDED=1 to run');
  test.setTimeout(420000);
  test.skip(!(await hubUp()), `hub not reachable at ${HUB}`);
  await runResolved('transfer');
});

test('funded resolved: gateway rail settles via the fee-wallet payee', async () => {
  test.skip(process.env.E2E_FUNDED !== '1', 'set E2E_FUNDED=1 to run');
  test.setTimeout(420000);
  test.skip(!(await hubUp()), `hub not reachable at ${HUB}`);
  await runResolved('gateway');
});

test('funded resolved: insufficient funds surfaces an error, not a false success', async () => {
  test.skip(process.env.E2E_FUNDED !== '1', 'set E2E_FUNDED=1 to run');
  test.setTimeout(300000);
  test.skip(!(await hubUp()), `hub not reachable at ${HUB}`);
  await runResolved('transfer', 'fail');
});
