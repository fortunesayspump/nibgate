// Query memory — which domains earned citations, per user.
//
// After a report ships, every domain the run read gets reads+1 and every
// domain the report actually cited gets cites+1. Future runs read the rates
// back as one more piece of state behind trust judgments: a source that proved
// useful before starts with evidence behind it, and one that never gets cited
// despite repeated reads arrives with that record attached. Memory informs;
// it never decides — JEV still makes the call with the rate in view.
import { db } from './db.js';
import { recordEvent } from './eventlog.js';

/**
 * Record what a finished run read and cited. Safe to call once per report;
 * safe to re-run (counts would double — callers invoke it once, after write).
 */
export async function recordRunMemory(runId) {
  const run = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  if (!run.userId) return { recorded: 0 };
  const sources = await db.researchSource.findMany({
    where: { runId },
    orderBy: [{ trust: 'desc' }, { relevance: 'desc' }],
  });
  const report = await db.researchReport.findFirst({ where: { runId }, orderBy: { version: 'desc' } });
  const cited = new Set();
  if (report) {
    for (const m of String(report.markdown || '').matchAll(/\[(\d+)\]/g)) {
      const s = sources[Number(m[1]) - 1];
      if (s?.domain) cited.add(s.domain);
    }
  }
  const domains = new Set(sources.map((s) => s.domain).filter(Boolean));
  for (const domain of domains) {
    const citedHere = cited.has(domain);
    await db.queryMemory.upsert({
      where: { userId_domain: { userId: run.userId, domain } },
      update: { reads: { increment: 1 }, cites: { increment: citedHere ? 1 : 0 } },
      create: { userId: run.userId, domain, reads: 1, cites: citedHere ? 1 : 0 },
    });
  }
  await recordEvent(runId, { type: 'memory.recorded', domains: domains.size, cited: cited.size });
  return { recorded: domains.size, cited: cited.size };
}

/** Past cite rates for these domains, for this user. Unknown domains are absent (no prior), never zero. */
export async function memoryPriors(userId, domains) {
  if (!userId || !Array.isArray(domains) || !domains.length) return {};
  const rows = await db.queryMemory.findMany({ where: { userId, domain: { in: [...new Set(domains)] } } });
  const out = {};
  for (const r of rows) out[r.domain] = { reads: r.reads, cites: r.cites, rate: r.reads ? r.cites / r.reads : 0 };
  return out;
}
