// Generation with a deterministic fallback.
//
// Each function here is the *advisory* half of a stage: it asks the model to
// produce something, and if the model is unavailable or answers unusably it
// falls back to a fixed, honest stand-in so the pipeline, the ledger, and the
// SSE contract keep working. The caller decides what to do with the result; the
// fallback never pretends the model spoke.
import { chat, chatJson, isLlmConfigured } from './provider.js';
import { introMessages, conclusionMessages, planMessages, reportMessages, roundReviewMessages, sectionMessages, thinkingMessages, intakeQuestionMessages, directDataMessages } from './prompts.js';
import { maxTokensForWords, resolveLength, wordsPerSection } from '../length.js';

const cleanStrings = (v, cap = 12) =>
  (Array.isArray(v) ? v : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, cap);

/**
 * Plan the run: sub-questions, uncertainties, and a cost rationale.
 * High intensity — this shapes everything downstream, and the plan is written
 * once and then edited by the user. Depth (quick/standard/deep) is a separate
 * axis: it sizes the research tree, not this call.
 */
export async function generatePlan({ brief, guidance, fetchImpl } = {}) {
  if (isLlmConfigured()) {
    try {
      const { data, usage, model } = await chatJson({
        effort: 'high',
        messages: planMessages({ brief, guidance }), fetchImpl,
        temperature: 0.3,
        maxTokens: 1200,
      });
      const subQuestions = cleanStrings(data?.sub_questions);
      if (subQuestions.length) {
        return {
          ok: true,
          source: 'llm',
          model,
          usage,
          sub_questions: subQuestions,
          uncertainties: cleanStrings(data?.uncertainties, 4),
          estimate: Number.isFinite(Number(data?.estimate?.sources)) ? Number(data.estimate.sources) : null,
          why: data?.estimate?.rationale ? String(data.estimate.rationale) : null,
        };
      }
      return {
        ok: true,
        source: 'fallback',
        model,
        usage,
        llmError: 'model returned no usable sub-questions',
        sub_questions: fallbackQuestions(brief),
        uncertainties: [],
        estimate: 0.2,
        why: 'Planning offline: the plan is a fixed two-angle split until the model is configured.',
      };
    } catch (err) {
      return {
        ok: true,
        source: 'fallback',
        model: null,
        usage: null,
        llmError: err?.message || String(err),
        sub_questions: fallbackQuestions(brief),
        uncertainties: [],
        estimate: 0.2,
        why: 'Planning offline: the plan is a fixed two-angle split until the model is configured.',
      };
    }
  }
  return {
    ok: true,
    source: 'fallback',
    model: null,
    usage: null,
    sub_questions: fallbackQuestions(brief),
    uncertainties: [],
    estimate: 0.2,
    why: 'Planning offline: the plan is a fixed two-angle split until the model is configured.',
  };
}

function fallbackQuestions(brief) {
  return [
    `What does the evidence say about: ${brief?.topic || 'the brief'} (angle 1)`,
    `What does the evidence say about: ${brief?.topic || 'the brief'} (angle 2)`,
  ];
}

/**
 * Write the report from the run's own scored sources. High intensity, and bound
 * by the evidence: the prompt above refuses claims the sources do not carry.
 */
export async function generateReport({ brief, sources = [], guidance, runId, version, fetchImpl } = {}) {
  const fallback = (llmError) => ({
    ok: true,
    source: 'fallback',
    model: null,
    usage: null,
    llmError: llmError || null,
    markdown: `## Headline\n\nDraft for run ${runId}. Replace with synthesized evidence.\n`,
  });
  if (isLlmConfigured()) {
    try {
      const { text, usage, model } = await chat({
        effort: 'high',
        messages: reportMessages({ brief, sources, guidance }), fetchImpl,
        temperature: 0.4,
        maxTokens: 4000,
      });
      if (text && text.trim()) {
        return { ok: true, source: 'llm', model, usage, markdown: text.trim() };
      }
      return fallback('model returned empty text');
    } catch (err) {
      return fallback(err?.message || String(err));
    }
  }
  return fallback(null);
}

/**
 * One section of a long report, from that section's own evidence.
 * Bounded by targetWords so a comprehensive report is many small calls, never
 * one call asked to write a book.
 */
export async function generateSection({ brief, section, index, of, sources = [], targetWords = 800, guidance, fetchImpl } = {}) {
  const fallback = (llmError) => ({
    ok: true,
    source: 'fallback',
    model: null,
    usage: null,
    llmError: llmError || null,
    markdown: `## ${section}\n\n[Section pending: the model could not write this section${llmError ? ` (${llmError})` : ''}.]\n`,
  });
  if (isLlmConfigured()) {
    try {
      const { text, usage, model } = await chat({
        effort: 'high',
        messages: sectionMessages({ brief, section, index, of, sources, targetWords, guidance }),
        fetchImpl,
        temperature: 0.4,
        maxTokens: maxTokensForWords(targetWords),
      });
      if (text && text.trim()) {
        return { ok: true, source: 'llm', model, usage, markdown: text.trim() };
      }
      return fallback('model returned empty text');
    } catch (err) {
      return fallback(err?.message || String(err));
    }
  }
  return fallback(null);
}

