// Real-Postgres contract test. Vitest's global setup refuses any schema other
// than drnib_test and prepares it; run this only against a disposable database.
// All fixture content, keys, and HPKE recipients are synthetic. No AI or network
// provider is invoked by the test body.
import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { createPrivateWorkerStore } from '../src/privacy/private-worker-store.js';
import { createPrivateExecuteJournal } from '../src/privacy/private-execute-journal.js';
import { generateHpkeRecipient, recipientIdForPublicKey, sealHpkeReport, sealHpkeSource } from '../src/privacy/source-hpke.js';

const CANARY = 'SYNTHETIC_PRIVATE_PG_CANARY_8d97b4';

async function withRun(status, body) {
  const id = randomUUID();
  const tenantId = `private-pg-test-${id}`;
  await db.researchRun.create({ data: {
    id, userId: tenantId, title: null, description: null,
    brief: { encrypted: true }, metadata: { privacyMode: 'confidential', schemaVersion: 1 },
    plan: null, pendingQuestion: null, pendingGuidance: null, status, versions: 1,
  } });
  try { return await body({ id, tenantId }); }
  finally { await db.researchRun.delete({ where: { id } }); }
}

function worker(tenantId, key, client = db) {
  return createPrivateWorkerStore({
    db: client, tenantId,
    // An injected fixture key stands in for measured-guest key release.
    keyProvider: async ({ tenantId: owner }) => {
      expect(owner).toBe(tenantId);
      return key;
    },
  });
}

function expectNoCanary(rows) {
  expect(JSON.stringify(rows)).not.toContain(CANARY);
}

async function persisted(id) {
  const [run, objects, steps, reports, sources, claims, decisions] = await Promise.all([
    db.researchRun.findUnique({ where: { id } }),
    db.privateWorkerObject.findMany({ where: { runId: id } }),
    db.researchStep.findMany({ where: { runId: id } }),
    db.researchReport.findMany({ where: { runId: id } }),
    db.researchSource.findMany({ where: { runId: id } }),
    db.researchClaim.findMany({ where: { runId: id } }),
    db.researchDecision.findMany({ where: { runId: id } }),
  ]);
  return { run, objects, steps, reports, sources, claims, decisions };
}

async function preparedWrite(id, tenantId, key) {
  const store = worker(tenantId, key);
  const run = await store.loadRun(id);
  const browser = await generateHpkeRecipient();
  const sourceId = randomUUID();
  const initial = {
    brief: { topic: CANARY, liveWeb: false, lengthWords: 300 },
    plan: null, pendingGuidance: null,
    resultRecipientPublicKey: Buffer.from(browser.publicKey).toString('base64'),
  };
  const source = { provider: 'user-upload', url: `user-upload://${sourceId}`, title: CANARY, text: CANARY };
  await store.putRunState(run, { expectedRevision: 0, state: initial });
  await store.putSource(run, { sourceId, source });
  const planClaim = await store.beginStage({ run, kind: 'plan', attempt: 1 });
  expect(planClaim.state).toBe('claimed');
  const plan = { sub_questions: [CANARY], inputDigest: 'synthetic-fixture' };
  await store.finishStage({ run, kind: 'plan', attempt: 1, lease: planClaim.lease, output: plan });
  await store.commitPlan(run, { attempt: 1, expectedRevision: 1, nextState: { ...initial, plan: { ...plan, stageAttempt: 1 } } });
  await store.startSourceOnlyWrite(run);
  const report = { markdown: `# Synthetic report\n\n${CANARY}.`, inputDigest: 'a'.repeat(64), citations: [] };
  const writeClaim = await store.beginStage({ run, kind: 'write', attempt: 1 });
  expect(writeClaim.state).toBe('claimed');
  await store.finishStage({ run, kind: 'write', attempt: 1, lease: writeClaim.lease, output: report });
  await store.commitReport(run, { version: 1, stateRevision: 3, sourceVersions: [{ objectId: sourceId, revision: 1 }], report });
  const envelope = await sealHpkeReport({
    recipientPublicKey: browser.publicKey,
    context: { tenantId, runId: id, objectId: id, revision: 1, purpose: 'report', recipientId: recipientIdForPublicKey(browser.publicKey) },
    plaintext: Buffer.from(JSON.stringify({ markdown: report.markdown })),
  });
  return { store, run, envelope, sourceId };
}

