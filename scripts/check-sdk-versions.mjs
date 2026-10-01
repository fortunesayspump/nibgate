#!/usr/bin/env node
// Fails when a workspace package pins a published @nibgate dependency older
// than what is actually on npm.
//
// Why this exists: the browser direct rail shipped code that broadcast a USDC
// transfer and then failed to attach the x-nibgate-tx-owner proof the hub
// requires. Every hosted direct unlock returned "payment could not be
// verified" after the user's money had already left their wallet.
//
// The proof shipped in @nibgate/wallet 0.4.14 and @nibgate/sdk 0.4.31, but
// subblogs/frontend was still on 0.4.9 / 0.4.20 and its vercel.json pinned
// "installCommand": "npm install". Caret ranges plus a separate lockfile meant
// the build was stale, reproducible, and silent: CI was green, the deploy
// succeeded, and the payment path was a week behind.
//
// Run: node scripts/check-sdk-versions.mjs
// Add to CI so a bump cannot land without this passing.
import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only packages published to npm. Workspace-linked deps are built from source
// and are checked by the build, not against the registry.
const PUBLISHED = new Set(['@nibgate/sdk', '@nibgate/wallet']);

const MANIFESTS = [
  'packages/cli/package.json',
  'packages/wallet/package.json',
  'packages/nibgate/package.json',
  'subblogs/backend/package.json',
  'subblogs/frontend/package.json',
  'frontend/package.json',
  'backend/package.json',
];

// Windows resolves npm through a .cmd shim, which execFile cannot spawn (EINVAL
// after the .bat/.cmd hardening), so this deliberately goes through a shell.
const npmView = (specifier) =>
  new Promise((resolve, reject) => {
    exec(
      `npm view ${specifier} version`,
      { windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim()))
    );
  });

const compare = (a, b) => {
  const pa = a.split(/[.-]/).map((n) => (Number.isNaN(Number(n)) ? n : Number(n)));
  const pb = b.split(/[.-]/).map((n) => (Number.isNaN(Number(n)) ? n : Number(n)));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na === nb) continue;
    return typeof na === 'number' && typeof nb === 'number' ? na - nb : String(na).localeCompare(String(nb));
  }
  return 0;
};

// "0.4.9" or "^0.4.20" -> "0.4.20"
const pinnedVersion = (range) => String(range || '').replace(/^[\^~>=<\s]+/, '').trim();

const latest = new Map();
const stale = [];
const checked = [];

for (const manifest of MANIFESTS) {
  let json;
  try {
    json = JSON.parse(await readFile(path.join(root, manifest), 'utf8'));
  } catch {
    continue; // manifest not present in this checkout
  }

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(json[field] || {})) {
      if (!PUBLISHED.has(name)) continue;
      const version = pinnedVersion(range);
      // workspace:* resolves to local source; nothing to compare against npm.
      if (!/^\d+\.\d+\.\d+/.test(version)) continue;

      if (!latest.has(name)) latest.set(name, await npmView(name));
      const current = latest.get(name);

      checked.push({ manifest, field, name, range, version, current });
      if (compare(version, current) < 0) {
        stale.push({ manifest, field, name, range, version, current });
      }
    }
  }
}

for (const { manifest, field, name, version, current } of checked) {
  const mark = compare(version, current) < 0 ? 'STALE' : 'ok   ';
  console.log(`${mark} ${manifest} ${field} ${name} ${version} (npm latest ${current})`);
}

if (stale.length) {
  console.error(`\n${stale.length} stale @nibgate dependency pin(s). Bump them and refresh the lockfile.`);
  console.error('A stale pin ships a stale payment path without failing any build.');
  for (const { manifest, name, range, current } of stale) {
    console.error(`  ${manifest}: ${name} ${range} -> ${current}`);
  }
  process.exit(1);
}

console.log('\nAll published @nibgate deps are current.');