import { recordIndexDiagnostic, observeIndexStage } from './index-diagnostics.js';
// Persist progress between sites so the process deadline cannot starve the tail
// of a large site list. Preserve failures across restarts, then retry the next
// cadence without declaring a partially failed daily cycle complete.
export async function runIndexBatches({ cursor, checkpoint, fetchSites, inspectSite, now = Date.now, budgetMs = 150_000 }) {
  const started = now();
  const saved = cursor ? JSON.parse(cursor) : { after: '', failures: [] };
  const failures = new Set(saved.failures || []);
  if (failures.size) recordIndexDiagnostic('batch', 'inherited_failures', null, failures.size);
  const save = value => observeIndexStage('checkpoint', () => checkpoint(value));
  const domains = [...new Set(await fetchSites())].sort();
  for (const domain of domains.filter(domain => domain > (saved.after || ''))) {
    if (now() - started >= budgetMs) return { pending: true };
    try {
      const result = await inspectSite(domain);
      if (result.disabled || result.errors?.length || result.indexNowErrors) throw Error('Incomplete index inspection');
    } catch {
      recordIndexDiagnostic('batch', 'new_failures');
      failures.add(domain);
      // Provider/stage counters carry no domains or payloads.
    }
    await save(JSON.stringify({ after: domain, failures: [...failures] }));
  }
  await save(null);
  if (failures.size) throw Error(`GSC index failed for ${failures.size} sites; retry next cadence`);
  console.log('[gsc-index] completed site cycle:', domains.length);
  return null;
}
