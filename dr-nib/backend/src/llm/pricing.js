// Model access is a single router, not a set of pinned models.
//
// Dr. Nib does not choose models. It calls `typesafe/jev-router` on OpenRouter,
// which "picks the best model and reasoning effort for each request, balancing
// quality, speed, and cost". What the pipeline controls is *intensity* — how
// hard the router should think about a given call — expressed as
// `reasoning_effort`, not which model runs.
//
// This is a different axis from **depth**. Depth (quick / standard / deep) is a
// property of the *research*: how wide the branch tree grows, how many
// generations deep it goes, how many sources it opens. It is metered in the
// budget, not in model selection, and it must never be wired to a model id.
//
// Cost comes from the provider: OpenRouter returns a `cost` field on every
// response, including the final stream chunk. The fallback below exists only so
// a missing cost cannot make the ledger silently under-charge.

export const DEFAULT_ROUTER_MODEL = 'typesafe/jev-router';

/** The model the pipeline calls. One router; override only for a full swap. */
export function routerModel() {
  return process.env.LLM_MODEL || DEFAULT_ROUTER_MODEL;
}

/**
 * The model for judgement-heavy generation: intake questions, plans, round
 * reviews. These shape everything downstream, so they stay on the chat router
 * even when bulk writing moves to a cheap pinned model — a looping cheap
 * intake burns more (endless rounds, no convergence) than a converging
 * smart one. Override with LLM_SMART_MODEL for a full swap.
 *
 * NOTE: this must be a chat-completions model. `typesafe/jev-router` is a
 * decisions router: sent with the `models` fallback array OpenRouter 400s
 * the whole request ("cannot be combined with another router model"), which
 * silently banked every intake and plan on prod. Never default back to it.
 */
export function smartModel() {
  return process.env.LLM_SMART_MODEL || routerModel();
}

/**
 * Explicit fallback models, tried in order when the router itself errors
 * (rate-limit, downtime, moderation, context length). The router already
 * carries its own internal fallbacks, so this is normally empty — set it when
 * a run must survive even a router-level outage. Comma-separated model ids.
 */
export function fallbackModels() {
  return String(process.env.LLM_FALLBACK_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// How hard to think. The router interprets this against the request; it is the
// pipeline's only intensity lever.
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export function defaultEffort() {
  const e = String(process.env.LLM_REASONING_EFFORT || 'medium').toLowerCase();
  return EFFORTS.includes(e) ? e : 'medium';
}

// Conservative blended USD/1M tokens, used ONLY when the provider returns
// tokens but no cost. High by design: an over-estimate that gets refunded on
// settle is honest; an under-estimate would spend money the run did not hold.
const ROUTER_FALLBACK = { input: 3, output: 15 };

/** Best-effort USD cost for a call. Prefers the provider's own number. */
export function costUsd({ promptTokens = 0, completionTokens = 0, providerCost }) {
  if (Number.isFinite(Number(providerCost)) && Number(providerCost) >= 0) return Number(providerCost);
  return (promptTokens / 1_000_000) * ROUTER_FALLBACK.input + (completionTokens / 1_000_000) * ROUTER_FALLBACK.output;
}
