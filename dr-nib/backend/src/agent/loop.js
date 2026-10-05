// Tool agent: the complete loop the product promises — the model proposes,
// JEV disposes, the executor runs. One step is one proposal plus one
// judgement; nothing executes without a decision row saying so.
//
//   model proposes {tool, input, why} (or {done, answer})
//     → JEV picks {execute, skip, answer} with cost and history in view
//     → execute (metered, audited) or record the skip and continue
//
// The run pipeline uses this shape at stage level; this module runs it at
// tool level for tasks outside any run.
import { chatJson, isLlmConfigured } from '../llm/provider.js';
import { decide, JevUnavailable } from '../jev/client.js';
import { toolSpecs, runTool } from '../tools/executor.js';
import { agentState, selfBlock } from './self.js';
import { fingerprint as canonicalPrint, similarity, extractChecklist, coverage } from './stops.js';

const SYS = [
  'You operate tools for a principal with a limited budget. You never spend what you cannot see quoted.',
  'Return JSON only: {"tool": name, "input": {...}, "why": "one line"} when a tool moves the task forward, or {"done": true, "answer": "..."} when the task is answered from history. Never invent tool names.',
].join(' ');

// Required inputs per tool, stated plainly: models routinely drop a field
// (the classic miss is proposing a tip with no amount) and a failed call
// teaches slower than a complete one.
const REQUIRED_INPUTS = {
  web_search: ['query'],
  web_fetch: [['urls', 'url']],
  http_request: ['url'],
  run_code: [['command', 'code']],
  search_sources: ['query'],
  tip_creator: ['contentUrl', 'amount'],
  unlock_content: ['url'],
  pay_x402: ['url'],
};

const REQUIRED_LABELS = {
  web_search: 'query (full question or keywords)',
  web_fetch: 'urls (array of https URLs)',
  http_request: 'url (full https URL), method (GET default)',
  run_code: 'command (one shell line) or code+language',
  search_sources: 'query',
  tip_creator: 'contentUrl (full https URL) + amount (number, USD)',
  unlock_content: 'url (full https URL of the gated page)',
  pay_x402: 'url (full https URL of the gated endpoint)',
};

/** Schema-check a proposal BEFORE it costs a judgement call or execution. */
export function checkProposal(tool, input, allowed = null) {
  const specs = toolSpecs().filter((t) => !allowed || allowed.includes(t.name));
  if (!specs.some((t) => t.name === tool)) return { ok: false, error: `unknown tool: ${tool} (available: ${specs.map((t) => t.name).join(', ')})` };
  const required = REQUIRED_INPUTS[tool] || [];
  for (const field of required) {
    const names = Array.isArray(field) ? field : [field];
    if (!names.some((n) => input?.[n] !== undefined && input?.[n] !== null && input?.[n] !== '')) {
      return { ok: false, error: `missing required input: ${names.join(' or ')}` };
    }
  }
  return { ok: true };
}

export async function proposeTool({ task, history = [], tools = null, fetchImpl, final = false, self = null } = {}) {
  const specs = toolSpecs().filter((t) => !tools || tools.includes(t.name));
  const trail = history.length
    ? history.map((h, i) => `${i + 1}. ${h.tool}(${h.inputSummary}) → ${h.outcome}`).join('\n')
    : '(no calls yet)';
  const toolLines = specs.length
    ? specs.map((t) => `- ${t.name} (${t.cost}): ${t.description} Input: ${REQUIRED_LABELS[t.name] || 'see description'}`).join('\n')
    : '(no tools left — answer from history now, in one or two sentences, even if partial)';
  const selfSection = self ? `\n\nWho you are right now:\n${self}\n` : '';
  const { data } = await chatJson({
    effort: 'low',
    messages: [
      { role: 'system', content: SYS },
      {
        role: 'user',
        content: `Task: ${task}\n${selfSection}\nCalls so far (learn from failures — a failed call with the same input will fail again):\n${trail}\n\nAvailable tools:\n${toolLines}\n\nReply with the single next call, or done with the final answer synthesized from the calls above. Amounts and URLs must be complete and literal — never placeholders.`,
      },
    ],
    temperature: 0.2,
    maxTokens: 600,
    fetchImpl,
  });
  if (data?.done) return { done: true, answer: String(data.answer || '') };
  if (!data?.tool || typeof data.tool !== 'string') return { done: true, answer: '', undecided: true };
  return { tool: data.tool, input: data.input && typeof data.input === 'object' ? data.input : {}, why: String(data.why || '').slice(0, 200) };
}

