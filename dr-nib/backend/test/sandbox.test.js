import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake the Railway sandbox SDK so the tests never create a real VM.
const execMock = vi.fn();
const destroyMock = vi.fn();
const writeMock = vi.fn();
const createMock = vi.fn(async () => ({ exec: execMock, destroy: destroyMock, files: { write: writeMock } }));

vi.mock('railway', () => ({ Sandbox: { create: createMock } }));

const { activeSandboxCount, destroyAllSandboxes, destroySandbox, estimateSandboxCost, runInSandbox, sandboxConfigured } = await import('../src/tools/sandbox.js');

const ORIG = { t: process.env.RAILWAY_API_TOKEN, e: process.env.RAILWAY_ENVIRONMENT_ID };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RAILWAY_API_TOKEN = 'tok';
  process.env.RAILWAY_ENVIRONMENT_ID = 'env';
});
afterEach(async () => {
  await destroyAllSandboxes();
  if (ORIG.t === undefined) delete process.env.RAILWAY_API_TOKEN; else process.env.RAILWAY_API_TOKEN = ORIG.t;
  if (ORIG.e === undefined) delete process.env.RAILWAY_ENVIRONMENT_ID; else process.env.RAILWAY_ENVIRONMENT_ID = ORIG.e;
});

describe('sandbox cost model', () => {
  it('scales with seconds at VM rates', () => {
    // 60s * (2 GB + 0.6 vCPU) * ($50 / 30d)
    const expected = 60 * 2.6 * (50 / (30 * 24 * 60 * 60));
    expect(estimateSandboxCost(60)).toBeCloseTo(expected, 6);
  });

  it('is zero for zero time and never negative', () => {
    expect(estimateSandboxCost(0)).toBe(0);
    expect(estimateSandboxCost(-5)).toBe(0);
  });
});

describe('runInSandbox', () => {
  it('runs a command, captures output, and reports metered cost', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: 'hello', stderr: '', timedOut: false, truncated: false });
    const out = await runInSandbox('run-a', 'echo hello', { timeoutSec: 5 });
    expect(out.stdout).toBe('hello');
    expect(out.exitCode).toBe(0);
    expect(out.costUsd).toBeGreaterThanOrEqual(0);
    expect(execMock).toHaveBeenCalledWith('echo hello', expect.objectContaining({ timeoutSec: 5 }));
  });

  it('creates one sandbox per run and reuses it across calls', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false, truncated: false });
    await runInSandbox('run-b', 'a');
    await runInSandbox('run-b', 'b');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(activeSandboxCount()).toBe(1);
  });

  it('destroys the sandbox on cleanup', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', timedOut: false, truncated: false });
    await runInSandbox('run-c', 'a');
    await destroySandbox('run-c');
    expect(activeSandboxCount()).toBe(0);
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it('refuses clearly when sandbox execution is not configured', async () => {
    delete process.env.RAILWAY_API_TOKEN;
    expect(sandboxConfigured()).toBe(false);
    await expect(runInSandbox('run-d', 'ls')).rejects.toThrow(/not configured/);
  });
});
