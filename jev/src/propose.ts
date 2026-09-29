import type { JevOption } from './schema.js';

// LLM proposer: turns an open-ended task into scored JevOptions for decide().
// Provider is env-selected, both speak OpenAI-compatible chat JSON:
//   JEV_LLM_PROVIDER=vercel|openrouter   (default: openrouter)
//   AI_GATEWAY_API_KEY=...               (Vercel AI Gateway key)
//   OPENROUTER_API_KEY=...               (OpenRouter key)
//   JEV_MODEL=...                        (default per provider below;
//     openrouter default is the purpose-built JEV router model)
//
// resolveFetch lets tests inject a stub; production passes global fetch.

export interface ProposeRequest {
  /** What to decide about, in plain language. */
  task: string;
  /** Candidate pool the model must score (it must not invent new ids). */
  candidates: Array<{ id: string; kind: string; cost: number; context: string }>;
  /** Signals to score per candidate, e.g. ['relevance','uniqueness','confidence']. */
  signals: string[];
  /** Extra policy hints in prose (budget, domain rules). */
  hints?: string;
}

export interface ProposeResult {
  options: JevOption[];
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

function providerConfig() {
  const provider = (process.env.JEV_LLM_PROVIDER || 'openrouter').toLowerCase();
  if (provider === 'openrouter') {
    return {
      provider,
      baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      model: process.env.JEV_MODEL || 'typesafe/jev-router',
    };
  }
  return {
    provider: 'vercel',
    baseUrl: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    apiKey: process.env.AI_GATEWAY_API_KEY || '',
    model: process.env.JEV_MODEL || 'openai/gpt-4o-mini',
  };
}

function systemPrompt(): string {
  return [
    'You score candidates for a deterministic decision engine.',
    'Reply with JSON ONLY: {"options":[{"id": string, "scores": {signal: number 0..1}}]}.',
    'Use EXACTLY the candidate ids given. Score every listed signal per option.',
    'Never invent candidates, costs, or actions — scoring only.',
  ].join('\n');
}

/** Propose scored options. Throws on transport errors; callers decide retry. */
export async function propose(
  req: ProposeRequest,
  fetchFn?: FetchFn,
): Promise<ProposeResult> {
  const cfg = providerConfig();
  if (!cfg.apiKey) throw new Error(`missing API key for provider '${cfg.provider}'`);
  const fetchImpl = (fetchFn || fetch) as FetchFn;

  const user = [
    `TASK: ${req.task}`,
    `SIGNALS: ${req.signals.join(', ')}`,
    req.hints ? `HINTS: ${req.hints}` : '',
    'CANDIDATES:',
    ...req.candidates.map(
      (c) => `- id=${c.id} kind=${c.kind} cost=${c.cost} :: ${c.context.slice(0, 500)}`,
    ),
  ].join('\n');

  const res = await fetchImpl(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`${cfg.provider} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as {
    options?: Array<{ id: string; scores?: Record<string, number> }>;
  };
  const byId = new Map(req.candidates.map((c) => [c.id, c]));
  const options: JevOption[] = (parsed.options || [])
    .filter((o) => byId.has(o.id))
    .map((o) => {
      const c = byId.get(o.id)!;
      const scores: Record<string, number> = {};
      for (const s of req.signals) {
        const v = Number(o.scores?.[s]);
        scores[s] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
      }
      return { id: c.id, kind: c.kind, cost: c.cost, scores, meta: { provider: cfg.provider, model: cfg.model } };
    });
  if (!options.length) throw new Error('proposer returned no usable options');
  return {
    options,
    model: cfg.model,
    usage: data.usage
      ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
      : undefined,
  };
}