export async function judgeToolCall({ task, proposal, history = [], spentUsd = 0, balanceUsd = null } = {}) {
  const repeats = history.filter((h) => h.tool === proposal.tool && !h.ok).length;
  const successes = history.filter((h) => h.ok).length;
  const state = [
    `Task: ${task}`,
    `Proposed: ${proposal.tool} — ${proposal.why || '(no reason given)'}`,
    `Spent so far: $${Number(spentUsd).toFixed(4)}${balanceUsd == null ? '' : `, balance left: $${Number(balanceUsd).toFixed(2)}`}`,
    `Prior calls: ${history.length ? history.map((h) => `${h.tool}:${h.ok ? 'ok' : 'failed'}`).join(', ') : 'none'}`,
    repeats > 0 ? `WARNING: this exact tool already failed ${repeats}x — executing it again burns budget for a known outcome.` : '',
    successes >= 2 ? `NOTE: ${successes} calls already succeeded. Prefer answer unless this call measures something genuinely new.` : '',
  ].filter(Boolean).join('\n');
  // One retry on transient JEV failure: no HTTP response (connection refused,
  // reset, timeout) or a 502/503/504 from the hub. Anything else — 4xx, 500,
  // 501 (not enabled in this build) — is a real rejection; retrying it just
  // burns time. After that the safe default is skip, never blind execution:
  // money and side effects must not ride on an unjudged proposal.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const out = await decide({
        state,
        instructions: 'Decide whether this tool call is worth executing. Execute when it plausibly advances the task at an acceptable cost; skip when it repeats prior work, costs more than it can return, or spends money the balance cannot cover; answer when the task is already resolved by history.',
        candidates: [
          { id: 'execute', context: 'Run the proposed call now.' },
          { id: 'skip', context: 'Do not run it; tell the proposer to try a different tool or answer.' },
          { id: 'answer', context: 'No more calls needed — answer from what is already known.' },
        ],
        questionId: 'tool-call',
      });
      return { decision: out.pick, source: 'jev', ...(attempt > 0 ? { retried: true } : {}), ...out };
    } catch (err) {
      if (!(err instanceof JevUnavailable)) throw err;
      const status = err.status ?? null;
      const retryable = status == null || status === 502 || status === 503 || status === 504;
      if (retryable && attempt === 0) continue;
      return { decision: 'skip', source: 'fallback', reason: 'jev-unavailable', status };
    }
  }
}

/**
 * Run one task to completion (or to a stop reason). Returns
 * { answer, steps, stopped } where stopped is the FIRST triggering condition
 * (max-steps, deadline, cost-budget, judge-unreachable, proposal-lost,
 * executed-duplicate, skip-loop, failure-budget, evidence-covered,
 * no-novelty, streak-exhausted, judge-answered, done-signal) — tune
 * thresholds from this field, not from vibes.
 *
 * Every step carries proposal + decision + result for the audit trail.
 * History entries are shaped for the next proposal: tool, literal input,
 * and outcome — a retry loop can only learn from failures it can see.
 */
