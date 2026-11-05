import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';

// This route is force-static. Serve its build output as an asset so workerd
// never tries to read the build machine's font/image files at request time.
const image = await readFile('.next/server/app/og-image.body');
if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  throw new Error('Expected prerendered /og-image to be a PNG');
}
await mkdir('.open-next/assets', { recursive: true });
await writeFile('.open-next/assets/og-image', image);
await writeFile('.open-next/assets/_headers', `/og-image\n  Content-Type: image/png\n  Cache-Control: public, max-age=3600\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`);

// Seed only immutable SSG output. ISR routes and cached fetches must never be
// frozen into assets. Each deployment/network has its own Next build ID.
const manifest = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'));
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const cacheRoot = '.open-next/assets/cdn-cgi/_next_cache';
await rm(cacheRoot, { recursive: true, force: true });
const staged = [];
for (const [route, metadata] of Object.entries(manifest.routes)) {
  if (metadata.initialRevalidateSeconds !== false) continue;
  const key = route === '/' ? 'index' : route.slice(1);
  if (key.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('Invalid route');
  const relative = `${buildId}/${key}.cache`;
  const target = `${cacheRoot}/${relative}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await copyFile(`.open-next/cache/${relative}`, target);
  staged.push(route);
}
console.log(`Staged ${staged.length} immutable routes (no ISR or fetch entries)`);
