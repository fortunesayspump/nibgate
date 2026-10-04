// Tool registry and executor.
//
// The run's tool belt, in one place: each tool has a name, a description the
// model reads when choosing instruments, an explicit cost model, and a handler.
// Every call goes through runTool, which validates input, enforces the run's
// domain policy, executes, meters the real cost, and writes a durable
// `tool.call` event — so the audit trail shows every instrument the run
// reached for, not just its conclusions.
//
// Cost discipline: provider calls meter their reported cost; local calls
// (compute, evidence) meter zero but are still logged. A tool call never
// spends from anywhere but the run's ledger, via the stage that invoked it.
import { recordEvent } from '../eventlog.js';
import { applyUrlPolicy, checkUrlPolicy, normalizePolicy } from './policy.js';
import { searchAll, extractAll } from '../retrieval/index.js';
import { httpRequest } from './http.js';
import { searchEvidence } from './evidence.js';
import { runInSandbox, sandboxConfigured, writeSandboxFile } from './sandbox.js';
import { isSpendConfigured } from '../spend/policy.js';
import { tipCreator } from '../spend/tips.js';
import { unlockContent, payX402 } from '../spend/unlocks.js';

function needSpend() {
  if (!isSpendConfigured()) throw new Error('agent spending is not configured on this deployment (DRNIB_AGENT_PRIVATE_KEY)');
}

function need(input, ...fields) {
  for (const f of fields) {
    if (input?.[f] === undefined || input?.[f] === null || input?.[f] === '') {
      throw new Error(`missing required input: ${f}`);
    }
  }
}