export async function runToolAgent({ task, tools = null, maxSteps = 6, runId = 'tool-agent', policy = { allow: [], deny: [] }, balanceUsd = null, fetchImpl, onStep, deadlineMs = 600_000, maxSpendUsd = 1, failBudget = 3 } = {}) {
  if (!isLlmConfigured()) throw new Error('LLM is not configured');
  const steps = [];
  let spentUsd = 0;
  let stopped = 'max-steps';
  const startedAt = Date.now();
  // The run's rubric: concrete facts that would answer the task, extracted
  // once up front. Coverage against it is deterministic keyword matching —
  // the model names the target, code decides when it is hit.
  const checklist = await extractChecklist(task, { fetchImpl });
  const seen = new Set();
  let proposalFails = 0;
  let lastSkipped = null;
  let skippedRepeats = 0;
  let judgedOk = false;
  let failStreak = 0;
  let redundantStreak = 0;
  const shape = (tool, input, out) => ({
    tool,
    inputSummary: JSON.stringify(input ?? {}).slice(0, 160),
    ok: Boolean(out?.ok),
    outcome: out?.ok
      ? `ok in ${out.ms}ms, $${Number(out.costUsd || 0).toFixed(4)}: ${JSON.stringify(out.output ?? '').slice(0, 220)}`
      : `FAILED: ${String(out?.error || 'unknown').slice(0, 160)}`,
  });
  for (let n = 0; n < maxSteps; n += 1) {
    // Budgets are checked BEFORE the calls they bound — checking after the
    // fact is how you accidentally double your spend right at the limit.
    if (Date.now() - startedAt > deadlineMs) { stopped = 'deadline'; break; }
    if (spentUsd >= maxSpendUsd) { stopped = 'cost-budget'; break; }
    // Fresh self-model every turn: balances move, tools appear/disappear,
    // budgets drain. Reasoning from a stale snapshot is how agents promise
    // spends they cannot make.
    let selfText = '';
    try {
      selfText = selfBlock(await agentState({ runId }), maxSteps - n);
    } catch {}
    // A malformed proposal is a failed step, not a dead run: record it and
    // continue. Two in a row means the proposer is lost — stop and synthesize.
    let proposal;
    try {
      proposal = await proposeTool({ task, history: steps, tools, fetchImpl, self: selfText });
      proposalFails = 0;
    } catch (err) {
      proposalFails += 1;
      steps.push({ n, proposal: null, judgement: { decision: 'skip', source: 'malformed' }, result: null, ok: false, inputSummary: '', outcome: `FAILED TO PROPOSE: ${String(err?.message || err).slice(0, 140)}` });
      if (proposalFails >= 2) { stopped = 'proposal-lost'; break; }
      continue;
    }
    if (proposal.done) return { answer: proposal.answer, steps, stopped: 'done-signal', undecided: proposal.undecided };
    // Pre-execution schema check: malformed proposals die here for free, with
    // feedback the model can act on — never spend a judgement or a tool call.
    const shape0 = checkProposal(proposal.tool, proposal.input, tools);
    if (!shape0.ok) {
      const step = { n, proposal, judgement: { decision: 'skip', source: 'schema' } };
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: shape0.error }));
      steps.push(step);
      await onStep?.(step);
      continue;
    }
    // Identical proposal twice: the definition of a doom loop. Stop the run
    // and synthesize instead of burning a third identical call. Only
    // *successful* executions poison the fingerprint — a failed or skipped
    // call was never banked as evidence, and blocking its retry would let
    // one transient error starve the whole run. (Repeated failures trip the
    // failure budget instead.)
    const fp = canonicalPrint(proposal.tool, proposal.input ?? {});
    if (seen.has(fp)) {
      const step = { n, proposal, judgement: { decision: 'skip', source: 'dedupe' } };
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: 'identical call already succeeded — stopping' }));
      steps.push(step);
      await onStep?.(step);
      stopped = 'executed-duplicate';
      break;
    }
    // Same tool succeeding over and over: the well is dry. Three consecutive
    // successes with one tool means measure → cross-check → done; a fourth
    // call re-measures what is already known. Stop deterministically instead
    // of hoping the judge feels done — it demonstrably does not.
    let streak = 0;
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      if (steps[i].tool === proposal.tool && steps[i].ok) streak += 1;
      else break;
    }
    if (streak >= 3) {
      const step = { n, proposal, judgement: { decision: 'answer', source: 'streak' } };
      step.result = { skipped: true };
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: `stopped after ${streak} consecutive ${proposal.tool} successes` }));
      steps.push(step);
      await onStep?.(step);
      stopped = 'enough-evidence';
      break;
    }
    if (streak >= 3) {
      const step = { n, proposal, judgement: { decision: 'answer', source: 'streak' } };
      step.result = { skipped: true };
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: `stopped after ${streak} consecutive ${proposal.tool} successes` }));
      steps.push(step);
      await onStep?.(step);
      stopped = 'streak-exhausted';
      break;
    }
    // Already covered by evidence gathered so far: judging another call is
    // wasted latency. Checked pre-judge so a satisfied checklist never pays
    // for a verdict it does not need.
    if (checklist?.length) {
      const priorObs = steps.filter((s) => s.outputText).map((s) => s.outputText);
      if (priorObs.length && !coverage(checklist, priorObs).missing.length) {
        const step = { n, proposal, judgement: { decision: 'answer', source: 'coverage' } };
        step.result = { skipped: true };
        Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: 'checklist fully covered by prior observations — stopping' }));
        steps.push(step);
        await onStep?.(step);
        stopped = 'evidence-covered';
        break;
      }
    }
    const judgement = await judgeToolCall({ task, proposal, history: steps, spentUsd, balanceUsd });
    if (judgement.source === 'jev') judgedOk = true;
    const step = { n, proposal, judgement: { decision: judgement.decision, source: judgement.source } };
    if (judgement.decision !== 'execute') {
      step.result = { skipped: true };
      // No HTTP response on any judgement so far: the judge is unreachable
      // (infra down), not voicing a verdict. Limping through maxSteps on
      // fallback-skips burns time and teaches the proposer that good calls
      // get skipped — stop and say so.
      if (judgement.source === 'fallback' && (judgement.status ?? null) == null && !judgedOk) {
        Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: 'judge unreachable (no HTTP response) — stopping instead of running judgeless' }));
        steps.push(step);
        await onStep?.(step);
        stopped = 'judge-unreachable';
        break;
      }
      // Same skipped proposal again: the proposer is stuck, not learning.
      // Varying proposals after a skip is fine; repeating one is a doom loop.
      if (fp === lastSkipped) {
        skippedRepeats += 1;
        if (skippedRepeats >= 2) {
          Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: 'identical proposal skipped repeatedly — stopping' }));
          step.judgement = { decision: 'skip', source: 'dedupe' };
          steps.push(step);
          await onStep?.(step);
          stopped = 'skip-loop';
          break;
        }
      } else {
        lastSkipped = fp;
        skippedRepeats = 1;
      }
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: `SKIPPED BY JUDGE (never executed): ${judgement.decision}${judgement.reason ? ` — ${judgement.reason}` : ''}` }));
      steps.push(step);
      if (judgement.decision === 'answer') { stopped = 'judge-answered'; break; }
      await onStep?.(step);
      continue;
    }
    const t0 = Date.now();
    const out = await runTool(runId, proposal.tool, proposal.input, { policy });
    spentUsd += Number(out.costUsd) || 0;
    const outputText = out.ok ? JSON.stringify(out.output ?? '').slice(0, 2000) : '';
    step.result = { ok: out.ok, costUsd: out.costUsd || 0, ms: Date.now() - t0, output: out.ok ? out.output : null, error: out.ok ? null : out.error };
    step.outputText = outputText;
    Object.assign(step, shape(proposal.tool, proposal.input, { ...step.result, ms: step.result.ms }));
    if (!out.ok) {
      // Failures never poison the fingerprint (transients deserve retries),
      // but K consecutive failures mean the plan is broken, not unlucky.
      failStreak += 1;
      redundantStreak = 0;
      step.outcome = `FAILED IN EXECUTION: ${String(out.error || 'unknown').slice(0, 160)}`;
      steps.push(step);
      await onStep?.(step);
      if (failStreak >= failBudget) { stopped = 'failure-budget'; break; }
      continue;
    }
    seen.add(fp);
    failStreak = 0;
    lastSkipped = null;
    skippedRepeats = 0;
    // Novelty: an observation near-identical to a prior one from the same
    // tool added no information. Two in a row and the run is re-reading.
    const priors = steps.filter((s) => s.tool === proposal.tool && s.outputText).map((s) => s.outputText);
    const redundant = priors.some((p) => similarity(outputText, p) > 0.85);
    redundantStreak = redundant ? redundantStreak + 1 : 0;
    let missingNote = '';
    if (checklist?.length) {
      const cov = coverage(checklist, steps.filter((s) => s.outputText).map((s) => s.outputText).concat(outputText));
      step.coverage = cov;
      if (!cov.missing.length) {
        steps.push(step);
        await onStep?.(step);
        stopped = 'evidence-covered';
        break;
      }
      missingNote = ` Still missing: ${cov.missing.join('; ')}.`;
    }
    step.outcome += missingNote;
    steps.push(step);
    await onStep?.(step);
    if (redundantStreak >= 2) { stopped = 'no-novelty'; break; }
  }
  // Out of steps is not an empty answer: force one final proposal with no
  // tools left, the evidence pinned, and an explicit demand for one sentence.
  // If the model cannot even do that (non-JSON ramble), fall back to a
  // deterministic extract — a run that gathered evidence must never report
  // nothing.
  const good = steps.filter((s) => s.result?.ok).slice(-2);
  const evidence = good
    .map((s) => `${s.proposal.tool}: ${JSON.stringify(s.result.output ?? '').slice(0, 400)}`).join('\n');
  let finaleSelf = '';
  try {
    finaleSelf = selfBlock(await agentState({ runId }), 0);
  } catch {}
  const finale = await proposeTool({
    task: `${task}\nNo more tool calls. Answer in one sentence from this evidence (never empty):\n${evidence || '(no successful calls)'}`,
    history: steps, tools: [], fetchImpl, self: finaleSelf,
  }).catch(() => null);
  const answer = finale?.answer?.trim()
    || (good.length
      ? `Measured ${good.map((s) => s.proposal.tool).join(' + ')}: ${evidence.slice(0, 500)}`
      : 'No tool call succeeded; no evidence was gathered.');
  return { answer, steps, stopped };
}
