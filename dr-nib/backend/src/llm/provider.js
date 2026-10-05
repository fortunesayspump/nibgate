// The LLM seam.
//
// Dr. Nib does not select models. It calls the JEV router
// (`typesafe/jev-router` on OpenRouter — the same key JEV decisions use), which
// chooses the model and reasoning effort per request. What the pipeline
// controls here is *intensity* via `reasoning_effort`, never a model id.
//
// Everything the pipeline needs is here: routing, streaming, timeouts, and
// usage metering, so no stage builds a request by hand.
//
// This module is deliberately transport-only. It has no opinion about prompts
// (see prompts.js) and never decides anything — the model here generates, JEV
// decides. Callers own thresholds and fallbacks.
import { costUsd, defaultEffort, EFFORTS, fallbackModels, routerModel } from './pricing.js';

export function llmConfig() {
  const baseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  return {
    baseUrl,
    apiKey: process.env.OPENROUTER_API_KEY || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 120_000),
    appName: process.env.LLM_APP_NAME || 'Dr. Nib',
    siteUrl: process.env.LLM_SITE_URL || 'https://nibgate.xyz',
  };
}

export function isLlmConfigured() {
  return Boolean(llmConfig().apiKey);
}

export class LlmError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.code = code;
  }
}

function normalizeUsage(usage, model) {
  const promptTokens = Number(usage?.prompt_tokens ?? usage?.promptTokens ?? 0) || 0;
  const completionTokens = Number(usage?.completion_tokens ?? usage?.completionTokens ?? 0) || 0;
  const totalTokens = Number(usage?.total_tokens ?? usage?.totalTokens ?? promptTokens + completionTokens) || 0;
  const providerCost = usage?.cost;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: costUsd({ model, promptTokens, completionTokens, providerCost }),
  };
}
// A timeout and an optional caller signal, merged into the signal fetch sees.
function withTimeout(timeoutMs, external) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('LLM request timed out')), timeoutMs);
  const onAbort = () => controller.abort(external.reason);
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done() {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onAbort);
    },
  };
}

async function readError(res) {
  let body = '';
  try { body = (await res.text()).slice(0, 300); } catch {}
  const err = new LlmError(`LLM HTTP ${res.status}: ${body}`, { status: res.status, code: 'http_error' });
  err.guidance = httpGuidance(res.status, body);
  return err;
}

/**
 * Translate provider HTTP failures into the human action that fixes them.
 * A raw JSON blob sends nobody anywhere; every known failure names its fix.
 */
export function httpGuidance(status, body = '') {
  const b = String(body || '');
  if (status === 403 && /18\+|age|confirm/i.test(b)) {
    return 'OpenRouter gated this model behind 18+ age confirmation — confirm once on the OpenRouter account, or set LLM_FALLBACK_MODELS so gated picks fail over automatically.';
  }
  if (status === 401) return 'OpenRouter rejected the API key — check OPENROUTER_API_KEY.';
  if (status === 402) return 'OpenRouter reports insufficient credits — top up or lower call volume.';
  if (status === 429) return 'Rate limited by the provider — back off and retry; raise key limits if it persists.';
  if (status >= 500) return 'Provider-side outage — fallback models engage automatically; nothing to fix locally.';
  return '';
}

// Parse one SSE event block (`data: {...}` possibly split over lines).
function parseSseBlock(block) {
  const dataLines = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
  if (!dataLines.length) return null;
  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return { done: true };
  try { return { chunk: JSON.parse(payload) }; } catch { return null; }
}

/**
 * Run one chat completion through the JEV router.
 *
 * @param {object} opts
 * @param {string} [opts.model]        override the router (rare; a full swap)
 * @param {'low'|'medium'|'high'|'xhigh'|'max'} [opts.effort]  intensity
 * @param {Array<{role:string, content:string}>} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.json]        ask for a JSON object response
 * @param {(delta:string)=>void} [opts.onToken]  stream deltas as they arrive
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.fetchImpl]  injectable transport (tests)
 * @returns {Promise<{text:string, model:string, effort:string, usage:object, raw:object}>}
 */
