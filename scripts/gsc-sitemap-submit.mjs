import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const { submitAllSiteSitemaps } = await import(path.join(rootDir, 'backend/src/server/hub/gsc-sitemap.js'));

if (process.argv.includes('--list-sites')) {
  const { fetchSiteList } = await import(path.join(rootDir, 'backend/src/server/hub/gsc-sitemap.js'));
  const domains = await fetchSiteList();
  console.log(`Sites from hub: ${domains.length}`);
  for (const d of domains) console.log(`  https://${d}/sitemap.xml/`);
  process.exit(0);
}

const summary = await submitAllSiteSitemaps({ force: process.argv.includes('--force') });
if (summary.disabled) {
  console.log('GSC submit skipped:', summary.reason);
  console.log('Set GSC_SERVICE_ACCOUNT_JSON to a service account JSON file or inline JSON.');
  process.exit(1);
}

console.log(`GSC sitemap submit (${summary.dryRun ? 'DRY RUN' : 'live'}${summary.force ? ', force refresh' : ''}) → ${summary.site}`);
console.log(`Sites: ${summary.domains} | Added: ${summary.added} | Already submitted: ${summary.skipped}`);
if (summary.failed.length) {
  console.log('Failed:');
  for (const f of summary.failed) console.log('  ✗', f);
  process.exit(1);
}
