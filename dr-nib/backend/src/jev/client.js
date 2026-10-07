// JEV client — the decision seat.
//
// The language model generates; JEV decides. This is the transport to that
// decision model, reached through the hub (the key stays on the hub, and the
// hub already rate-limits and sizes these calls). Dr. Nib never calls an LLM to
// make a judgement — it asks JEV for per-option probabilities and acts on the
// pick.
//
// Contract (hub routes, see backend/src/server/routes/hub-routes.js):
//   POST {hub}/api/hub/jev/decide   { state, instructions, candidates, questionId }
//        -> { success, choice, confidence, probabilities, model, usage }
//   POST {hub}/api/hub/jev/classify { state, instructions }
//        -> { success, probability, model, usage }
//
// A failure here is not a soft failure. FLOW.md is explicit: if JEV is
// unreachable the run parks; it must never quietly fall back to letting the
// model decide. Callers get a typed JevUnavailable and are expected to pause.

export function jevConfig() {
  return {
    hubApiUrl: (process.env.HUB_API_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    timeoutMs: Number(process.env.JEV_TIMEOUT_MS || 60_000),
  };
}

export class JevUnavailable extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'JevUnavailable';
    this.status = status;
  }
}

async function post(path, body, { fetchImpl = fetch } = {}) {
  const cfg = jevConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('JEV request timed out')), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.hubApiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new JevUnavailable(`JEV ${path} HTTP ${res.status}: ${text.slice(0, 200)}`, { status: res.status });
    }
    return await res.json();
  } catch (err) {
    if (err instanceof JevUnavailable) throw err;
    throw new JevUnavailable(`JEV ${path} unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Choose one option over a described state. `candidates` are the real
 * trade-offs the model must weigh — including the honest "do nothing / proceed
 * and flag the assumption" option, because JEV can only distribute probability
 * across what it is shown.
 *
 * @returns {{pick:string, confidence:number, probabilities:Record<string,number>, model:string, usage:object|null}}
 * @throws {JevUnavailable}
 */
export async function decide({ state, instructions, candidates, questionId = 'choice' }, opts) {
  const data = await post('/api/hub/jev/decide', {
    state: String(state || '').slice(0, 4000),
    instructions: String(instructions || '').slice(0, 500),
    candidates: (candidates || []).map((c) => ({ id: String(c.id), context: String(c.context || '').slice(0, 2000) })),
    questionId,
  }, opts);
  return {
    pick: data.choice,
    confidence: Number(data.confidence) || 0,
    probabilities: data.probabilities || {},
    model: data.model || null,
    usage: data.usage || null,
  };
}

/** A single calibrated 0..1 judgment. @throws {JevUnavailable} */
export async function classify({ state, instructions }, opts) {
  const data = await post('/api/hub/jev/classify', {
    state: String(state || '').slice(0, 4000),
    instructions: String(instructions || '').slice(0, 500),
  }, opts);
  return { probability: Number(data.probability) || 0, model: data.model || null, usage: data.usage || null };
}

/**
 * Ordered-scale grade (Score primitive): where the input falls on the
 * caller's 2-6 levels. Returns the probability-weighted position plus
 * per-level probabilities and confidence. Grades RANK, they never gate —
 * a low grade reorders sources, it doesn't refuse them.
 * @throws {JevUnavailable}
 */
export async function grade({ state, instructions, levels }, opts) {
  const data = await post('/api/hub/jev/score', {
    state: String(state || '').slice(0, 4000),
    instructions: String(instructions || '').slice(0, 500),
    levels: (levels || []).map((l) => String(l || '').slice(0, 200)).slice(0, 6),
  }, opts);
  const probs = {};
  for (const [k, v] of Object.entries(data.probabilities || {})) {
    const n = Number(v);
    if (Number.isFinite(n)) probs[k] = Math.min(1, Math.max(0, n));
  }
  return { score: Number(data.score), confidence: Number(data.confidence) || 0, probabilities: probs, model: data.model || null, usage: data.usage || null };
}

/**
 * A batch of independent judgments in one model round trip: each entry is a
 * choice or noul question with a stable id. The hub answers every entry and
 * returns the model + usage once for the batch.
 * @returns {Promise<{answers:object, model:string|null, usage:object|null}>}
 * @throws {JevUnavailable}
 */
export async function batch({ state, questions }, opts) {
  const data = await post('/api/hub/jev/batch', {
    state: String(state || '').slice(0, 4000),
    questions: (questions || []).map((q) => ({
      id: String(q.id),
      type: q.type,
      instructions: String(q.instructions || '').slice(0, 500),
      ...(q.type === 'choice'
        ? { options: (q.options || []).map((o) => ({ id: String(o.id), description: String(o.description || '').slice(0, 500) })) }
        : {}),
    })),
  }, opts);
  return { answers: data.answers || {}, model: data.model || null, usage: data.usage || null };
}
