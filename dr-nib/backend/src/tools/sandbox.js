// Sandboxed execution — the real boundary for model-authored code.
//
// Node's `vm` (used by the `compute` tool) is documented as *not* a security
// boundary: it is fine for tiny arithmetic we inject no I/O into, but it must
// never run adversarial code. Since the model writes the code, heavy execution
// belongs in an isolated VM. Railway sandboxes give us exactly that: ephemeral,
// network-isolated Linux VMs, created per run, reused across a run's tool calls,
// and destroyed when it finishes.
//
// Hard rule: NO SECRETS IN THE SANDBOX. It runs untrusted code, so it gets no
// API keys and no wallet keys. Signing and payment stay in the trusted backend;
// the sandbox only reads, computes, and produces artifacts we copy out.

// runId -> live sandbox handle
const sandboxes = new Map();
let sdkPromise = null;

function loadSdk() {
  if (!sdkPromise) sdkPromise = import('railway').catch(() => null);
  return sdkPromise;
}

/** Sandboxes need an API token and an environment id — same pair the CLI uses. */
export function sandboxConfigured() {
  return Boolean(process.env.RAILWAY_API_TOKEN && process.env.RAILWAY_ENVIRONMENT_ID);
}

export function sandboxIdleMinutes() {
  const n = Number(process.env.DRNIB_SANDBOX_IDLE_MINUTES);
  return Number.isInteger(n) && n >= 0 ? n : 10;
}

async function getSandbox(runId) {
  const existing = sandboxes.get(runId);
  if (existing) return existing;
  const mod = await loadSdk();
  if (!mod?.Sandbox) throw new Error('railway sandbox SDK is not installed on this deployment');
  const sandbox = await mod.Sandbox.create({
    // ISOLATED: outbound internet only, no private network — untrusted code
    // cannot reach our Postgres or other services.
    networkIsolation: 'ISOLATED',
    idleTimeoutMinutes: sandboxIdleMinutes(),
    // Deliberately no `env`: nothing secret belongs inside the sandbox.
  });
  sandboxes.set(runId, sandbox);
  return sandbox;
}

// VM rates: $50 / GB-month and $50 / vCPU-month, metered per second. We assume
// the default 2 vCPU / 2 GB size, full memory in use, and a conservative 0.6
// vCPU of actual load — an over-estimate that refunds on settle rather than an
// under-estimate that spends money the run did not hold.
const VM_DOLLARS_PER_UNIT_SECOND = 50 / (30 * 24 * 60 * 60);
export function estimateSandboxCost(seconds, { memoryGB = 2, cpu = 0.6 } = {}) {
  const s = Math.max(0, Number(seconds) || 0);
  const cost = s * (memoryGB + cpu) * VM_DOLLARS_PER_UNIT_SECOND;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * Run one command in the run's sandbox.
 * @returns {Promise<{exitCode:number|null, stdout:string, stderr:string, timedOut:boolean, truncated:boolean, seconds:number, costUsd:number}>}
 */
export async function runInSandbox(runId, command, { timeoutSec = 120, cwd } = {}) {
  if (!sandboxConfigured()) throw new Error('sandbox execution is not configured on this deployment');
  const sandbox = await getSandbox(runId);
  const started = Date.now();
  const result = await sandbox.exec(String(command), { timeoutSec, ...(cwd ? { cwd } : {}) });
  const seconds = (Date.now() - started) / 1000;
  return {
    exitCode: result.exitCode ?? null,
    stdout: String(result.stdout ?? '').slice(0, 20000),
    stderr: String(result.stderr ?? '').slice(0, 4000),
    timedOut: Boolean(result.timedOut),
    truncated: Boolean(result.truncated),
    seconds,
    costUsd: estimateSandboxCost(seconds),
  };
}

/** Write seed files (the model's script, input data) before running. */
export async function writeSandboxFile(runId, path, content) {
  const sandbox = await getSandbox(runId);
  await sandbox.files.write(path, String(content));
}

export async function destroySandbox(runId) {
  const sandbox = sandboxes.get(runId);
  if (!sandbox) return;
  sandboxes.delete(runId);
  try {
    await sandbox.destroy();
  } catch (err) {
    // Never let teardown failure break the run; record it if the event log is
    // importable, otherwise swallow.
    try {
      const { recordEvent } = await import('../eventlog.js');
      await recordEvent(runId, { type: 'sandbox.destroy.failed', error: String(err?.message || err).slice(0, 200) });
    } catch {}
  }
}

export async function destroyAllSandboxes() {
  for (const runId of [...sandboxes.keys()]) await destroySandbox(runId);
}

export function activeSandboxCount() {
  return sandboxes.size;
}
