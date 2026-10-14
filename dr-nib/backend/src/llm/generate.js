// Generation with a deterministic fallback.
//
// Each function here is the *advisory* half of a stage: it asks the model to
// produce something, and if the model is unavailable or answers unusably it
// falls back to a fixed, honest stand-in so the pipeline, the ledger, and the
// SSE contract keep working. The caller decides what to do with the result; the
// fallback never pretends the model spoke.
import { chat, chatJson, isLlmConfigured } from './provider.js';
import { smartModel } from './pricing.js';
import { RESEARCH_SYSTEM, briefSummary, introMessages, conclusionMessages, planMessages, reportMessages,
roundReviewMessages, sectionMessages, deepenMessages, thinkingMessages, intakeQuestionMessages, intakeBatchMessages,
directDataMessages, forkMessages, stageNoteMessages } from './prompts.js';
import { maxTokensForWords, resolveLength, wordsPerSection, countWords, FLOOR_RATIO, MAX_EXPANSIONS } from '../length.js';
import { mapLimit } from '../retrieval/util.js';

// Reasoning consumes the same output-token ceiling as the final report.
// Keep room for both, and never save a reply cut off by that ceiling.
async function reportChat(options) {
  const out = await chat({ ...options, maxTokens: options.maxTokens + 8192 });
  return out.finishReason === 'length' || out.finishReason === 'content_filter'
    ? { ...out, text: '' } : out;
}

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
      const target = resolveLength({ length: brief?.length, lengthWords: brief?.lengthWords });
      const { data, usage, model } = await chatJson({
        model: smartModel(),
        effort: 'high',
        messages: planMessages({ brief, guidance, sections: target.sections, words: target.words }), fetchImpl,
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
export async function generateReport({ brief, sources = [], guidance, runId, version, fetchImpl, onToken, targetWords = 1200 } = {}) {
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
      const { text, usage, model } = await reportChat({
        effort: 'high',
        messages: reportMessages({ brief, sources, guidance }), fetchImpl,
        temperature: 0.4,
        maxTokens: 4000,
        ...(typeof onToken === 'function' ? { onToken } : {}),
      });
      if (text && text.trim()) {
        let markdown = text.trim();
        let outUsage = usage;
        // Same floor as the long path, one bounded pass: a short brief
        // report gets one deepening call, not an unbounded loop.
        const floor = Math.round(Number(targetWords) * FLOOR_RATIO);
        if (countWords(markdown) < floor && (sources || []).length > 0) {
          try {
            const deep = await reportChat({
              effort: 'high',
              messages: deepenMessages({
                brief, section: brief?.topic || 'the brief', existing: markdown,
                targetWords: Math.max(200, Math.round(Number(targetWords) / 3)), sources,
              }),
              fetchImpl,
              temperature: 0.4,
              maxTokens: maxTokensForWords(Math.max(200, Math.round(Number(targetWords) / 3))),
              ...(typeof onToken === 'function' ? { onToken } : {}),
            });
            outUsage = addUsage(outUsage, deep.usage);
            const line = String(deep.text || '').trim();
            if (line && line !== 'NOTHING_NEW' && /[.!?…]["']?\s*$/.test(line)) {
              markdown = `${markdown}\n\n${line}`;
            }
          } catch {
            /* floor best-effort: the short-but-honest draft still ships */
          }
        }
        // APA-adapted assembly, same as the long path: abstract from the
        // finished body, deterministic references from the evidence.
        const assembled = [markdown];
        let absModel = null;
        try {
          const abs = await generateAbstract({ brief, reportText: markdown, fetchImpl });
          outUsage = addUsage(outUsage, abs.usage);
          if (abs.model) absModel = abs.model;
          if (abs.abstract) {
            assembled.splice(1, 0, `> **Abstract.** ${abs.abstract}` + (abs.keywords.length ? `\n\n**Keywords:** ${abs.keywords.join(', ')}` : ''));
          }
        } catch {
          /* no abstract block rather than a fake one */
        }
        const refs = buildReferences(sources);
        if (refs) assembled.push(refs);
        return { ok: true, source: 'llm', model: model || absModel, usage: outUsage, markdown: assembled.join('\n\n') };
      }
      return { ...fallback('model returned empty or incomplete text'), usage, model };
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
 *
 * A single empty model response must not ship a placeholder section: retry a
 * bounded number of times (cooler temperature on the last attempt) and only
 * then fall back. Empty-text is the common transient failure (seen live), not
 * a verdict on the evidence.
 */
const SECTION_ATTEMPTS = 3;

export async function generateSection({ brief, section, index, of, sources = [], targetWords = 800, guidance, fetchImpl, onToken } = {}) {
  const fallback = (llmError) => ({
    ok: true,
    source: 'fallback',
    model: null,
    usage: null,
    llmError: llmError || null,
    markdown: `## ${section}\n\n[Section pending: the model could not write this section${llmError ? ` (${llmError})` : ''}.]\n`,
  });
  if (!isLlmConfigured()) return fallback(null);
  let lastError = null;
  let lastUsage = null;
  let lastModel = null;
  for (let attempt = 1; attempt <= SECTION_ATTEMPTS; attempt += 1) {
    try {
      const { text, usage, model } = await reportChat({
        effort: 'high',
        messages: sectionMessages({ brief, section, index, of, sources, targetWords, guidance }),
        fetchImpl,
        // Cooler on the final attempt: determinism over flair when the
        // evidence is thin and earlier attempts came back empty.
        temperature: attempt < SECTION_ATTEMPTS ? 0.4 : 0.1,
        maxTokens: maxTokensForWords(targetWords),
        ...(typeof onToken === 'function' ? { onToken } : {}),
      });
      lastUsage = addUsage(lastUsage || {}, usage);
      lastModel = model || lastModel;
      if (text && text.trim()) {
        return { ok: true, source: 'llm', model, usage: lastUsage, markdown: text.trim() };
      }
      lastError = `model returned empty text (attempt ${attempt}/${SECTION_ATTEMPTS})`;
    } catch (err) {
      lastError = err?.message || String(err);
    }
    if (attempt < SECTION_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  const out = fallback(lastError);
  // Preserve any usage accounting from attempts that consumed tokens.
  if (lastUsage) out.usage = lastUsage;
  if (lastModel) out.model = lastModel;
  return out;
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
export async function generateReportLong({ brief, sections = [], getEvidence, allSources = [], guidance, runId, version, fetchImpl, onToken } = {}) {
  const resolved = resolveLength({ length: brief?.length, lengthWords: brief?.lengthWords });
  const capped = sections.slice(0, resolved.sections);
  const perSection = Math.round(resolved.words / Math.max(1, capped.length));
  const parts = [];
  let usage = {};
  const models = new Set();
  const errors = [];
  const summaries = [];
  let introLanded = false;

  const introWords = Math.max(150, Math.round(perSection / 4));
  if (isLlmConfigured()) {
    try {
      const intro = await reportChat({
        effort: 'high',
        messages: introMessages({ brief, sections: capped, targetWords: introWords }),
        fetchImpl,
        temperature: 0.4,
        maxTokens: maxTokensForWords(introWords),
      });
      usage = addUsage(usage, intro.usage);
      if (intro.text?.trim()) {
        parts.push(intro.text.trim());
        introLanded = true;
        if (intro.model) models.add(intro.model);
      }
    } catch (err) {
      errors.push(`intro: ${err?.message || err}`);
    }
  }

  // Sections are independent: write up to 3 at once. The old serial loop
  // paid a full model round-trip per section back to back (5 sections ≈ 50s).
  const sectionOuts = await mapLimit(capped, 3, async (section, idx) => {
    const i = idx + 1;
    const evidence = getEvidence ? await getEvidence(section) : [];
    const out = await generateSection({
      brief, section, index: i, of: capped.length,
      sources: evidence, targetWords: perSection, guidance, fetchImpl,
      ...(typeof onToken === 'function' ? { onToken: (delta) => onToken(delta, { section: i, of: capped.length }) } : {}),
    });
    return { i, section, out, evidence };
  });
  // Length is a floor, not a wish: if the assembled sections fall short,
  // deepen the best-evidenced sections (never the thin ones — those were
  // told to stay short) until the floor is met or the expansion budget is
  // spent. Bounded: past MAX_EXPANSIONS the evidence is spent and further
  // calls buy repetition, and every pass is metered like any section.
  const floor = Math.round(resolved.words * FLOOR_RATIO);
  const deepened = new Set();
  for (let pass = 0; pass < MAX_EXPANSIONS; pass += 1) {
    const words = sectionOuts.reduce((s, o) => s + countWords(o.out.markdown), 0);
    if (words >= floor) break;
    const ranked = sectionOuts
      .filter((o) => !deepened.has(o.i) && o.out.source === 'llm' && (o.evidence || []).length > 0)
      .map((o) => ({ o, density: (o.evidence || []).length / Math.max(1, countWords(o.out.markdown)) }))
      .sort((a, b) => b.density - a.density);
    if (!ranked.length) break;
    const target = ranked[0].o;
    deepened.add(target.i);
    try {
      const { text, usage: du, model: dm } = await reportChat({
        effort: 'high',
        messages: deepenMessages({
          brief, section: target.section, existing: target.out.markdown,
          targetWords: Math.max(200, Math.round(perSection / 2)), sources: target.evidence,
        }),
        fetchImpl,
        temperature: 0.4,
        maxTokens: maxTokensForWords(Math.max(200, Math.round(perSection / 2))),
        ...(typeof onToken === 'function' ? { onToken: (delta) => onToken(delta, { section: target.i, of: capped.length }) } : {}),
      });
      usage = addUsage(usage, du);
      if (dm) models.add(dm);
      const line = String(text || '').trim();
      if (line && line !== 'NOTHING_NEW' && /[.!?…]["']?\s*$/.test(line)) {
        target.out.markdown = `${target.out.markdown.trim()}\n\n${line}`;
      } else {
        errors.push(`section ${target.i}: deepening found nothing new (evidence spent)`);
        break;
      }
    } catch (err) {
      errors.push(`section ${target.i}: deepening failed (${err?.message || err})`);
      break;
    }
  }
  for (const { i, section, out } of sectionOuts) {
    parts.push(out.markdown);
    usage = addUsage(usage, out.usage);
    if (out.model) models.add(out.model);
    if (out.llmError) errors.push(`section ${i}: ${out.llmError}`);
    else if (out.source === 'llm') summaries.push(`Section ${i} (${section.slice(0, 80)}): ${out.markdown.replace(/[#*\[\]]/g, '').slice(0, 300)}`);
  }

  const conclusionWords = Math.max(150, Math.round(perSection / 3));
  if (isLlmConfigured() && summaries.length) {
    try {
      const conclusion = await reportChat({
        effort: 'high',
        messages: conclusionMessages({ brief, sectionSummaries: summaries, targetWords: conclusionWords }),
        fetchImpl,
        temperature: 0.4,
        maxTokens: maxTokensForWords(conclusionWords),
      });
      usage = addUsage(usage, conclusion.usage);
      if (conclusion.text?.trim()) {
        parts.push(conclusion.text.trim());
        if (conclusion.model) models.add(conclusion.model);
      }
    } catch (err) {
      errors.push(`conclusion: ${err?.message || err}`);
    }
  }

  // APA-adapted assembly: title+intro, abstract, sections, conclusion,
  // references. The abstract is written from the finished body (never
  // invented structure — the writer was told not to produce one) and the
  // references are deterministic from the evidence order.
  const assembled = [...parts];
  try {
    const abs = await generateAbstract({ brief, reportText: parts.join('\n\n'), fetchImpl });
    usage = addUsage(usage, abs.usage);
    if (abs.model) models.add(abs.model);
    if (abs.abstract) {
      const block = `> **Abstract.** ${abs.abstract}` + (abs.keywords.length ? `\n\n**Keywords:** ${abs.keywords.join(', ')}` : '');
      assembled.splice(parts.length && introLanded ? 1 : 0, 0, block);
    }
  } catch (err) {
    errors.push(`abstract: ${err?.message || err}`);
  }
  const refs = buildReferences(allSources);
  if (refs) assembled.push(refs);

  const markdown = assembled.join('\n\n');
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
 * Report abstract + keywords, APA-adapted. One bounded call after the body
 * is written; a failure degrades to no abstract block rather than a fake
 * one. Keywords ride the last line for easy parsing.
 */
export function abstractMessages({ brief, reportText } = {}) {
  const system = `${RESEARCH_SYSTEM} You write report abstracts. Return plain prose only, no headings, no citations.`;
  const user = `Brief: ${briefSummary(brief)}

Summarize this report in an abstract of 150-200 words: what was asked, what was found, what remains open. Then, on its own final line: Keywords: k1, k2, k3.

Report:
${String(reportText || '').slice(0, 8000)}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Deterministic bibliography: numbered to the evidence order the caller
 * passes (trust-descending, matching the [n] citation chips). Titles +
 * domains + URLs, deduped — no model call, nothing to hallucinate. */
export function buildReferences(sources = []) {
  const seen = new Map();
  for (const s of sources || []) {
    const url = String(s?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.set(url, s);
  }
  const list = [...seen.values()];
  if (!list.length) return '';
  const lines = list.map((s, i) => {
    const title = String(s.title || s.url).replace(/[#*[\]]/g, '').slice(0, 140);
    const domain = s.domain ? ` ${s.domain}.` : '';
    return `[${i + 1}] ${title}.${domain} ${s.url}`;
  });
  return `## References\n\n${lines.join('\n')}`;
}

export async function generateAbstract({ brief, reportText, fetchImpl } = {}) {
  const fallback = { ok: true, source: 'fallback', abstract: null, keywords: [], usage: null };
  if (!isLlmConfigured()) return fallback;
  try {
    const { text, usage, model } = await reportChat({
      effort: 'low',
      messages: abstractMessages({ brief, reportText }),
      fetchImpl,
      temperature: 0.3,
      maxTokens: 500,
    });
    const lines = String(text || '').trim().split('\n');
    let keywords = [];
    const body = [];
    for (const line of lines) {
      const m = line.match(/^\s*keywords\s*:\s*(.+)$/i);
      if (m) keywords = m[1].split(',').map((k) => k.trim()).filter(Boolean).slice(0, 8);
      else if (line.trim()) body.push(line.trim());
    }
    const words = body.join(' ').split(/\s+/).filter(Boolean);
    const abstract = words.slice(0, 220).join(' ');
    if (!abstract) return { ...fallback, usage, model };
    return { ok: true, source: 'llm', model, usage, abstract, keywords };
  } catch {
    return fallback;
  }
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
        model: smartModel(),
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
export async function generateThinking({ brief = {}, question, answer, fetchImpl } = {}) {
  if (isLlmConfigured()) {
    try {
      const { text, usage, model } = await chat({
        effort: 'low',
        messages: thinkingMessages({ brief, question, answer }), fetchImpl,
        temperature: 0.5,
        maxTokens: 220,
      });
      const line = String(text || '').trim();
      // A clipped read is worse than a plain one: the model front-loads
      // setup clauses, so a token cut lands mid-sentence ("I understand
      // that your decision depends" — seen live). Fall back to the
      // deterministic read, which is complete by construction.
      if (line && /[.!?…]["']?\s*$/.test(line)) {
        return { ok: true, source: 'llm', model, usage, text: line };
      }
      return { ok: true, source: 'fallback', model: null, usage: null, llmError: line ? 'model read clipped mid-sentence' : 'model returned empty text', text: null };
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
      model: smartModel(),
      effort: 'low',
      messages: intakeQuestionMessages({ topic, answered, reframe }),
      temperature: 0.4,
      maxTokens: 400,
      fetchImpl,
    });
    const question = cleanIntakeQuestion(data);
    if (!question) return fallback('model returned an off-spec question');
    // Mechanical backstop for the "same question twice" failure: prompts that
    // share most significant words with anything already asked are rejected
    // even when the shape is valid. The caller falls back to the bank.
    if (repeatsPriorGround(question.prompt, answered)) return fallback('model repeated prior ground');
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

const REPEAT_STOP = new Set('what,are,the,and,for,with,from,that,this,how,they,does,between,into,under,more,most,such,than,then,when,which,while,about,based,using,used,each,have,has,had,been,were,was,but,not,all,any,can,its,your,you,our,which,should,there,their,will,would,than,then,over,last,which,what,does,doing,either,also,than,those,these,single,given,said'.split(','));

function significantWords(s) {
  return new Set(
    String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !REPEAT_STOP.has(w)),
  );
}

function repeatsPriorGround(prompt, answered = []) {
  const cur = significantWords(prompt);
  if (!cur.size) return false;
  return answered.some((a) => {
    const prior = significantWords(a.prompt || a.key);
    if (!prior.size) return false;
    let inter = 0;
    for (const w of cur) if (prior.has(w)) inter += 1;
    return inter / Math.min(cur.size, prior.size) > 0.55;
  });
}

/**
 * Intake stage, batched: propose up to `count` next questions in one call.
 * Each candidate goes through the same shape + repetition validation as a
 * single question, and against the other candidates in the batch too — a
 * batch that repeats itself is worse than no batch. Anything off-spec falls
 * back to an empty list and the caller uses the bank.
 */
export async function generateIntakeBatch({ topic, answered = [], count = 5, reframe = null, fetchImpl, signal } = {}) {
  const n = Math.max(1, Math.min(Number(count) || 5, 5));
  const fallback = (llmError) => ({ ok: true, source: 'fallback', model: null, usage: null, llmError: llmError || null, questions: [] });
  if (!isLlmConfigured()) return fallback(null);
  try {
    const { data, usage, model } = await chatJson({
      model: smartModel(),
      effort: 'low',
      messages: intakeBatchMessages({ topic, answered, count: n, reframe }),
      signal,
      temperature: 0.4,
      maxTokens: 400 * n,
      fetchImpl,
    });
    const raw = Array.isArray(data?.questions) ? data.questions : null;
    if (!raw) return fallback('model returned no question list');
    const seen = [...answered.map((a) => a.prompt || a.key)];
    const questions = [];
    for (const q of raw.slice(0, n)) {
      const cleaned = cleanIntakeQuestion(q);
      if (!cleaned) continue;
      if (repeatsPriorGround(cleaned.prompt, seen.map((prompt) => ({ prompt })))) continue;
      seen.push(cleaned.prompt);
      questions.push(cleaned);
    }
    if (!questions.length) return fallback('model returned no usable questions');
    return { ok: true, source: 'llm', model, usage, questions };
  } catch (err) {
    return fallback(err?.message || String(err));
  }
}

function cleanIntakeQuestion(data) {
  if (!data || typeof data !== 'object') return null;
  const type = data.type;
  // Only choice questions may be asked: free-text prompts confuse (seen
  // live — "tf?" answers to open fields) and stall convergence. The
  // `allowOther` exit preserves nuance without an open field.
  if (!['pick_one', 'pick_any'].includes(type)) return null;
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

/**
 * Stage narration: one plain-words line when a stage lands — what was found
 * and what happens next — so the owner follows the run like a chat, not a
 * progress bar. Voice only, never decisions: the facts ride in, the model
 * phrases them. Fire-and-forget from stage(): a missing line must never slow
 * the pipeline, so callers never await this.
 */
export async function generateStageNote({ kind, facts = '', next = '' } = {}) {
  if (!isLlmConfigured()) return null;
  try {
    const { text } = await chat({
      effort: 'low',
      messages: stageNoteMessages({ kind, facts, next }),
      temperature: 0.4,
      maxTokens: 120,
    });
    const line = String(text || '').trim().replace(/\s+/g, ' ');
    // Same clipped-read rule as intake thinkings: a cut-off narration line
    // ("I take this to mean each" — seen live) is worse than silence, and
    // the caller treats null as "say nothing".
    if (!line || !/[.!?…]["']?\s*$/.test(line)) return null;
    return line;
  } catch {
    return null;
  }
}

/**
 * Mid-run fork: the search came back split and JEV wants the owner to pick
 * a branch. The model phrases the fork as ONE pick_one with the actual
 * disagreeing claims as options — a branchless "narrow me down" free-text
 * names nothing and gets "i dont understand" answers (seen live). Null when
 * the model cannot phrase it; the caller proceeds and flags the assumption
 * rather than asking a bad question.
 */
export async function generateForkQuestion({ topic, branches = [], fetchImpl } = {}) {
  if (!isLlmConfigured()) return null;
  if (!branches.filter(Boolean).length) return null;
  try {
    const { data } = await chatJson({
      effort: 'low',
      messages: forkMessages({ topic, branches }),
      temperature: 0.3,
      maxTokens: 500,
      fetchImpl,
    });
    const q = cleanIntakeQuestion(data);
    if (!q || q.type !== 'pick_one') return null;
    return { ...q, key: 'fork', id: 'scope-check' };
  } catch {
    return null;
  }
}