function addUsage(total, usage) {
  if (!usage) return total;
  return {
    promptTokens: (total.promptTokens || 0) + (usage.promptTokens || 0),
    completionTokens: (total.completionTokens || 0) + (usage.completionTokens || 0),
    totalTokens: (total.totalTokens || 0) + (usage.totalTokens || 0),
    costUsd: (total.costUsd || 0) + (usage.costUsd || 0),
  };
}

/**
 * Assemble a long report: introduction, one generated section per outline
 * entry (each from its own evidence), and a conclusion synthesized from what
 * the sections actually found. `getEvidence` maps a section argument to that
 * section's sources; the worker supplies it from the run's collected docs.
 */
export async function generateReportLong({ brief, sections = [], getEvidence, guidance, runId, version, fetchImpl } = {}) {
  const resolved = resolveLength({ length: brief?.length, lengthWords: brief?.lengthWords });
  const capped = sections.slice(0, resolved.sections);
  const perSection = Math.round(resolved.words / Math.max(1, capped.length));
  const parts = [];
  let usage = {};
  const models = new Set();
  const errors = [];
  const summaries = [];

  const introWords = Math.max(150, Math.round(perSection / 4));
  if (isLlmConfigured()) {
    try {
      const intro = await chat({
        effort: 'high',
        messages: introMessages({ brief, sections: capped, targetWords: introWords }),
        fetchImpl,
        temperature: 0.4,
        maxTokens: maxTokensForWords(introWords),
      });
      if (intro.text?.trim()) {
        parts.push(intro.text.trim());
        usage = addUsage(usage, intro.usage);
        if (intro.model) models.add(intro.model);
      }
    } catch (err) {
      errors.push(`intro: ${err?.message || err}`);
    }
  }

  let i = 0;
  for (const section of capped) {
    i += 1;
    const evidence = getEvidence ? await getEvidence(section) : [];
    const out = await generateSection({
      brief, section, index: i, of: capped.length,
      sources: evidence, targetWords: perSection, guidance, fetchImpl,
    });
    parts.push(out.markdown);
    usage = addUsage(usage, out.usage);
    if (out.model) models.add(out.model);
    if (out.llmError) errors.push(`section ${i}: ${out.llmError}`);
    else if (out.source === 'llm') summaries.push(`Section ${i} (${section.slice(0, 80)}): ${out.markdown.replace(/[#*\[\]]/g, '').slice(0, 300)}`);
  }

  const conclusionWords = Math.max(150, Math.round(perSection / 3));
  if (isLlmConfigured() && summaries.length) {
    try {
      const conclusion = await chat({
        effort: 'high',
        messages: conclusionMessages({ brief, sectionSummaries: summaries, targetWords: conclusionWords }),
        fetchImpl,
        temperature: 0.4,
        maxTokens: maxTokensForWords(conclusionWords),
      });
      if (conclusion.text?.trim()) {
        parts.push(conclusion.text.trim());
        usage = addUsage(usage, conclusion.usage);
        if (conclusion.model) models.add(conclusion.model);
      }
    } catch (err) {
      errors.push(`conclusion: ${err?.message || err}`);
    }
  }

  const markdown = parts.join('\n\n');
  const source = errors.length === parts.length && !usage.totalTokens ? 'fallback' : parts.length ? 'llm' : 'fallback';
  return {
    ok: true,
    source,
    model: [...models].join(',') || null,
    usage: Object.keys(usage).length ? usage : null,
    llmError: errors.length ? errors.join(' | ').slice(0, 500) : null,
    markdown: markdown || `## Headline\n\nDraft for run ${runId}. Replace with synthesized evidence.\n`,
  };
}

/**
 * Round review: distill what a retrieval round established, and propose what
 * to ask next. Low intensity — this runs every round, and the router decides
 * the model. Each round's learnings compound: the next round's questions come
 * from what this one found missing, which is what makes expansion guided
 * rather than flat.
 */
export async function generateRoundReview({ brief, round, sources = [], fetchImpl } = {}) {
  const fallback = (llmError) => ({
    ok: true,
    source: 'fallback',
    model: null,
    usage: null,
    llmError: llmError || null,
    learnings: [],
    followUps: [],
  });
  if (isLlmConfigured()) {
    try {
      const { data, usage, model } = await chatJson({
        effort: 'low',
        messages: roundReviewMessages({ brief, round, sources }),
        temperature: 0.3,
        maxTokens: 800,
        fetchImpl,
      });
      return {
        ok: true,
        source: 'llm',
        model,
        usage,
        learnings: cleanStrings(data?.learnings, 10),
        followUps: cleanStrings(data?.followUps, 6),
      };
    } catch (err) {
      return fallback(err?.message || String(err));
    }
  }
  return fallback(null);
}
export async function generateThinking({ question, answer, fetchImpl } = {}) {
  if (isLlmConfigured()) {
    try {
      const { text, usage, model } = await chat({
        effort: 'low',
        messages: thinkingMessages({ question, answer }), fetchImpl,
        temperature: 0.5,
        maxTokens: 160,
      });
      if (text && text.trim()) {
        return { ok: true, source: 'llm', model, usage, text: text.trim() };
      }
      return { ok: true, source: 'fallback', model: null, usage: null, llmError: 'model returned empty text', text: null };
    } catch (err) {
      return { ok: true, source: 'fallback', model: null, usage: null, llmError: err?.message || String(err), text: null };
    }
  }
  return { ok: true, source: 'fallback', model: null, usage: null, text: null };
}

