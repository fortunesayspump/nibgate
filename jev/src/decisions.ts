// JEV decisions client — the REAL JEV model, not a chat proxy.
//
// TypeSafe's JEV models (`~typesafe/jev-latest`, `typesafe/jev-1.13`) are
// *decisions* models: they are NOT callable via /chat/completions. They answer
// structured questions over a `state` and return calibrated answers:
//
//   POST https://openrouter.ai/api/alpha/decisions
//   { model, state: string|record|array, questions: { <id>: Question } }
//
// Question kinds (discriminated on `type`):
//   choice — criteria is a RECORD of {optionId: description}; the model picks
//            one id and returns per-option probabilities + confidence.
//   score  — criteria is an ARRAY; returns a numeric score.
//   noul   — no criteria; returns a single probability 0..1.
//
// Env:
//   OPENROUTER_API_KEY=...
//   JEV_DECISIONS_URL=https://openrouter.ai/api/alpha/decisions   (override)
//   JEV_DECISIONS_MODEL=~typesafe/jev-latest                      (override)
//
// The model makes the constrained pick; callers still own the threshold and
// any downstream deterministic gates. resolveFetch lets tests inject a stub.

export interface DecisionsUsage {
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface DecisionsResult {
  model: string;
  answers: Record<string, unknown>;
  usage?: DecisionsUsage;
  id?: string;
  provider?: string;
  raw: unknown;
}

type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export function decisionsConfig() {
  return {
    provider: 'openrouter-decisions',
    url: process.env.JEV_DECISIONS_URL || 'https://openrouter.ai/api/alpha/decisions',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.JEV_DECISIONS_MODEL || '~typesafe/jev-latest',
  };
}

function normalizeUsage(u: unknown): DecisionsUsage | undefined {
  if (!u || typeof u !== 'object') return undefined;
  const r = u as Record<string, unknown>;
  const out: DecisionsUsage = {};
  if (Number.isFinite(Number(r.input_tokens))) out.inputTokens = Number(r.input_tokens);
  if (Number.isFinite(Number(r.output_tokens))) out.outputTokens = Number(r.output_tokens);
  if (Number.isFinite(Number(r.cost))) out.cost = Number(r.cost);
  return Object.keys(out).length ? out : undefined;
}

/** Raw decisions call. Throws on transport/HTTP errors; callers decide retry. */
export async function decisions(
  req: { state: unknown; questions: Record<string, unknown>; model?: string },
  fetchFn?: FetchFn,
): Promise<DecisionsResult> {
  const cfg = decisionsConfig();
  if (!cfg.apiKey) throw new Error('missing OPENROUTER_API_KEY for JEV decisions');
  const fetchImpl = (fetchFn || fetch) as FetchFn;
  const res = await fetchImpl(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: req.model || cfg.model, state: req.state, questions: req.questions }),
  });
  if (!res.ok) throw new Error(`jev decisions HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Record<string, unknown>;
  return {
    model: String(data.model || req.model || cfg.model),
    answers: (data.answers as Record<string, unknown>) || {},
    usage: normalizeUsage(data.usage),
    id: typeof data.id === 'string' ? data.id : undefined,
    provider: typeof data.provider === 'string' ? data.provider : undefined,
    raw: data,
  };
}

export interface ChooseOptionInput {
  /** Free-form situation the model reasons over (page, signals, evidence). */
  state: string | Record<string, unknown> | unknown[];
  /** What the choice is about, in plain language. */
  instructions: string;
  /** Candidate ids + the evidence describing each (becomes choice criteria). */
  options: Array<{ id: string; description: string }>;
  /** Optional question key; defaults to 'choice'. */
  questionId?: string;
  model?: string;
}

export interface ChooseOptionResult {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
  usage?: DecisionsUsage;
}

/**
 * Ask JEV to pick ONE of the given option ids. Returns null when the model
 * returns no usable answer. Never invents ids: the chosen id must be one of
 * the supplied options.
 */
export async function chooseOption(
  input: ChooseOptionInput,
  fetchFn?: FetchFn,
): Promise<ChooseOptionResult | null> {
  if (!input.options?.length) return null;
  const qid = input.questionId || 'choice';
  const criteria: Record<string, string> = {};
  for (const o of input.options) criteria[o.id] = String(o.description || '').slice(0, 500);
  const result = await decisions(
    {
      state: input.state,
      model: input.model,
      questions: { [qid]: { type: 'choice', instructions: input.instructions, criteria } },
    },
    fetchFn,
  );
  const answer = result.answers?.[qid] as Partial<ChoiceAnswer> | undefined;
  const raw = String(answer?.choice || '');
  // Resolve case-insensitively against the supplied ids (addresses vary case).
  const matched = input.options.find((o) => o.id === raw) || input.options.find((o) => o.id.toLowerCase() === raw.toLowerCase());
  if (!matched) return null;
  const probabilities: Record<string, number> = {};
  const src = (answer?.probabilities as Record<string, number>) || {};
  for (const [k, v] of Object.entries(src)) {
    const m = input.options.find((o) => o.id === k) || input.options.find((o) => o.id.toLowerCase() === k.toLowerCase());
    probabilities[m ? m.id : k] = v;
  }
  return {
    choice: matched.id,
    confidence: Number.isFinite(Number(answer?.confidence)) ? Number(answer?.confidence) : 0,
    probabilities,
    model: result.model,
    usage: result.usage,
  };
}