// Fail after ResearchReport.create, inside the genuine Prisma transaction.
// If the report survives this synthetic fault, completion was not atomic.
function failCompletionStatusUpdate() {
  return {
    researchRun: db.researchRun,
    privateWorkerObject: db.privateWorkerObject,
    researchStep: db.researchStep,
    researchReport: db.researchReport,
    $transaction: (fn, options) => db.$transaction(tx => fn({
      $queryRaw: (...args) => tx.$queryRaw(...args),
      researchRun: {
        findUnique: (...args) => tx.researchRun.findUnique(...args),
        update: (...args) => {
          if (args[0]?.data?.status === 'complete') throw new Error('synthetic status-write failure');
          return tx.researchRun.update(...args);
        },
      },
      privateWorkerObject: tx.privateWorkerObject,
      researchStep: tx.researchStep,
      researchReport: tx.researchReport,
    }), options),
  };
}

describe('private worker and journal Postgres invariants', () => {
  it('serializes concurrent stage claims across independent store instances and persists only a sealed checkpoint', async () => {
    await withRun('planning', async ({ id, tenantId }) => {
      const key = randomBytes(32);
      const stores = [worker(tenantId, key), worker(tenantId, key)];
      const run = await stores[0].loadRun(id);
      const claims = await Promise.all(Array.from({ length: 4 }, (_, i) =>
        stores[i % 2].beginStage({ run, kind: 'plan', attempt: 1 })));
      expect(claims.filter(x => x.state === 'claimed')).toHaveLength(1);
      expect(claims.filter(x => x.state === 'uncertain')).toHaveLength(3);
      const lease = claims.find(x => x.state === 'claimed').lease;
      const output = { sub_questions: [CANARY] };
      await stores[0].finishStage({ run, kind: 'plan', attempt: 1, lease, output });
      expect(await stores[1].beginStage({ run, kind: 'plan', attempt: 1 })).toEqual({ state: 'done', output });
      const rows = await persisted(id);
      expect(rows.steps).toHaveLength(1);
      expect(rows.steps[0].output).toEqual({ encrypted: true, format: 'private-worker-object-v1', objectId: lease, revision: 1 });
      expect(rows.objects.filter(x => x.kind === 'step')).toHaveLength(1);
      expectNoCanary(rows);
    });
  });

  it('rejects a stale state revision under a real transaction and keeps the winning ciphertext', async () => {
    await withRun('planning', async ({ id, tenantId }) => {
      const key = randomBytes(32), first = worker(tenantId, key), second = worker(tenantId, key);
      const run = await first.loadRun(id);
      const results = await Promise.allSettled([
        first.putRunState(run, { expectedRevision: 0, state: { brief: { topic: `${CANARY}-one` } } }),
        second.putRunState(run, { expectedRevision: 0, state: { brief: { topic: `${CANARY}-two` } } }),
      ]);
      expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
      expect(results.find(x => x.status === 'rejected').reason.code).toBe('PRIVATE_STATE_CONFLICT');
      await expect(first.putRunState(run, { expectedRevision: 0, state: { brief: { topic: CANARY } } }))
        .rejects.toMatchObject({ code: 'PRIVATE_STATE_CONFLICT' });
      expect((await first.getRunState(run)).revision).toBe(1);
      const rows = await persisted(id);
      expect(rows.objects.filter(x => x.kind === 'state')).toHaveLength(1);
      expectNoCanary(rows);
    });
  });

  it('refuses a stale run version before a new stage claim or plan commit', async () => {
    await withRun('planning', async ({ id, tenantId }) => {
      const store = worker(tenantId, randomBytes(32));
      const stale = await store.loadRun(id);
      await db.researchRun.update({ where: { id }, data: { versions: 2 } });
      expect(await store.beginStage({ run: stale, kind: 'plan', attempt: 1 }))
        .toEqual({ state: 'uncertain' });
      await expect(store.commitPlan(stale, { attempt: 1, expectedRevision: 1,
        nextState: { plan: { stageAttempt: 1, sub_questions: [CANARY] } } }))
        .rejects.toMatchObject({ code: 'PRIVATE_STATE_CONFLICT' });
      const rows = await persisted(id);
      expect(rows.steps).toHaveLength(0);
      expect(rows.objects).toHaveLength(0);
      expectNoCanary(rows);
    });
  });

  it('rolls back the browser report when the final status write fails, then completes once with ciphertext only', async () => {
    await withRun('planning', async ({ id, tenantId }) => {
      const key = randomBytes(32);
      const { store, run, envelope } = await preparedWrite(id, tenantId, key);
      const failing = worker(tenantId, key, failCompletionStatusUpdate());
      await expect(failing.completeSourceOnlyRun(run, { reportId: id, envelope }))
        .rejects.toMatchObject({ code: 'PRIVATE_STORE_UNAVAILABLE' });
      expect((await persisted(id)).reports).toHaveLength(0);
      expect((await db.researchRun.findUnique({ where: { id } })).status).toBe('running');
      expect(await store.completeSourceOnlyRun(run, { reportId: id, envelope }))
        .toEqual({ id, version: 1, encrypted: true, replayed: false });
      expect(await store.completeSourceOnlyRun(run, { reportId: id, envelope }))
        .toEqual({ id, version: 1, encrypted: true, replayed: true });
      const rows = await persisted(id);
      expect(rows.run.status).toBe('complete');
      expect(rows.reports).toHaveLength(1);
      expect(JSON.parse(rows.reports[0].markdown)).toEqual({ encrypted: true, format: 'hpke-report-v2', envelope });
      expect(rows.sources).toHaveLength(0);
      expect(rows.claims).toHaveLength(0);
      expect(rows.decisions).toHaveLength(0);
      expectNoCanary(rows);
    });
  });

  it('journals concurrent encrypted requests once without persisting source plaintext', async () => {
    await withRun('draft', async ({ id, tenantId }) => {
      const guest = await generateHpkeRecipient();
      const sourceEnvelope = await sealHpkeSource({
        recipientPublicKey: guest.publicKey,
        context: { tenantId, runId: id, objectId: randomUUID(), revision: 1, purpose: 'source', recipientId: guest.recipientId },
        plaintext: Buffer.from(CANARY),
      });
      const withRunLock = (runId, fn) => db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
        return fn(tx);
      }, { maxWait: 10000, timeout: 15000 });
      const journal = createPrivateExecuteJournal({ withRunLock });
      const claims = await Promise.all(Array.from({ length: 4 }, () =>
        journal.claim({ tenantId, runId: id, sourceEnvelope })));
      expect(claims.filter(x => x.state === 'start')).toHaveLength(1);
      expect(claims.filter(x => x.state === 'processing')).toHaveLength(3);
      expect((await journal.status({ tenantId, runId: id })).state).toBe('processing');
      const rows = await persisted(id);
      expect(rows.steps).toHaveLength(1);
      expect(rows.steps[0].input).toMatchObject({ encrypted: true, format: 'private-execute-v1' });
      expect(rows.steps[0].input.requestDigest).toMatch(/^[0-9a-f]{64}$/);
      expectNoCanary(rows);
    });
  });

  it('permits a measured plan stage under the active parent journal without double-claiming', async () => {
    await withRun('draft', async ({ id, tenantId }) => {
      const guest = await generateHpkeRecipient();
      const sourceEnvelope = await sealHpkeSource({ recipientPublicKey: guest.publicKey,
        context: { tenantId, runId: id, objectId: randomUUID(), revision: 1, purpose: 'source', recipientId: guest.recipientId },
        plaintext: Buffer.from(CANARY) });
      const keyEnvelope = await sealHpkeSource({ recipientPublicKey: guest.publicKey,
        context: { tenantId, runId: id, objectId: randomUUID(), revision: 1, purpose: 'source', recipientId: guest.recipientId },
        plaintext: Buffer.from('synthetic key envelope fixture') });
      const withRunLock = (runId, fn) => db.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))::text AS locked`;
        return fn(tx);
      }, { maxWait: 10000, timeout: 15000 });
      const journal = createPrivateExecuteJournal({ withRunLock });
      expect((await journal.claim({ tenantId, runId: id, sourceEnvelope, keyEnvelope })).state).toBe('start');
      await db.researchRun.update({ where: { id }, data: { status: 'planning' } });
      const key = randomBytes(32), stores = [worker(tenantId, key), worker(tenantId, key)];
      const run = await stores[0].loadRun(id);
      const claims = await Promise.all(stores.map(store => store.beginStage({ run, kind: 'plan', attempt: 1 })));
      expect(claims.filter(x => x.state === 'claimed')).toHaveLength(1);
      expect(claims.filter(x => x.state === 'uncertain')).toHaveLength(1);
      const rows = await persisted(id);
      expect(rows.steps.filter(x => x.kind === 'private-execute' && x.status === 'active')).toHaveLength(1);
      expect(rows.steps.filter(x => x.kind === 'plan' && x.status === 'active')).toHaveLength(1);
      expectNoCanary(rows);
    });
  });
});
