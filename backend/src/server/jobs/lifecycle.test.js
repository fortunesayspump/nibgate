import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createIdleDatabaseController, installIdleDatabaseDisconnect } from '../../../../packages/internal/src/idle-database.js';
import { runFeeWorker } from './fee-worker.js';

afterEach(() => { vi.useRealTimers(); });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

describe('idle DB lifecycle', () => {
  it('never disconnects during a query or a whole transaction; reconnect waits for disconnect', async () => {
    vi.useFakeTimers();
    const closing = deferred(); const disconnect = vi.fn(() => closing.promise);
    const operation = createIdleDatabaseController({ disconnect, idleMs: 1000 });
    const transaction = deferred(); const active = operation(() => transaction.promise);
    await vi.advanceTimersByTimeAsync(5000); expect(disconnect).not.toHaveBeenCalled();
    transaction.resolve(); await active;
    await vi.advanceTimersByTimeAsync(1000); expect(disconnect).toHaveBeenCalledOnce();
    const query = vi.fn(); const next = operation(query);
    await Promise.resolve(); expect(query).not.toHaveBeenCalled();
    closing.resolve(); await next; expect(query).toHaveBeenCalledOnce();
  });
  it('wraps interactive and batch transactions, and arms cleanup after errors', async () => {
    vi.useFakeTimers(); let middleware;
    const tx = deferred(); const client = { $disconnect: vi.fn(), $use: f => { middleware = f; }, $transaction: vi.fn(() => tx.promise) };
    installIdleDatabaseDisconnect(client, 1000);
    const active = client.$transaction(() => {});
    await middleware({}, async () => 'query');
    await vi.advanceTimersByTimeAsync(3000); expect(client.$disconnect).not.toHaveBeenCalled();
    tx.resolve(); await active;
    await expect(middleware({}, async () => { throw Error('query failure'); })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000); expect(client.$disconnect).toHaveBeenCalledOnce();
  });
});

describe('dedicated financial worker lifecycle', () => {
  it('drains an in-flight sweep before disconnecting on termination', async () => {
    const signals = new EventEmitter(); const pending = deferred(); const started = deferred();
    const disconnect = vi.fn();
    const job = runFeeWorker({ sweep: () => { started.resolve(); return pending.promise; }, disconnect, signals });
    await started.promise; signals.emit('SIGTERM'); expect(disconnect).not.toHaveBeenCalled();
    pending.resolve(); await job; expect(disconnect).toHaveBeenCalledOnce();
  });
  it('keeps the 15-minute cadence and stops without a second sweep', async () => {
    vi.useFakeTimers(); const signals = new EventEmitter(); const sweep = vi.fn();
    const job = runFeeWorker({ sweep, disconnect: vi.fn(), signals });
    await vi.advanceTimersByTimeAsync(14 * 60_000); expect(sweep).toHaveBeenCalledOnce();
    signals.emit('SIGTERM'); await job; expect(sweep).toHaveBeenCalledOnce();
  });
});
