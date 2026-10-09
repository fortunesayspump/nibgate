import { build, context } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outdir = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const esbuildOptions = {
  entryPoints: {
    content: 'src/content/tip-card.ts',
    background: 'src/background/service-worker.ts',
    popup: 'src/popup/popup.ts',
    tip: 'src/tip/tip.ts',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outdir,
  absWorkingDir: root,
  // @circle-fin/x402-batching imports Node's "crypto"; shim it to WebCrypto.
  alias: { crypto: path.resolve(root, 'src/lib/crypto-shim.ts') },
  // Optional build-time hub override (dev/staging): NIBGATE_HUB_API=... npm run build
  define: { __NIBGATE_HUB_API__: JSON.stringify(process.env.NIBGATE_HUB_API || '') },
  logLevel: 'info',
};

function copyStatic() {
  fs.mkdirSync(outdir, { recursive: true });
  // Production zip ships without localhost dev hosts (review hygiene): the
  // in-app hub override still exists, but the manifest no longer requests
  // loopback access. Keep them for local dev with KEEP_LOCAL_HOSTS=1.
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!process.env.KEEP_LOCAL_HOSTS) {
    const isLoopback = (h) => /localhost|127\.0\.0\.1/i.test(h);
    manifest.host_permissions = (manifest.host_permissions || []).filter((h) => !isLoopback(h));
  }
  fs.writeFileSync(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.copyFileSync(path.join(root, 'src/popup/popup.html'), path.join(outdir, 'popup.html'));
  fs.copyFileSync(path.join(root, 'src/tip/tip.html'), path.join(outdir, 'tip.html'));
  // Icons + brand assets (popup references icons/ relatively; manifest needs the PNGs).
  fs.rmSync(path.join(outdir, 'icons'), { recursive: true, force: true });
  fs.cpSync(path.join(root, 'icons'), path.join(outdir, 'icons'), { recursive: true });
  // Hub brand fonts (Kumbh Sans + ABC Favorit) so the popup matches the hub.
  fs.rmSync(path.join(outdir, 'fonts'), { recursive: true, force: true });
  fs.cpSync(path.join(root, 'fonts'), path.join(outdir, 'fonts'), { recursive: true });
}

async function buildOnce() {
  fs.rmSync(outdir, { recursive: true, force: true });
  copyStatic();
  await build(esbuildOptions);
  console.log('dist ready — load it in chrome://extensions (see docs/LOAD_IN_CHROME.md)');
}

async function watchAll() {
  fs.rmSync(outdir, { recursive: true, force: true });
  copyStatic();
  const ctx = await context(esbuildOptions);
  await ctx.rebuild();
  console.log('dist ready — load it in chrome://extensions (see docs/LOAD_IN_CHROME.md)');

  // Re-copy static files when they change (esbuild only watches bundle entries).
  const recopy = (label) => () => {
    try {
      copyStatic();
      console.log(`[watch] ${label} changed → dist/ refreshed (hit ↻ on chrome://extensions)`);
    } catch (e) {
      console.error(`[watch] refresh failed: ${e?.message || e}`);
    }
  };
  for (const [label, target] of [
    ['manifest.json', path.join(root, 'manifest.json')],
    ['popup.html', path.join(root, 'src/popup/popup.html')],
    ['tip.html', path.join(root, 'src/tip/tip.html')],
    ['icons/', path.join(root, 'icons')],
  ]) {
    try {
      fs.watch(target, { recursive: true }, recopy(label));
    } catch (e) {
      console.error(`[watch] cannot watch ${label}: ${e?.message || e}`);
    }
  }

  await ctx.watch();
  console.log('[watch] watching src/ + static assets — edit, save, then hit ↻ on chrome://extensions');
  const stop = async () => {
    await ctx.dispose();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

(watch ? watchAll() : buildOnce()).catch((e) => {
  console.error(e);
  process.exit(1);
});