/**
 * Intake stage: propose the single next question for this topic. The model
 * GENERATES; this function only validates the shape. Anything off-spec (or
 * any transport failure) falls back to null and the caller uses the bank —
 * a bad question is worse than a generic one, and intake must never hard
 * fail on a model hiccup.
 */
export async function generateIntakeQuestion({ topic, answered = [], reframe = null, fetchImpl } = {}) {
  const fallback = (llmError) => ({ ok: true, source: 'fallback', model: null, usage: null, llmError: llmError || null, question: null });
  if (!isLlmConfigured()) return fallback(null);
  try {
    const { data, usage, model } = await chatJson({
      effort: 'low',
      messages: intakeQuestionMessages({ topic, answered, reframe }),
      temperature: 0.4,
      maxTokens: 400,
      fetchImpl,
    });
    const question = cleanIntakeQuestion(data);
    if (!question) return fallback('model returned an off-spec question');
    return { ok: true, source: 'llm', model, usage, question };
  } catch (err) {
    return fallback(err?.message || String(err));
  }
}

/**
 * Direct-data stage: propose up to 3 primary-source calls now that search
 * came back thin. The model PROPOSES; this function only validates the shape
 * (allowlisted tool, capped count, sane input). Anything off-spec falls back
 * to no calls — a bad call is worse than none, and the executor re-validates
 * everything anyway.
 */
export async function generateDirectData({ brief, queries = [], tools = [], fetchImpl } = {}) {
  const fallback = (llmError) => ({ ok: true, source: 'fallback', model: null, usage: null, llmError: llmError || null, calls: [] });
  const allowed = (Array.isArray(tools) && tools.length ? tools : ['http_request']).filter((t) => ['http_request', 'run_code', 'tip_creator', 'unlock_content', 'pay_x402'].includes(t));
  if (!isLlmConfigured()) return fallback(null);
  try {
    const { data, usage, model } = await chatJson({
      effort: 'low',
      messages: directDataMessages({ brief, queries, tools: allowed }),
      temperature: 0.3,
      maxTokens: 1000,
      fetchImpl,
    });
    const calls = cleanDirectCalls(Array.isArray(data) ? data : data?.calls, allowed);
    if (!calls) return fallback('model returned off-spec calls');
    return { ok: true, source: 'llm', model, usage, calls };
  } catch (err) {
    return fallback(err?.message || String(err));
  }
}

function cleanDirectCalls(calls, allowed) {
  if (!Array.isArray(calls)) return null;
  const out = [];
  for (const c of calls.slice(0, 3)) {
    if (!c || typeof c !== 'object') return null;
    if (!allowed.includes(c.tool)) return null;
    const input = c.input && typeof c.input === 'object' ? c.input : null;
    if (!input) return null;
    if (c.tool === 'http_request' && typeof input.url !== 'string') return null;
    if (c.tool === 'run_code' && typeof input.command !== 'string' && typeof input.code !== 'string') return null;
    if (c.tool === 'tip_creator' && (typeof input.contentUrl !== 'string' || !Number.isFinite(Number(input.amount)))) return null;
    if ((c.tool === 'unlock_content' || c.tool === 'pay_x402') && typeof input.url !== 'string') return null;
    const why = String(c.why || '').trim().slice(0, 200);
    if (!why) return null;
    out.push({ tool: c.tool, input, why });
  }
  return out;
}

function cleanIntakeQuestion(data) {
  if (!data || typeof data !== 'object') return null;
  const type = data.type;
  if (!['pick_one', 'pick_any', 'free'].includes(type)) return null;
  const prompt = String(data.prompt || '').trim().slice(0, 280);
  if (prompt.length < 12) return null;
  const key = String(data.key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'q';
  let options = [];
  if (type !== 'free') {
    if (!Array.isArray(data.options)) return null;
    options = data.options.slice(0, 5).map((o, i) => ({
      id: String(o?.id || `o${i + 1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || `o${i + 1}`,
      label: String(o?.label || '').trim().slice(0, 60),
    })).filter((o) => o.label.length >= 2);
    if (options.length < 2) return null;
  }
  return { key, type, prompt, options, allowOther: data.allowOther !== false };
}
