// search_sources — grep over the run's own evidence.
//
// The run collects far more text than fits in any one prompt. This tool
// searches what the run itself already read — source titles/URLs plus the
// fetched passages — so verification and follow-ups work from the run's
// evidence instead of re-reading the web or, worse, answering from memory.
import { db } from '../db.js';

function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
}

function scoreText(queryTokens, ...fields) {
  const hay = tokens(fields.join(' '));
  if (!hay.length || !queryTokens.length) return 0;
  const set = new Set(hay);
  let hits = 0;
  for (const t of new Set(queryTokens)) if (set.has(t)) hits += 1;
  return hits / queryTokens.length;
}

/**
 * @returns {Promise<{matches:Array<{url,title,excerpt,score}>, searched:number}>}
 */
export async function searchEvidence(runId, { query, limit = 5 } = {}) {
  const q = tokens(query);
  if (!q.length) return { matches: [], searched: 0 };
  const [sources, steps] = await Promise.all([
    db.researchSource.findMany({ where: { runId } }),
    db.researchStep.findMany({ where: { runId, kind: 'fetch' }, orderBy: { createdAt: 'desc' }, take: 3 }),
  ]);
  const docsByUrl = new Map();
  for (const step of steps) {
    for (const d of step.output?.documents || []) {
      if (d?.url && !docsByUrl.has(d.url)) docsByUrl.set(d.url, d);
    }
  }
  const scored = sources.map((s) => {
    const doc = docsByUrl.get(s.url);
    const text = doc?.text || '';
    const score = Math.max(
      scoreText(q, s.title, s.url) * 0.6,
      text ? scoreText(q, text.slice(0, 4000)) : 0,
    );
    const at = text ? text.toLowerCase().indexOf(q.find((t) => text.toLowerCase().includes(t)) || '') : -1;
    return {
      url: s.url,
      title: s.title,
      score: Math.round(score * 100) / 100,
      excerpt: at >= 0 ? text.slice(Math.max(0, at - 200), at + 400) : String(text).slice(0, 400),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return { matches: scored.filter((m) => m.score > 0).slice(0, Math.min(Math.max(Number(limit) || 5, 1), 20)), searched: sources.length };
}