const TOOLS = {
  web_search: {
    description: 'Search the web across providers (breadth + academic). Use for discovery: finding candidate sources. Returns ranked candidates with snippets.',
    cost: 'metered',
    async run(input, ctx) {
      need(input, 'query');
      const out = await searchAll(
        {
          query: String(input.query).slice(0, 500),
          maxResults: input.maxResults ?? 8,
          searchDepth: input.searchDepth || 'basic',
          timeRange: input.timeRange,
          includeAcademic: input.includeAcademic !== false,
        },
        { fetchImpl: ctx.fetchImpl },
      );
      const { kept, cut } = applyUrlPolicy(out.results, ctx.policy);
      return { output: { ...out, results: kept, cut }, costUsd: out.costUsd };
    },
  },

  web_fetch: {
    description: 'Read pages: extract clean text from URLs. Robots and paywalls are respected; skipped URLs are reported with reasons, never worked around.',
    cost: 'metered',
    async run(input, ctx) {
      const urls = input?.urls ?? input?.url;
      need({ urls }, 'urls');
      const list = (Array.isArray(urls) ? urls : [urls]).map(String).slice(0, 20);
      for (const url of urls) {
        const verdict = checkUrlPolicy(url, ctx.policy);
        if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);
      }
      const out = await extractAll({ urls }, { fetchImpl: ctx.fetchImpl });
      return { output: out, costUsd: out.costUsd };
    },
  },

  http_request: {
    description: 'Call a public HTTP API or feed (GET/POST/HEAD): structured sources like arXiv, SEC EDGAR, or GitHub. SSRF-guarded; private and link-local addresses refuse.',
    cost: 'zero',
    async run(input, ctx) {
      need(input, 'url');
      const verdict = checkUrlPolicy(input.url, ctx.policy);
      if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);
      const out = await httpRequest(
        { url: input.url, method: input.method || 'GET', headers: input.headers || {}, body: input.body ?? null },
        { fetchImpl: ctx.fetchImpl },
      );
      return { output: out, costUsd: 0 };
    },
  },

  run_code: {
    description: 'Run a shell command or a script in an isolated ephemeral Linux VM: install packages, parse documents, compute statistics and charts, query public RPC endpoints, run CLI tools. Keys never enter the sandbox: it fetches and crunches, while signing and spending stay in the backend process (unlock_content/pay_x402). No access to platform secrets or the private network; the VM is discarded after the run.',
    cost: 'metered',
    async run(input, ctx) {
      if (!sandboxConfigured()) throw new Error('run_code is unavailable: sandbox execution is not configured on this deployment');
      if (!input?.command && !input?.code) throw new Error('provide either command or code');
      for (const f of input.files || []) {
        if (!f?.path || typeof f.content !== 'string') throw new Error('each file needs {path, content}');
        await writeSandboxFile(ctx.runId, f.path, f.content);
      }
      let command = input.command;
      if (!command) {
        const lang = String(input.language || 'node').toLowerCase();
        const ext = { node: 'mjs', javascript: 'mjs', python: 'py', python3: 'py', bash: 'sh', sh: 'sh' }[lang] || 'txt';
        const runner = { node: 'node', javascript: 'node', python: 'python3', python3: 'python3', bash: 'bash', sh: 'sh' }[lang] || 'node';
        const path = input.path || `/tmp/drnib-snippet.${ext}`;
        await writeSandboxFile(ctx.runId, path, input.code);
        command = `${runner} ${path}`;
      }
      const out = await runInSandbox(ctx.runId, command, { timeoutSec: Math.min(Math.max(Number(input.timeoutSec) || 120, 1), 600) });
      return { output: out, costUsd: out.costUsd };
    },
  },

  search_sources: {
    description: "Search what THIS run already collected (titles, URLs, passages). Use before going back to the web, and for answering follow-ups strictly from the run's evidence.",
    cost: 'zero',
    async run(input, ctx) {
      need(input, 'query');
      const out = await searchEvidence(ctx.runId, { query: input.query, limit: input.limit ?? 5 });
      return { output: out, costUsd: 0 };
    },
  },

  tip_creator: {
    description: 'Tip a creator page in USDC from the run budget (max $1/call) via the hub tip rail. Use when a source was decisive for the report. Settles onchain; returns the hub receipt.',
    cost: 'onchain',
    async run(input, ctx) {
      needSpend();
      const contentUrl = input?.contentUrl ?? input?.url;
      need({ contentUrl, amount: input?.amount }, 'contentUrl', 'amount');
      const out = await tipCreator({ runId: ctx.runId, contentUrl, amount: input.amount, title: input.title });
      return { output: out, costUsd: out.amount };
    },
  },

  unlock_content: {
    description: 'Pay to unlock a paid Nibgate article/share (max $2/call) and read its body. The price is read off the free 402 challenge first; the call refuses when the price is unreadable or over budget. Returns the unlocked text as evidence.',
    cost: 'onchain',
    async run(input, ctx) {
      needSpend();
      need(input, 'url');
      const verdict = checkUrlPolicy(input.url, ctx.policy);
      if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);
      const out = await unlockContent({ runId: ctx.runId, url: input.url });
      return { output: out, costUsd: out.amount };
    },
  },

  pay_x402: {
    description: 'Pay any x402-gated URL (max $2/call): public APIs, data feeds, paid tools. Price previewed free off the 402; refuses blind or over-budget. Returns the paid response.',
    cost: 'onchain',
    async run(input, ctx) {
      needSpend();
      need(input, 'url');
      const verdict = checkUrlPolicy(input.url, ctx.policy);
      if (!verdict.ok) throw new Error(`refused: ${verdict.reason}`);
      const out = await payX402({ runId: ctx.runId, url: input.url });
      return { output: out, costUsd: out.amount };
    },
  },
};

export function toolNames() {
  return Object.keys(TOOLS);
}

/** The tool descriptions as the model sees them when choosing instruments. */
export function toolSpecs() {
  return Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, cost: t.cost }));
}

/**
 * Execute one tool call for a run: validate, enforce policy, meter, and log.
 * @returns {Promise<{ok:true, output:any, costUsd:number}|{ok:false, error:string, costUsd:0}>}
 */
