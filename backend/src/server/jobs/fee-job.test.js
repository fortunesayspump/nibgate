import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { runFeeJob } from './fee-worker.js';
it('runs once and closes connections after success without a recurring timer', async () => {
 const sweep=vi.fn(async()=>({wallets:[],holding:{results:[]}}));const disconnect=vi.fn();
 await runFeeJob({sweep,disconnect});expect(sweep).toHaveBeenCalledOnce();expect(disconnect).toHaveBeenCalledOnce();
});
it('drains outstanding financial work before cleanup',async()=>{
 let finish;const pending=new Promise(r=>{finish=r;});const disconnect=vi.fn();
 const signals=new EventEmitter();
 const job=runFeeJob({sweep:()=>pending,disconnect,signals});await Promise.resolve();signals.emit('SIGTERM');expect(disconnect).not.toHaveBeenCalled();
 finish({wallets:[]});await job;expect(disconnect).toHaveBeenCalledOnce();
});
it.each([{error:'failed'},{disabled:true},{skipped:'busy'},{wallets:[{gateway:{reason:'gateway: insufficient funds'}}]},{holding:{results:[{error:'failed'}]}}])('reports incomplete work and still closes connections: %j',async result=>{
 const disconnect=vi.fn();await expect(runFeeJob({sweep:async()=>result,disconnect})).rejects.toThrow('incomplete');expect(disconnect).toHaveBeenCalledOnce();
});
it('preserves thrown failure and disconnects',async()=>{
 const error=Error('failed');const disconnect=vi.fn();await expect(runFeeJob({sweep:async()=>{throw error;},disconnect})).rejects.toBe(error);expect(disconnect).toHaveBeenCalledOnce();
});
