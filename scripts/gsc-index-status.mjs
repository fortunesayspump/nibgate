import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const { runIndexSweep, inspectUrl } = await import(path.join(rootDir, 'backend/src/server/hub/gsc-index.js'));

const dryRun = process.argv.includes('--dry-run');
const inspectOnly = process.argv.includes('--inspect-only');
const reportOnly = process.argv.includes('--report');

if (reportOnly) {
  const { db } = await import(path.join(rootDir, 'packages/internal/src/db.js'));
  const rows = await db.indexState.findMany({ orderBy: { domain: 'asc' } });
  console.log(`IndexState rows: ${rows.length}`);
  for (const r of rows) {
    const status = r.isIndexed ? 'INDEXED' : (r.coverageState || r.indexingState || 'unknown');
    const crawled = r.lastCrawlTime ? r.lastCrawlTime.toISOString().slice(0, 10) : '-';
    console.log(`  ${r.domain.padEnd(28)} ${status.padEnd(34)} inspected ${r.lastInspectedAt.toISOString().slice(0, 10)} crawled ${crawled}`);
  }
  process.exit(0);
}

if (process.argv.includes('--inspect-one')) {
  const target = process.argv[process.argv.indexOf('--inspect-one') + 1];
  if (!target) {
    console.error('Usage: --inspect-one <url>');
    process.exit(1);
  }
  console.log(await inspectUrl(target));
  process.exit(0);
}

const summary = await runIndexSweep({
  dryRun: dryRun || process.env.GSC_DRY_RUN === '1',
  persist: !inspectOnly && !dryRun,
});
if (summary.disabled) {
  console.log('GSC index sweep skipped:', summary.reason);
  console.log('Set GSC_SERVICE_ACCOUNT_JSON to a service account JSON file or inline JSON.');
  process.exit(1);
}

const mode = dryRun ? 'DRY RUN' : inspectOnly ? 'inspect-only (no DB writes)' : 'live';
console.log(`GSC index sweep (${mode}) → ${summary.site}`);
console.log(`Sites: ${summary.domains} | New: ${summary.newSites} | Inspected: ${summary.inspected} | Indexed: ${summary.indexed} | Not indexed: ${summary.notIndexed} | Changed: ${summary.changed} | Sitemap re-submits: ${summary.resubmitted} | IndexNow URLs: ${summary.indexNow}`);
for (const n of summary.notIndexedList) console.log(`  not-indexed: ${n.domain} (${n.coverageState || n.indexingState || 'unknown'})`);
if (summary.errors.length) {
  console.log('Errors:');
  for (const e of summary.errors) console.log('  ✗', e);
  process.exit(1);
}
