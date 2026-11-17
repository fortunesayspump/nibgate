// Persist progress between sites so the process deadline cannot starve the tail
// of a large site list. Preserve failures across restarts, then retry the next
// cadence without declaring a partially failed daily cycle complete.
export async function runIndexBatches({ cursor, checkpoint, fetchSites, inspectSite }) {
  const saved = cursor ? JSON.parse(cursor) : { after: '', failures: [] };
  const failures = new Set(saved.failures || []);
  const domains = [...new Set(await fetchSites())].sort();
  for (const domain of domains.filter(domain => domain > (saved.after || ''))) {
    try {
      const result = await inspectSite(domain);
      if (result.disabled || result.errors?.length || result.indexNowErrors) throw Error('Incomplete index inspection');
    } catch {
      failures.add(domain);
      console.error('[gsc-index] site failed:', domain);
    }
    await checkpoint(JSON.stringify({ after: domain, failures: [...failures] }));
  }
  await checkpoint(null);
  if (failures.size) throw Error(`GSC index failed for ${failures.size} sites; retry next cadence`);
  console.log('[gsc-index] completed site cycle:', domains.length);
  return null;
}
