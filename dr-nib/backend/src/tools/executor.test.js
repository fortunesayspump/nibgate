import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db.js';
import { runTool, toolNames, toolSpecs } from './executor.js';

const RUN = 'aaaaaaaa-0000-4000-8000-0000000000c1';

async function wipe() {
  await db.researchEvent.deleteMany({ where: { runId: RUN } });
  await db.researchStep.deleteMany({ where: { runId: RUN } });
  await db.researchSource.deleteMany({ where: { runId: RUN } });
  await db.researchDecision.deleteMany({ where: { runId: RUN } });
  await db.budgetLedger.deleteMany({ where: { runId: RUN } });
  await db.researchReport.deleteMany({ where: { runId: RUN } });
  await db.researchRun.deleteMany({ where: { id: RUN } });
}

beforeEach(async () => {
  await wipe();
  await db.researchRun.create({ data: { id: RUN, userId: 'user-1', brief: { topic: 't' }, status: 'running' } });
});
afterEach(wipe);

describe('tool registry', () => {
  it('advertises exactly the instruments, each with a cost model', () => {
    expect(toolNames().sort()).toEqual(['compute', 'http_request', 'run_code', 'search_sources', 'web_fetch', 'web_search']);
    for (const spec of toolSpecs()) {
      expect(spec.description.length).toBeGreaterThan(20);
      expect(['metered', 'zero']).toContain(spec.cost);
    }
  });

  it('reports run_code unavailable when sandbox execution is not configured', async () => {
    const out = await runTool(RUN, 'run_code', { command: 'echo hi' });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not configured|unavailable/);
  });
});

describe('runTool', () => {
  it('rejects an unknown tool without touching the audit log', async () => {
    const out = await runTool(RUN, 'bash', { command: 'rm -rf /' });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/unknown tool/);
    expect(await db.researchEvent.count({ where: { runId: RUN } })).toBe(0);
  });

  it('rejects missing input before any execution', async () => {
    const fetchImpl = vi.fn();
    const out = await runTool(RUN, 'web_search', {}, { fetchImpl });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/missing required input: query/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a denied domain before any network call', async () => {
    const fetchImpl = vi.fn();
    const out = await runTool(RUN, 'web_fetch', { urls: ['https://evil.com/steal'] }, { policy: { deny: ['evil.com'] }, fetchImpl });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/domain-denied/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('runs web_search, meters the provider cost, and logs the call', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    try {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        json: async () => ({ results: [{ url: 'https://a.com', title: 'A', content: 's', score: 0.9 }], usage: { credits: 1 } }),
        text: async () => '',
      });
      const out = await runTool(RUN, 'web_search', { query: 'x402', includeAcademic: false }, { fetchImpl });
      expect(out.ok).toBe(true);
      expect(out.output.results).toHaveLength(1);
      expect(out.costUsd).toBeCloseTo(0.008, 6);
      const events = await db.researchEvent.findMany({ where: { runId: RUN } });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool.call');
      expect(events[0].payload.tool).toBe('web_search');
      expect(events[0].payload.costUsd).toBeCloseTo(0.008, 6);
    } finally {
      // A stub that survives this test would silently reconfigure every file
      // after it — unstub even on failure.
      vi.unstubAllEnvs();
    }
  });

  it('searches the run’s own evidence without touching the network', async () => {
    await db.researchSource.createMany({
      data: [
        { runId: RUN, url: 'https://a.com/x402-fees', title: 'x402 fee schedule', domain: 'a.com', relevance: 0.9 },
        { runId: RUN, url: 'https://b.com/cats', title: 'cats', domain: 'b.com', relevance: 0.1 },
      ],
    });
    const fetchImpl = vi.fn();
    const out = await runTool(RUN, 'search_sources', { query: 'x402 fees' }, { fetchImpl });
    expect(out.ok).toBe(true);
    expect(out.costUsd).toBe(0);
    expect(out.output.matches[0].url).toBe('https://a.com/x402-fees');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('computes over caller-supplied data with zero cost', async () => {
    const out = await runTool(RUN, 'compute', { code: 'input.a * input.b', input: { a: 6, b: 7 } });
    expect(out.ok).toBe(true);
    expect(out.output.result).toBe(42);
    expect(out.costUsd).toBe(0);
  });
});
