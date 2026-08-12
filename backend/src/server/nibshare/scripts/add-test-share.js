import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const envPath = path.resolve(__dirname, '../../../../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
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

const { registerProvider } = await import('@nibgate/sdk/server');
const { createNibgateProvider } = await import('../../lib/nibgate-provider.js');

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicUrl = process.env.R2_PUBLIC_URL;
if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
  console.error('Missing R2 env vars — cannot register storage provider.', { endpoint: !!endpoint, accessKeyId: !!accessKeyId, secretAccessKey: !!secretAccessKey, bucket: !!bucket, publicUrl: !!publicUrl });
  process.exit(1);
}
registerProvider('nibgate', createNibgateProvider, {
  endpoint, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/+$/, '')
});

const { createShare } = await import('../service.js');

const title = process.argv[2] || 'The Quiet Afternoon Protocol';
const content = process.argv[3]
  || `# ${title}

Everyone is building faster. The question is whether anyone is building *better*.

This article was added to the database via the real Nibshare service (encrypt → R2 → hash → DB row).

## Speed is not a strategy

The tools have collapsed the time between idea and artifact. What used to take a week now takes an afternoon. But the output is still gated by taste, not by keystrokes.

- **Input is free.** Anyone can write now.
- **Attention is the scarce asset.** Not tooling.
- **Editing is the moat.** Compression, not expansion, is where the value lives.

## The quiet afternoon

The best work I have produced happened in hours with no calendar pressure. No meetings. No pull requests. Just a document, a walk, and a second draft.

Nibgate exists for exactly that: a share page where the value is behind a gate, and the person on the other side decided it was worth 0.01 USDC.

## Flow verified

- createShare encrypts the body with a fresh content key
- blob stored to R2 under \`nibshare/<id>/body.bin\`
- content hash derived from owner + storageRef + plaintext
- row written to \`NibShare\` with slug, status \`active\`

Open \`http://localhost:3001/ns/<slug>\` to view it.
`;

const share = await createShare({
  title,
  summary: 'A short essay on why speed is not a strategy — locked behind a 0.01 USDC gate.',
  content,
  price: 0.01,
  status: 'active',
  contentType: 'article',
  storageProvider: 'nibgate',
  ownerWallet: '0x2c5C6423993ba5102E5b0e1cE3079b9C26aa23bD',
});

console.log(JSON.stringify({
  slug: share.slug,
  title: share.title,
  status: share.status,
  storageRef: share.storageRef,
  contentHash: share.contentHash,
  url: `http://localhost:3001/ns/${share.slug}`,
}, null, 2));
