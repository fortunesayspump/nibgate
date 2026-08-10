import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

try {
  const envContent = fs.readFileSync(path.resolve(repoRoot, 'backend/.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import * as sdk from '../packages/nibgate/src/server.js';
import { createNibgateProvider } from '../backend/src/server/lib/nibgate-provider.js';

const config = {
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET,
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')
};
sdk.registerProvider('nibgate', createNibgateProvider, config);

const { db } = await import(repoRoot + '/packages/cli/src/core/db.js');

const passed = [];
const failed = [];
function test(label, ok) {
  console.log(ok ? '  \u2713' : '  \u2717', label);
  if (ok) passed.push(label); else failed.push(label);
}

async function cleanup(user) {
  if (!user) return;
  const shares = await db.nibShare.findMany({ where: { ownerWallet: user.walletAddress } });
  for (const s of shares) {
    await db.nibShareReceipt.deleteMany({ where: { shareId: s.id } });
    await db.nibShareEntitlement.deleteMany({ where: { shareId: s.id } });
  }
  await db.nibShare.deleteMany({ where: { ownerWallet: user.walletAddress } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.wallet.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
}

const API = 'http://localhost:3199';

// Generate a real wallet address (just the address, no funds needed for free shares)
const walletBytes = crypto.randomBytes(20);
const walletAddress = '0x' + walletBytes.toString('hex');

// --- Setup: user + session in DB ---
console.log('\n=== Setup ===');
const user = await db.user.create({ data: { walletAddress, username: 'E2E Tester' } });
await db.wallet.create({ data: { userId: user.id, address: walletAddress, isPrimary: true } });
const sessionToken = crypto.randomBytes(48).toString('base64url');
await db.session.create({ data: { userId: user.id, token: sessionToken, expiresAt: new Date(Date.now() + 86400e3) } });
const cookie = 'auth_session=' + sessionToken;
test('user created with wallet ' + walletAddress.slice(0, 10) + '...', true);
test('session created', true);

try {

// ===== Part 1: Raw encrypted storage pipeline =====
console.log('\n1. Raw encrypted storage (SDK)');
const plaintext = 'Hello from encrypted storage test ' + Date.now();
const key = sdk.generateContentKey();
const enc = sdk.encryptBytes(key, Buffer.from(plaintext, 'utf8'));
const blob = sdk.packCipherBlob(enc);
const r2Key = 'e2e-storage-test/' + Date.now() + '/body.bin';

const putResult = await sdk.putBlob({ provider: 'nibgate', key: r2Key, data: blob });
test('putBlob returns storageRef', !!putResult.storageRef);
test('putBlob returns url', !!putResult.url);
console.log('    url:', putResult.url);

const got = await sdk.getBlob({ provider: 'nibgate', storageRef: putResult.storageRef });
const unpacked = sdk.unpackCipherBlob(got);
const decrypted = sdk.decryptBytes(key, unpacked.iv, unpacked.tag, unpacked.ciphertext);
test('roundtrip content matches', decrypted.toString('utf8') === plaintext);
test('blob size matches', got.length === blob.length);

await sdk.deleteBlob({ provider: 'nibgate', storageRef: putResult.storageRef });
try {
  await sdk.getBlob({ provider: 'nibgate', storageRef: putResult.storageRef });
  test('blob deleted (should error)', false);
} catch {
  test('blob deleted (getBlob errors)', true);
}

// ===== Part 2: Nibshare upload (create) =====
console.log('\n2. Nibshare upload (POST /nibshare)');
const shareContent = 'Secret article content ' + Date.now();
const createRes = await fetch(API + '/nibshare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    title: 'E2E Encrypted Post',
    content: shareContent,
    price: '0',
    contentType: 'text'
  })
});
const created = await createRes.json();
test('POST /nibshare returns 201', createRes.status === 201);
test('response has slug', !!created.slug);
test('response has id', !!created.id);
test('storageProvider = nibgate', created.storageProvider === 'nibgate');
test('has ciphertextUrl', !!created.ciphertextUrl);
test('has contentHash', !!created.contentHash);
console.log('    slug:', created.slug);
console.log('    ciphertextUrl:', created.ciphertextUrl);

// ===== Part 3: Unlock (decrypt server-side) =====
console.log('\n3. Nibshare unlock (POST /nibshare/:slug/unlock)');
const unlockRes = await fetch(API + '/nibshare/' + created.slug + '/unlock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress })
});
const unlocked = await unlockRes.json();
test('POST /unlock returns 200', unlockRes.status === 200);
test('unlock.success = true', unlocked.success === true);
test('decrypted content matches original', unlocked.access?.body === shareContent);
console.log('    decrypted:', String(unlocked.access?.body).slice(0, 60));

// ===== Part 4: Metadata =====
console.log('\n4. Nibshare metadata (GET /nibshare/:slug/meta)');
const metaRes = await fetch(API + '/nibshare/' + created.slug + '/meta');
const meta = await metaRes.json();
test('GET /meta returns 200', metaRes.status === 200);
test('meta.title matches', meta.title === 'E2E Encrypted Post');
test('meta.status = active', meta.status === 'active');

// ===== Part 5: Delete + blob cleanup =====
console.log('\n5. Delete share + blob cleanup');
const deleteRes = await fetch(API + '/nibshare/' + created.slug, {
  method: 'DELETE',
  headers: { Cookie: cookie }
});
const deleted = await deleteRes.json();
test('DELETE returns 200', deleteRes.status === 200);
test('deleted.success = true', deleted.success === true);
test('deleted.status = revoked', deleted.status === 'revoked');

const afterDelete = await db.nibShare.findUnique({ where: { slug: created.slug } });
test('DB status = revoked', afterDelete?.status === 'revoked');

if (created.ciphertextUrl) {
  try {
    const blobRes = await fetch(created.ciphertextUrl);
    test('R2 blob cleaned up (404)', blobRes.status === 404 || blobRes.status === 403);
  } catch {
    test('R2 blob cleaned up (fetch error)', true);
  }
}

// ===== Part 6: Unlock after revoke =====
console.log('\n6. Unlock after revoke (should fail)');
const revokedRes = await fetch(API + '/nibshare/' + created.slug + '/unlock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress })
});
test('revoked unlock returns 410', revokedRes.status === 410);

// ===== Part 7: 50KB content =====
console.log('\n7. Large content (50KB)');
const largeContent = 'X'.repeat(50000);
const largeRes = await fetch(API + '/nibshare', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ title: 'Large Post', content: largeContent, price: '0' })
});
const largeCreated = await largeRes.json();
test('large share created', largeRes.status === 201);

const largeUnlock = await fetch(API + '/nibshare/' + largeCreated.slug + '/unlock', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress })
});
const largeUnlocked = await largeUnlock.json();
test('large unlock = 200', largeUnlock.status === 200);
test('large content matches', largeUnlocked.access?.body === largeContent);

// cleanup large share
await fetch(API + '/nibshare/' + largeCreated.slug, {
  method: 'DELETE',
  headers: { Cookie: cookie }
});

} finally {
  await cleanup(user);
}

await db.$disconnect();

console.log('\n=== ' + passed.length + ' passed, ' + failed.length + ' failed ===');
if (failed.length) {
  console.log('FAILED:', failed.join(', '));
  process.exit(1);
}
