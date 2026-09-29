import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({ content: { findMany: vi.fn(), update: vi.fn() } }));
const jevMock = vi.hoisted(() => ({ askNoulBatch: vi.fn() }));

vi.mock('@nibgate/internal/db.js', () => ({ db: dbMock }));
vi.mock('../../../../jev/src/decisions.ts', () => jevMock);

const { enrichMissingMetadata, candidateTagsFor, TAG_VOCABULARY } = await import('./metadata.js');

describe('metadata enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.content.update.mockResolvedValue({});
  });

  it('candidateTagsFor puts vocabulary found in text first, dedupes, caps', () => {
    const tags = candidateTagsFor({ title: 'Brewing coffee with a Technologist', description: 'software and espresso' }, 10);
    expect(tags[0]).toBe('software'); // vocabulary word present in the description
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.length).toBeLessThanOrEqual(10);
    expect(tags).toContain('coffee'); // salient title token
  });

  it('scores candidates and writes confident top-k as tentative', async () => {
    dbMock.content.findMany.mockResolvedValue([
      { id: 'c1', title: 'Coffee brewing', description: 'espresso and beans', contentType: 'article', path: '/x', website: { name: 'Cafe', domain: 'cafe.test' } },
    ]);
    // t0=coffee 0.9, t1=writing 0.1 ... make coffee high, others low.
    jevMock.askNoulBatch.mockImplementation(async ({ questions }) => {
      const answers = {};
      questions.forEach((q, i) => { answers[q.id] = i === 0 ? 0.9 : 0.1; });
      return { answers, model: 'typesafe/jev-1.13' };
    });

    const out = await enrichMissingMetadata({ limit: 5, topK: 2, minProbability: 0.5 });
    expect(out.enriched).toBe(1);
    expect(out.model).toBe('typesafe/jev-1.13');
    const update = dbMock.content.update.mock.calls[0][0];
    expect(update.where.id).toBe('c1');
    expect(update.data.tagsTentative).toBe(true);
    expect(update.data.tags.split(',').length).toBe(1); // only the 0.9 tag clears 0.5
  });

  it('skips a row when nothing clears the threshold', async () => {
    dbMock.content.findMany.mockResolvedValue([
      { id: 'c2', title: 'Mystery', description: '', contentType: 'article', path: '/y', website: { name: '', domain: 'x.test' } },
    ]);
    jevMock.askNoulBatch.mockResolvedValue({ answers: {}, model: 'm' });
    const out = await enrichMissingMetadata({ limit: 5 });
    expect(out.enriched).toBe(0);
    expect(dbMock.content.update).not.toHaveBeenCalled();
  });

  it('is a no-op with no thin content', async () => {
    dbMock.content.findMany.mockResolvedValue([]);
    const out = await enrichMissingMetadata({});
    expect(out).toEqual({ considered: 0, enriched: 0, model: null });
  });

  it('survives a per-row model failure', async () => {
    dbMock.content.findMany.mockResolvedValue([
      { id: 'c3', title: 'Coffee', description: '', contentType: 'article', path: '/z', website: { name: '', domain: 'x.test' } },
    ]);
    jevMock.askNoulBatch.mockRejectedValue(new Error('provider down'));
    const out = await enrichMissingMetadata({ limit: 5 });
    expect(out.enriched).toBe(0);
    expect(out.considered).toBe(1);
  });

  it('exposes a non-trivial vocabulary', () => {
    expect(TAG_VOCABULARY.length).toBeGreaterThan(30);
    expect(new Set(TAG_VOCABULARY).size).toBe(TAG_VOCABULARY.length);
  });
});
