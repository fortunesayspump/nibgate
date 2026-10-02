import { afterEach, describe, expect, it, vi } from 'vitest';
import { classify, decide, jevConfig, JevUnavailable } from './client.js';

function ok(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}
function fail(status, body = 'nope') {
  return { ok: false, status, json: async () => ({}), text: async () => body };
}

afterEach(() => vi.unstubAllEnvs());

describe('jev config', () => {
  it('trims a trailing slash off the hub url', () => {
    vi.stubEnv('HUB_API_URL', 'http://localhost:3000/');
    expect(jevConfig().hubApiUrl).toBe('http://localhost:3000');
  });
});

describe('decide', () => {
  it('maps candidates and returns the pick with probabilities', async () => {
    vi.stubEnv('HUB_API_URL', 'http://hub.test');
    const fetchImpl = vi.fn().mockResolvedValue(ok({
      success: true,
      choice: 'expand',
      confidence: 0.71,
      probabilities: { write: 0.29, expand: 0.71 },
      model: '~typesafe/jev-latest',
      usage: { cost: 0.0004 },
    }));
    const out = await decide({
      state: 'collected 3 sources',
      instructions: 'write or expand?',
      candidates: [{ id: 'write', context: 'enough' }, { id: 'expand', context: 'gap remains' }],
      questionId: 'search-done',
    }, { fetchImpl });

    expect(out.pick).toBe('expand');
    expect(out.probabilities.expand).toBe(0.71);
    expect(out.model).toBe('~typesafe/jev-latest');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://hub.test/api/hub/jev/decide');
    const sent = JSON.parse(init.body);
    expect(sent.candidates).toEqual([
      { id: 'write', context: 'enough' },
      { id: 'expand', context: 'gap remains' },
    ]);
    expect(sent.questionId).toBe('search-done');
  });

  it('surfaces a hub error as JevUnavailable with the status', async () => {
    vi.stubEnv('HUB_API_URL', 'http://hub.test');
    const fetchImpl = vi.fn().mockResolvedValue(fail(502, 'No usable decision returned.'));
    await expect(decide({ state: 's', instructions: 'i', candidates: [{ id: 'a', context: 'a' }, { id: 'b', context: 'b' }] }, { fetchImpl }))
      .rejects.toMatchObject({ name: 'JevUnavailable', status: 502 });
  });

  it('surfaces a transport failure as JevUnavailable', async () => {
    vi.stubEnv('HUB_API_URL', 'http://hub.test');
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(decide({ state: 's', instructions: 'i', candidates: [{ id: 'a', context: 'a' }] }, { fetchImpl }))
      .rejects.toBeInstanceOf(JevUnavailable);
  });
});

describe('classify', () => {
  it('returns a calibrated probability', async () => {
    vi.stubEnv('HUB_API_URL', 'http://hub.test');
    const fetchImpl = vi.fn().mockResolvedValue(ok({ success: true, probability: 0.83, model: 'm' }));
    const out = await classify({ state: 'a page', instructions: 'is this content?' }, { fetchImpl });
    expect(out.probability).toBe(0.83);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://hub.test/api/hub/jev/classify');
  });
});