export async function chat(opts) {
  const {
    model = routerModel(),
    effort = defaultEffort(),
    messages,
    temperature = 0.2,
    maxTokens = 1024,
    json = false,
    onToken,
    signal,
    fetchImpl = fetch,
  } = opts || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LlmError('messages are required', { code: 'bad_request' });
  }
  if (effort && !EFFORTS.includes(effort)) {
    throw new LlmError(`unknown reasoning effort: ${effort}`, { code: 'bad_request' });
  }

  const cfg = llmConfig();
  if (!cfg.apiKey) throw new LlmError('LLM is not configured', { code: 'unconfigured' });

  const stream = typeof onToken === 'function';
  const fallbacks = fallbackModels();
  // Server-side failover, not a client retry loop: OpenRouter tries `models`
  // in order and only charges for the model that actually served — so a lost
  // response can never double-spend, which a naive "catch and call again"
  // cannot guarantee. With no fallbacks configured this is just { model }.
  const body = {
    ...(fallbacks.length ? { models: [model, ...fallbacks] } : { model }),
    messages,
    temperature,
    max_tokens: maxTokens,
    // The router's intensity lever. It decides the model; we decide how hard
    // this particular call should be thought about.
    ...(effort ? { reasoning_effort: effort } : {}),
    ...(stream ? { stream: true } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

  const { signal: merged, done } = withTimeout(cfg.timeoutMs, signal);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        'HTTP-Referer': cfg.siteUrl,
        'X-Title': cfg.appName,
      },
      body: JSON.stringify(body),
      signal: merged,
    });
    if (!res.ok) throw await readError(res);

    if (!stream) {
      const data = await res.json();
      const choice = data?.choices?.[0];
      const served = String(data?.model || model);
      return {
        text: choice?.message?.content ?? '',
        model: served,
        effort,
        usage: normalizeUsage(data?.usage, served),
        raw: data,
      };
    }

    let text = '';
    let usage = {};
    let resolvedModel = model;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const parsed = parseSseBlock(block);
        if (!parsed) continue;
        if (parsed.done) { buffer = ''; break; }
        const chunk = parsed.chunk;
        if (chunk?.model) resolvedModel = String(chunk.model);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta) { text += delta; onToken(delta); }
        if (chunk?.usage) usage = chunk.usage;
      }
    }
    return { text, model: resolvedModel, effort, usage: normalizeUsage(usage, resolvedModel), raw: {} };
  } finally {
    done();
  }
}

/** Extract the first JSON value from a model reply (fenced or bare).
 * Balanced-brace scan: finds the first complete JSON value starting at the
 * first `{`/`[`, ignoring braces inside strings and any surrounding prose.
 * If the reply was cut off mid-value (unbalanced), best-effort closes the
 * open brackets and parses — a truncated-but-valid prefix beats a crash. */
export function parseJsonReply(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new LlmError('no JSON found in reply', { code: 'parse_error' });
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch (e) {
          throw new LlmError(`invalid JSON in reply: ${e.message}`, { code: 'parse_error' });
        }
      }
    }
  }
  // Unbalanced: reply cut off mid-value. Close what's open and try the prefix —
  // first as-is (cut between values), then with the string closed (cut inside
  // a string value). A truncated-but-valid prefix beats a crashed run.
  const closers = depth > 0 ? close.repeat(Math.min(depth, 32)) : '';
  const attempts = inStr
    ? [candidate.slice(start) + '"' + closers, candidate.slice(start) + closers]
    : [candidate.slice(start) + closers];
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch { /* try next */ }
  }
  throw new LlmError('unbalanced JSON in reply', { code: 'parse_error' });
}

/** Run a completion that must return JSON, with one repair retry. Failures
 * carry the raw replies (truncated) so callers can log WHAT the model said
 * instead of just that parsing failed — unlogged rambles can't be tuned. */
export async function chatJson(opts) {
  const first = await chat({ ...opts, json: true });
  try {
    return { data: parseJsonReply(first.text), usage: first.usage, model: first.model, text: first.text };
  } catch {
    const repair = await chat({
      ...opts,
      json: true,
      messages: [
        ...opts.messages,
        { role: 'assistant', content: first.text },
        { role: 'user', content: 'That was not valid JSON. Reply with only the JSON object, no prose or code fences.' },
      ],
    });
    try {
      return { data: parseJsonReply(repair.text), usage: repair.usage, model: repair.model, text: repair.text };
    } catch (err) {
      err.replyPreview = [first.text, repair.text].map((t) => String(t || '').slice(0, 300)).join('\n---RETRY---\n');
      throw err;
    }
  }
}
