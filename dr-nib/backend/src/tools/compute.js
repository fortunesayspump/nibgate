// compute — the run's scratchpad for numbers.
//
// Statistics, tables, and charts over collected evidence need arithmetic, not
// prose. This is a sandboxed evaluator, not a shell: the code runs in an empty
// VM context with only Math, JSON, and the inputs it is given — no require,
// no fetch, no process, no timers — with a hard timeout so a loop cannot hold
// a run hostage. Anything it cannot do (network, files, time) is a different
// tool's job.
import vm from 'node:vm';

const DEFAULT_TIMEOUT_MS = 2000;
const MAX_RESULT_CHARS = 20000;

function sandbox(input) {
  const frozen = (o) => {
    for (const k of Object.getOwnPropertyNames(o)) {
      try {
        const v = o[k];
        if (v && (typeof v === 'object' || typeof v === 'function')) frozen(v);
      } catch {}
    }
    return Object.freeze(o);
  };
  const context = {
    Math: frozen({ ...Math }),
    JSON: frozen({ ...JSON }),
    Number: frozen(Number),
    BigInt,
    Array, Object, String, Boolean, Map, Set,
    input: frozen(JSON.parse(JSON.stringify(input ?? null))),
  };
  return vm.createContext(context);
}

function sanitized(value) {
  const text = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
  if (text === undefined) throw new Error('result is not JSON-serializable');
  if (text.length > MAX_RESULT_CHARS) throw new Error('result too large');
  return JSON.parse(text);
}

/**
 * Evaluate `code` (an expression or a `return`-less body whose completion
 * value is taken) against `input`. @returns {Promise<{result:any}>}
 */
export async function compute({ code, input = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const src = String(code || '').trim();
  if (!src) throw new Error('code is required');
  if (src.length > 20000) throw new Error('code too large');
  // Everything runs inside one function scope: a bare expression becomes its
  // return value, and statement bodies may use return freely.
  const body = src.includes('return') || /;\s*$/.test(src) ? src : `return (${src});`;
  const wrapped = `(function() { "use strict";\n${body}\n})()`;
  let result;
  try {
    const script = new vm.Script(wrapped, { timeout: 500 });
    result = script.runInContext(sandbox(input), {
      timeout: Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 100), 10000),
      breakOnSigint: false,
    });
    if (result && typeof result.then === 'function') throw new Error('async is not supported');
  } catch (err) {
    throw new Error(`compute failed: ${err.message}`);
  }
  return { result: sanitized(result) };
}
