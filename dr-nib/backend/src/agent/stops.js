// Termination policy for the tool loop — the OR-disjunction of stop reasons,
// enforced in code, never in prompt prose. "Stop when you have enough" is
// unreliable as an instruction; each predicate below is a cheap function of
// the trajectory evaluated by the driver every turn. First match wins and is
// logged as the run's stopReason so thresholds can be tuned from data.
//
// Predicates come in two kinds:
//   deterministic — budgets, fingerprints, streaks, coverage. Free, exact.
//   model-shaped  — the evidence checklist (one LLM call per run, up front).
//                   Coverage against it is deterministic keyword matching.
import { chat } from '../llm/provider.js';

/** Canonical fingerprint: key order must not defeat duplicate detection. */
export function fingerprint(tool, input) {
  return `${tool}:${stable(input ?? {})}`;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const WORD = /[a-z0-9]{5,}/g;
const STOPWORDS = new Set('about after before between could every other their there these those through under which while with would current right quote those'.split(' '));

/** Token-set Jaccard on normalized text. 1 = identical, 0 = disjoint. */
export function similarity(a, b) {
  const ta = new Set(String(a || '').toLowerCase().match(WORD) || []);
  const tb = new Set(String(b || '').toLowerCase().match(WORD) || []);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

/**
 * One LLM call per run: what concrete facts would answer this task?
 * Returns max 5 short items, or null when the extractor fails — a run must
 * never die because its scaffolding did. Falls back to null, not to guesses.
 */
export async function extractChecklist(task, { fetchImpl } = {}) {
  try {
    const { text } = await chat({
      effort: 'low',
      messages: [
        { role: 'system', content: 'List the concrete facts needed to answer the task. Reply with up to 5 short lines, one fact per line, no numbering, no prose. Each line must name measurable nouns or numbers (e.g. "Arc testnet base fee in gwei").' },
        { role: 'user', content: task.slice(0, 800) },
      ],
      temperature: 0,
      maxTokens: 200,
      fetchImpl,
    });
    const items = String(text || '').split('\n').map((l) => l.replace(/^[-*\d.)\s]+/, '').trim()).filter((l) => l.length > 3).slice(0, 5);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

/** Keywords that identify a checklist item in observation text. */
export function itemKeywords(item) {
  const words = String(item || '').toLowerCase().match(WORD) || [];
  return [...new Set(words.filter((w) => !STOPWORDS.has(w)))];
}

/**
 * Deterministic coverage: item covered when at least half its keywords
 * (minimum 1) appear anywhere in the successful observations so far.
 */
export function coverage(checklist, observations) {
  if (!checklist?.length) return { covered: [], missing: [] };
  const hay = observations.join('\n').toLowerCase();
  const covered = [];
  const missing = [];
  for (const item of checklist) {
    const kw = itemKeywords(item);
    const need = Math.max(1, Math.floor(kw.length / 2));
    const hits = kw.filter((k) => hay.includes(k)).length;
    (hits >= need ? covered : missing).push(item);
  }
  return { covered, missing };
}
