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
  const state = [
    `Task: ${task}`,
    `Proposed: ${proposal.tool} — ${proposal.why || '(no reason given)'}`,
    `Spent so far: $${Number(spentUsd).toFixed(4)}${balanceUsd == null ? '' : `, balance left: $${Number(balanceUsd).toFixed(2)}`}`,
    `Prior calls: ${history.length ? history.map((h) => `${h.tool}:${h.ok ? 'ok' : 'failed'}`).join(', ') : 'none'}`,
    repeats > 0 ? `WARNING: this exact tool already failed ${repeats}x — executing it again burns budget for a known outcome.` : '',
  ].filter(Boolean).join('\n');
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
    return { decision: out.pick, source: 'jev', ...out };
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    // JEV down: the safe default is skip, never blind execution. Money and
    // side effects must not ride on an unjudged proposal.
    return { decision: 'skip', source: 'fallback', reason: 'jev-unavailable' };
  }
}

/**
 * Run one task to completion (or maxSteps). Returns { answer, steps } where
 * every step carries proposal + decision + result for the audit trail.
 * History entries are shaped for the next proposal: tool, literal input,
 * and outcome — a retry loop can only learn from failures it can see.
 */
export async function runToolAgent({ task, tools = null, maxSteps = 6, runId = 'tool-agent', policy = { allow: [], deny: [] }, balanceUsd = null, fetchImpl, onStep } = {}) {
  if (!isLlmConfigured()) throw new Error('LLM is not configured');
  const steps = [];
  let spentUsd = 0;
  const seen = new Set();
  const shape = (tool, input, out) => ({
    tool,
    inputSummary: JSON.stringify(input ?? {}).slice(0, 160),
    ok: Boolean(out?.ok),
    outcome: out?.ok
      ? `ok in ${out.ms}ms, $${Number(out.costUsd || 0).toFixed(4)}: ${JSON.stringify(out.output ?? '').slice(0, 220)}`
      : `FAILED: ${String(out?.error || 'unknown').slice(0, 160)}`,
  });
  for (let n = 0; n < maxSteps; n += 1) {
    // Fresh self-model every turn: balances move, tools appear/disappear,
    // budgets drain. Reasoning from a stale snapshot is how agents promise
    // spends they cannot make.
    let selfText = '';
    try {
      selfText = selfBlock(await agentState({ runId }), maxSteps - n);
    } catch {}
    const proposal = await proposeTool({ task, history: steps, tools, fetchImpl, self: selfText });
    if (proposal.done) return { answer: proposal.answer, steps, undecided: proposal.undecided };
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
    // and synthesize instead of burning a third identical call.
    const fingerprint = `${proposal.tool}:${JSON.stringify(proposal.input ?? {})}`;
    if (seen.has(fingerprint)) {
      const step = { n, proposal, judgement: { decision: 'skip', source: 'dedupe' } };
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: 'identical call already attempted' }));
      steps.push(step);
      await onStep?.(step);
      break;
    }
    seen.add(fingerprint);
    const judgement = await judgeToolCall({ task, proposal, history: steps, spentUsd, balanceUsd });
    const step = { n, proposal, judgement: { decision: judgement.decision, source: judgement.source } };
    if (judgement.decision !== 'execute') {
      step.result = { skipped: true };
      Object.assign(step, shape(proposal.tool, proposal.input, { ok: false, error: `judged ${judgement.decision}` }));
      steps.push(step);
      if (judgement.decision === 'answer') return { answer: '', steps };
      await onStep?.(step);
      continue;
    }
    const t0 = Date.now();
    const out = await runTool(runId, proposal.tool, proposal.input, { policy });
    spentUsd += Number(out.costUsd) || 0;
    step.result = { ok: out.ok, costUsd: out.costUsd || 0, ms: Date.now() - t0, output: out.ok ? out.output : null, error: out.ok ? null : out.error };
    Object.assign(step, shape(proposal.tool, proposal.input, { ...step.result, ms: step.result.ms }));
    steps.push(step);
    await onStep?.(step);
  }
  // Out of steps is not an empty answer: force one final proposal with no
  // tools left, the evidence pinned, and an explicit demand for one sentence.
  const evidence = steps.filter((s) => s.result?.ok).slice(-2)
    .map((s) => `${s.proposal.tool}: ${JSON.stringify(s.result.output ?? '').slice(0, 400)}`).join('\n');
  let finaleSelf = '';
  try {
    finaleSelf = selfBlock(await agentState({ runId }), 0);
  } catch {}
  const finale = await proposeTool({
    task: `${task}\nNo more tool calls. Answer in one sentence from this evidence (never empty):\n${evidence || '(no successful calls)'}`,
    history: steps, tools: [], fetchImpl, self: finaleSelf,
  }).catch(() => null);
  return { answer: finale?.answer || '', steps, stopped: 'max-steps' };
}
