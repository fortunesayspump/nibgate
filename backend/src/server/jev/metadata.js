import { db } from '@nibgate/internal/db.js';

// JEV metadata enrichment: thin content often has no tags, so discovery
// search can't find it. This asks the JEV decisions model (batch `noul`) to
// score a bounded candidate tag set and writes the confident top-k as
// TENTATIVE tags (tagsTentative=true) — clearly marked so agents know they
// were inferred, not publisher-provided, and never overwriting real tags.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you',
  'are', 'was', 'were', 'its', 'his', 'her', 'their', 'our', 'out', 'not',
  'but', 'how', 'why', 'what', 'when', 'who', 'all', 'any', 'can', 'will',
  'one', 'two', 'new', 'get', 'got', 'has', 'have', 'had', 'about', 'over',
  'more', 'most', 'some', 'than', 'then', 'them', 'they', 'been', 'being',
  'just', 'like', 'only', 'also', 'very', 'much', 'such', 'each', 'other',
]);

// Curated vocabulary keeps tentative tags useful and consistent (free-form
// generation is not a decisions model's job). Extend as the corpus grows.
export const TAG_VOCABULARY = [
  'writing', 'essay', 'fiction', 'poetry', 'journal', 'diary', 'newsletter',
  'technology', 'software', 'engineering', 'programming', 'ai', 'security',
  'design', 'ux', 'art', 'photography', 'illustration', 'music', 'audio',
  'video', 'film', 'podcast', 'travel', 'food', 'recipes', 'health', 'fitness',
  'sports', 'finance', 'crypto', 'business', 'marketing', 'productivity',
  'career', 'education', 'science', 'nature', 'environment', 'history',
  'culture', 'books', 'reviews', 'tutorial', 'guide', 'opinion', 'personal',
];

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length >= 3 && t.length <= 24 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

// Bounded candidate set (JEV scores them all in ONE request): vocabulary words
// that appear in the text first, then salient title words, then the broad
// vocabulary as options — deduped, capped at `max`.
export function candidateTagsFor(content, max = 24) {
  const title = tokens(content?.title);
  const desc = tokens(content?.description);
  const text = new Set([...title, ...desc]);
  const seen = new Set();
  const out = [];
  const push = (t) => {
    const tag = String(t || '').trim().toLowerCase();
    if (!tag || seen.has(tag) || out.length >= max) return;
    seen.add(tag);
    out.push(tag);
  };
  for (const v of TAG_VOCABULARY) if (text.has(v)) push(v);
  for (const t of title) push(t);
  for (const v of TAG_VOCABULARY) push(v);
  return out.slice(0, max);
}

function metadataState(content) {
  const site = content?.website?.name || content?.website?.domain || '';
  return [
    `Title: ${content?.title || ''}`,
    site ? `Site: ${site}` : '',
    content?.contentType ? `Type: ${content.contentType}` : '',
    content?.description ? `Description: ${String(content.description).slice(0, 500)}` : '',
    content?.path ? `Path: ${content.path}` : '',
  ].filter(Boolean).join('\n').slice(0, 4000);
}

let enricherStarted = false;

/**
 * Fill tentative tags for content that has none. Returns a summary. Never
 * throws on a per-row failure — a bad row is skipped, the cycle continues.
 */
export async function enrichMissingMetadata(options = {}) {
  const limit = Math.max(1, Number(options.limit || 8));
  const topK = Math.min(8, Math.max(1, Number(options.topK || 4)));
  const minProbability = Number.isFinite(Number(options.minProbability)) ? Number(options.minProbability) : 0.6;

  let jev;
  try {
    jev = await import('../../../../jev/src/decisions.ts');
  } catch {
    return { skipped: 'jev unavailable' };
  }

  let rows;
  try {
    rows = await db.content.findMany({
      where: {
        price: { gt: 0 },
        deletedAt: null,
        OR: [{ tags: null }, { tags: '' }],
        website: { deletedAt: null, isVerified: true, verificationStatus: 'verified' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, title: true, description: true, contentType: true, path: true,
        website: { select: { name: true, domain: true } },
      },
    });
  } catch (error) {
    console.log('Metadata enricher: content query failed:', error.message);
    return { skipped: `db:${error.message}` };
  }
  if (!rows.length) return { considered: 0, enriched: 0, model: null };

  let enriched = 0;
  let model = null;
  for (const row of rows) {
    try {
      const candidates = candidateTagsFor(row);
      if (candidates.length < 2) continue;
      const out = await jev.askNoulBatch({
        state: metadataState(row),
        questions: candidates.map((tag, i) => ({ id: `t${i}`, instructions: `Probability (0..1) that the tag "${tag}" accurately describes this content.` })),
      });
      if (!out) continue;
      model = out.model;
      const picked = candidates
        .map((tag, i) => ({ tag, p: out.answers[`t${i}`] ?? 0 }))
        .filter((x) => x.p >= minProbability)
        .sort((a, b) => b.p - a.p)
        .slice(0, topK)
        .map((x) => x.tag);
      if (!picked.length) continue;
      await db.content.update({ where: { id: row.id }, data: { tags: picked.join(','), tagsTentative: true } });
      enriched += 1;
      console.log(`Metadata enricher: ${row.id} "${String(row.title || '').slice(0, 40)}" → ${picked.join(', ')} (${out.model})`);
    } catch (error) {
      console.log(`Metadata enricher: row ${row.id} failed:`, error.message);
    }
  }
  return { considered: rows.length, enriched, model };
}

// Periodic pass, gated by NIBGATE_METADATA_ENRICH (like the fee keeper).
export function startMetadataEnricher() {
  if (enricherStarted || !process.env.NIBGATE_METADATA_ENRICH) return;
  enricherStarted = true;
  const intervalMs = Number.parseInt(process.env.NIBGATE_METADATA_ENRICH_INTERVAL_MS || '3600000', 10);
  const initialDelayMs = Number.parseInt(process.env.NIBGATE_METADATA_ENRICH_INITIAL_DELAY_MS || '60000', 10);
  const run = () => enrichMissingMetadata({ limit: Number(process.env.NIBGATE_METADATA_ENRICH_BATCH || 8) })
    .then((r) => { if (r?.enriched) console.log(`Metadata enricher: cycle enriched ${r.enriched}/${r.considered}`); })
    .catch((e) => console.log('Metadata enricher cycle failed:', e.message));
  setTimeout(() => {
    run();
    setInterval(run, intervalMs).unref?.();
  }, initialDelayMs).unref?.();
}
