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
import { compute } from './compute.js';
import { searchEvidence } from './evidence.js';
import { runInSandbox, sandboxConfigured, writeSandboxFile } from './sandbox.js';

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
      need(input, 'urls');
      const urls = (Array.isArray(input.urls) ? input.urls : [input.urls]).map(String).slice(0, 20);
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

  compute: {
    description: 'Crunch small numbers over collected evidence: arithmetic, simple statistics, tables. Sandboxed expression only — no network, files, or time. For anything heavier (parsing a PDF, plotting, installing a package, real files) use run_code.',
    cost: 'zero',
    async run(input) {
      need(input, 'code');
      const out = await compute({ code: input.code, input: input.input ?? null });
      return { output: out, costUsd: 0 };
    },
  },

  run_code: {
    description: 'Run a shell command or a script in an isolated ephemeral Linux VM: install packages, parse documents, compute statistics and charts, run CLI tools. No access to platform secrets or the private network; the VM is discarded after the run.',
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
  if (name === 'compute') return String(input.code || '').slice(0, 120);
  if (name === 'run_code') return String(input.command || input.code || '').slice(0, 120);
  if (name === 'search_sources') return String(input.query || '').slice(0, 120);
  return '';
}