export async function runTool(runId, name, input, { policy, fetchImpl } = {}) {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, error: `unknown tool: ${name}`, costUsd: 0 };
  const ctx = { runId, policy: normalizePolicy(policy), fetchImpl };
  try {
    const { output, costUsd } = await tool.run(input || {}, ctx);
    const cost = Number(costUsd) || 0;
    await recordEvent(runId, {
      type: 'tool.call',
      tool: name,
      costUsd: cost,
      ok: true,
      detail: summarize(name, input),
      result: summarizeResult(name, output),
    });
    return { ok: true, output, costUsd: cost };
  } catch (err) {
    const message = err?.message || String(err);
    await recordEvent(runId, { type: 'tool.call', tool: name, costUsd: 0, ok: false, error: message.slice(0, 300) });
    return { ok: false, error: message.slice(0, 300), costUsd: 0 };
  }
}

function summarize(name, input) {
  if (!input) return '';
  if (name === 'web_search') return String(input.query || '').slice(0, 120);
  if (name === 'web_fetch') {
    const urls = Array.isArray(input.urls) ? input.urls : [input.urls];
    return `${urls.length} url(s): ${String(urls[0] || '').slice(0, 100)}`;
  }
  if (name === 'http_request') return `${input.method || 'GET'} ${String(input.url || '').slice(0, 120)}`;
  if (name === 'run_code') return String(input.command || input.code || '').slice(0, 120);
  if (name === 'search_sources') return String(input.query || '').slice(0, 120);
  if (name === 'tip_creator') return `${input.amount} → ${String(input.contentUrl || '').slice(0, 100)}`;
  if (name === 'unlock_content' || name === 'pay_x402') return String(input.url || '').slice(0, 120);
  return '';
}

// What came back, in one compact JSON-safe line per tool. The feed renders
// this under the call — a tool row without its result is a cliffhanger, and
// the step output alone does not cover standalone calls (run_code,
// http_request) whose results live nowhere else.
function summarizeResult(name, output) {
  try {
    if (!output || typeof output !== 'object') return null;
    if (name === 'web_search') {
      const results = Array.isArray(output.results) ? output.results : [];
      return {
        hits: results.length,
        items: results.slice(0, 8).map((r) => ({ title: String(r?.title || r?.url || '').slice(0, 120), url: r?.url || null })),
      };
    }
    if (name === 'web_fetch') {
      const docs = Array.isArray(output.documents) ? output.documents : [];
      const chars = docs.reduce((n, d) => n + String(d?.text || '').length, 0);
      return { pages: docs.length, chars, items: docs.slice(0, 8).map((d) => ({ title: String(d?.title || d?.url || '').slice(0, 120), url: d?.url || null })) };
    }
    if (name === 'http_request') {
      const body = typeof output.body === 'string' ? output.body : JSON.stringify(output.body ?? '');
      return { status: output.status ?? null, bytes: body ? body.length : 0, preview: String(body || '').slice(0, 300) };
    }
    if (name === 'run_code') {
      return {
        exitCode: output.exitCode ?? null,
        stdout: String(output.stdout || '').slice(-500),
        stderr: String(output.stderr || '').slice(-300),
      };
    }
    if (name === 'search_sources') {
      const matches = Array.isArray(output.matches) ? output.matches : [];
      return { searched: output.searched ?? null, hits: matches.length, items: matches.slice(0, 5).map((m) => ({ title: String(m?.title || m?.url || '').slice(0, 120), url: m?.url || null })) };
    }
    if (name === 'tip_creator') {
      return { tipped: output?.amount ?? null, payee: output?.payee || null, tx: output?.txHash || null };
    }
    if (name === 'unlock_content' || name === 'pay_x402') {
      const text = typeof output?.text === 'string' ? output.text : JSON.stringify(output?.data ?? '');
      return { paid: output?.amount ?? null, tx: output?.txHash || null, preview: String(text || '').slice(0, 300) };
    }
    return null;
  } catch {
    return null;
  }
}
