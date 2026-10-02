import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../queue.js', () => ({
  queueMode: () => 'test',
  initQueue: async () => {},
  enqueue: async () => ({ id: 'test-job', mode: 'test' }),
  startWorkers: () => {},
  closeQueue: async () => {},
}));

const { mcp } = await import('./routes.js');
const { db } = await import('../db.js');
const { toDb } = await import('../units.js');

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const ORIG_KEY = process.env.DRNIB_SERVICE_KEY;

const app = express();
app.use(express.json());
app.use('/mcp', mcp);

const call = (method, params, key) => {
  const headers = key === null ? {} : { authorization: `Bearer ${key === undefined ? 'test-service-key' : key}` };
  return request(app).post('/mcp').set(headers).send({ jsonrpc: '2.0', id: 1, method, params });
};

async function wipe() {
  const runs = await db.researchRun.findMany({ where: { userId: { in: [`wallet:${WALLET.toLowerCase()}`, `wallet:${OTHER.toLowerCase()}`] } }, select: { id: true } });
  const ids = runs.map((r) => r.id);
  if (!ids.length) return;
  await db.researchEvent.deleteMany({ where: { runId: { in: ids } } });
  await db.researchClaim.deleteMany({ where: { runId: { in: ids } } });
  await db.researchSource.deleteMany({ where: { runId: { in: ids } } });
  await db.researchStep.deleteMany({ where: { runId: { in: ids } } });
  await db.budgetLedger.deleteMany({ where: { runId: { in: ids } } });
  await db.researchReport.deleteMany({ where: { runId: { in: ids } } });
  await db.researchDecision.deleteMany({ where: { runId: { in: ids } } });
  await db.researchExport.deleteMany({ where: { runId: { in: ids } } });
  await db.researchRun.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  process.env.DRNIB_SERVICE_KEY = 'test-service-key';
  await wipe();
});
afterEach(async () => {
  await wipe();
  if (ORIG_KEY === undefined) delete process.env.DRNIB_SERVICE_KEY;
  else process.env.DRNIB_SERVICE_KEY = ORIG_KEY;
});

const textOf = (res) => JSON.parse(res.body.result.content[0].text);

describe('mcp protocol', () => {
  it('serves a discovery card without auth', async () => {
    const res = await request(app).get('/mcp');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('dr-nib');
    expect(res.body.tools).toContain('create_run');
  });

  it('answers initialize and lists the tools', async () => {
    const init = await call('initialize', {});
    expect(init.body.result.serverInfo.name).toBe('dr-nib');
    const list = await call('tools/list', {});
    const names = list.body.result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['create_run', 'answer_question', 'configure_run', 'approve_plan', 'get_report']));
  });

  it('rejects bad auth and unknown methods', async () => {
    expect((await call('tools/list', {}, null)).status).toBe(401);
    expect((await call('tools/list', {}, 'wrong')).status).toBe(401);
    expect((await call('nope', {}, undefined)).body.error.code).toBe(-32601);
  });

  it('reports unknown tools as errors, not crashes', async () => {
    const res = await call('tools/call', { name: 'bash', arguments: {} });
    expect(res.body.result.isError).toBe(true);
  });
});

describe('mcp run flow', () => {
  it('an agent commissions, configures, and ends a run end to end', async () => {
    const created = await call('tools/call', { name: 'create_run', arguments: { ownerWallet: WALLET, topic: 'should I depend on x402' } });
    expect(created.body.result.isError).toBeFalsy();
    const run = textOf(created);
    expect(run.status).toBe('intake');
    expect(run.question).toBeTruthy();

    for (let seq = 0; seq < 4; seq++) {
      const answered = await call('tools/call', {
        name: 'answer_question', arguments: { ownerWallet: WALLET, runId: run.id, seq, answer: { text: `answer ${seq}` } },
      });
      expect(answered.body.result.isError).toBeFalsy();
    }
    const configured = await call('tools/call', {
      name: 'configure_run', arguments: { ownerWallet: WALLET, runId: run.id, budgetCap: 2.5 },
    });
    expect(textOf(configured).status).toBe('planning');

    // Another wallet sees nothing, not even existence.
    const stolen = await call('tools/call', { name: 'get_run', arguments: { ownerWallet: OTHER, runId: run.id } });
    expect(stolen.body.result.isError).toBe(true);

    const ended = await call('tools/call', { name: 'end_run', arguments: { ownerWallet: WALLET, runId: run.id } });
    const endedBody = textOf(ended);
    expect(endedBody.status).toBe('ended');
    expect(endedBody.refunded).toBeCloseTo(2.5, 6);
  });
});
