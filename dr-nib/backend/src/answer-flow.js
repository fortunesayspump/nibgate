// Intake answers, shared by the HTTP route and the MCP server.
//
// One implementation, two surfaces: answering a question advances the same
// transcript, sharpens the same brief, and records the same stop decision no
// matter which door the answer came through. Forking this logic per surface is
// how two clients learn to disagree about what was asked.
import { db } from './db.js';
import {
  applyAnswer, describeAnswer, nextQuestion, nextQuestions,
  remainingKeys, think,
} from './intake.js';
import { generateThinking, generateIntakeQuestion, generateIntakeBatch } from './llm/generate.js';
import { decideIntakeStop } from './jev/intake.js';

// Hard bound on intake rounds (single + batch paths share it). Healthy
// intakes converge in 2-4 questions; past the cap the brief is planned
// as-is. Without this, a generator that never converges (or a stop
// decision that never fires) loops forever — seen live at 15+ rounds.
export const MAX_INTAKE_QUESTIONS = 8;

export async function answeredKeys(runId) {
  const rows = await db.researchDecision.findMany({ where: { runId, kind: 'question' }, orderBy: { seq: 'asc' } });
  return rows.filter((r) => r.answer != null).map((r) => r.question?.key).filter(Boolean);
}

export function createQuestion(runId, seq, q) {
  return db.researchDecision.create({
    data: { runId, seq, kind: 'question', type: q.type, step: 'intake', prompt: q.prompt, question: q },
  });
}

/**
 * One thinking: the model's own read when reachable, deterministic fallback
 * otherwise, persisted as a thinking row. Independent per answer, so batches
 * run these concurrently — the batch wall clock is one thinking, not five.
 */
export async function thinkOne(runId, seq, questionObj, answer) {
  let thinkingText = think({ question: questionObj, answer });
  let thinkingSource = 'fallback';
  try {
    const live = await generateThinking({ question: questionObj, answer: describeAnswer(questionObj, answer) });
    if (live.text) {
      thinkingText = live.text;
      thinkingSource = 'llm';
      await db.researchDecision.create({
        data: {
          runId, seq: Number(seq), kind: 'thinking', step: 'intake',
          prompt: questionObj?.prompt || null, question: questionObj || {},
          output: { text: live.text, model: live.model }, confidence: null,
        },
      });
    }
  } catch {}
  return { thinkingText, thinkingSource };
}

/**
 * Record one answer: validate, save, think, sharpen the brief. Shared by the
 * single-answer and batch endpoints so both doors advance the same
 * transcript. Returns null-ok when the question does not exist.
 */
export async function recordAnswer(run, seq, answer, { reanswer = false } = {}) {
  const question = await db.researchDecision.findFirst({
    where: { runId: run.id, kind: 'question', seq: Number(seq), step: 'intake' },
  });
  if (!question) return { ok: false };
  // Re-answering is a single-answer affordance (Back button, MCP retry): the
  // requester invalidates the transcript after it first. Batches are
  // answered once, together — a batch containing an answered question is a
  // client bug, rejected rather than half-applied.
  if (question.answer != null && !reanswer) return { ok: false, error: 'question already answered' };
  if (reanswer) {
    await db.researchDecision.deleteMany({ where: { runId: run.id, kind: 'question', step: 'intake', seq: { gt: Number(seq) } } });
  }

  await db.researchDecision.update({ where: { id: question.id }, data: { answer: answer ?? {}, answeredAt: new Date() } });

  const { thinkingText, thinkingSource } = await thinkOne(run.id, seq, question.question, answer);
  const patch = applyAnswer({ run, question: question.question, answer });
  const updated = await db.researchRun.update({
    where: { id: run.id },
    data: { brief: patch.brief, metadata: patch.metadata, title: patch.title, description: patch.description },
  });
  return { ok: true, question, thinkingText, thinkingSource, updated };
}

/**
 * Record one intake answer and advance the transcript.
 * @param {object} run  an already-authorized run row
 * @returns {Promise<{status:number, body:object}>}
 */
export async function answerIntakeQuestion(run, seq, answer) {
  const recorded = await recordAnswer(run, seq, answer, { reanswer: true });
  if (!recorded.ok) return { status: 404, body: { error: 'question not found' } };
  const { question, thinkingText, thinkingSource, updated } = recorded;

  const keys = await answeredKeys(run.id);
  let next = nextQuestion(keys);
  // The question itself is generated, not banked, when a model is
  // configured: one topic-specific question per answer, same cost class as
  // the thinking call above. Anything off-spec falls back to the bank, and
  // the bank stays the decider of last resort — JEV still owns stop/go.
  try {
    const prior = await db.researchDecision.findMany({
      where: { runId: run.id, kind: 'question', answer: { not: null } },
      orderBy: { seq: 'asc' },
      select: { question: true, answer: true },
    });
    const live = await generateIntakeQuestion({
      topic: updated.brief?.topic,
      answered: prior.map((r) => ({ prompt: r.question?.prompt || r.question?.key, answer: describeAnswer(r.question, r.answer) })),
    });
    if (live.question && !keys.includes(live.question.key)) {
      next = { ...live.question, source: 'llm' };
    }
  } catch {}
  // The stop decision belongs to JEV. When it cannot be reached, the bank
  // rule (done when the bank is empty) decides instead — and the decision
  // row says which one decided, so a fallback is never mistaken for a
  // judgement.
  const stop = await decideIntakeStop({
    topic: updated.brief?.topic,
    answeredKeys: keys,
    remainingKeys: remainingKeys(keys),
    lastAnswer: describeAnswer(question.question, answer),
  });
  // Frame reject: JEV judged the current line unproductive. Intake continues,
  // but the next question is regenerated from a different angle — the LLM
  // decides the new direction, JEV only vetoed the old one. The rejected
  // prompts ride along so the generator cannot rephrase its way back.
  const reframed = stop.source === 'jev' && stop.reframe === true;
  let done = reframed ? false : stop.done;
  if (reframed) {
    try {
      const rejected = (await db.researchDecision.findMany({
        where: { runId: run.id, kind: 'question' },
        orderBy: { seq: 'asc' },
        select: { question: true },
      })).map((r) => r.question?.prompt || r.question?.key).filter(Boolean).slice(-4);
      const retry = await generateIntakeQuestion({
        topic: updated.brief?.topic,
        answered: [{ prompt: question.question?.prompt, answer: describeAnswer(question.question, answer) }],
        reframe: { rejected, reason: 'answers do not converge on anything plannable' },
      });
      if (retry.question) next = { ...retry.question, source: 'llm' };
    } catch {}
  }
  if (done == null) done = !next;
  if (!done && !next) done = true; // bank exhausted: nothing left to ask
  // Hard bound: an intake that never converges must still end. Healthy
  // intakes land in 2-4 rounds; past the cap the brief is planned as-is and
  // the cap is recorded on the decision row — never silently looped.
  let capped = false;
  if (!done) {
    const asked = await db.researchDecision.count({ where: { runId: run.id, kind: 'question' } });
    if (asked >= MAX_INTAKE_QUESTIONS) { done = true; capped = true; }
  }
  if (next && !done) await createQuestion(run.id, Number(seq) + 1, next);
  else await db.researchRun.update({ where: { id: run.id }, data: { status: 'intake-done' } });

  await db.researchDecision.create({
    data: {
      runId: run.id,
      seq: Number(seq),
      kind: 'decision',
      type: stop.source === 'jev' ? 'choice' : 'noul',
      step: 'intake-stop',
      prompt: 'Leave intake?',
      question: { options: { proceed: 'plan now', ask_more: 'ask another question', reframe: 'drop this angle, open another' } },
      answer: { picked: done ? 'proceed' : reframed ? 'reframe' : 'ask_more' },
      output: {
        decision: done ? 'proceed' : reframed ? 'reframe' : 'ask_more',
        source: stop.source,
        ...(capped ? { capped: true, cap: MAX_INTAKE_QUESTIONS } : {}),
        ...(stop.source === 'jev'
          ? { probabilities: stop.probabilities, model: stop.model, usage: stop.usage }
          : { confidence: done ? 0.9 : 0.8 }),
      },
      confidence: stop.source === 'jev' ? stop.confidence : done ? 0.9 : 0.8,
    },
  });

  return {
    status: 200,
    body: {
      thinking: thinkingText,
      thinkingSource,
      done,
      next: next ? { ...next, seq: Number(seq) + 1 } : null,
      project: { id: updated.id, title: updated.title, description: updated.description, status: updated.status, metadata: updated.metadata },
    },
  };
}

/**
 * Answer a whole batch at once. All-or-nothing validation first (a batch
 * containing an unknown or already-answered question is rejected whole —
 * half-applied batches would leave the transcript incoherent), then one
 * thinking per answer, one stop decision, and one next batch. Same
 * transcript, same stop rules as single answers.
 */
export async function answerIntakeBatch(run, answers) {
  if (!Array.isArray(answers) || !answers.length || answers.length > 5) {
    return { status: 400, body: { error: 'answers must be 1-5 {seq, answer} pairs' } };
  }
  const rows = [];
  for (const item of answers) {
    const seq = Number(item?.seq);
    if (!Number.isInteger(seq)) return { status: 400, body: { error: 'every answer needs an integer seq' } };
    const q = await db.researchDecision.findFirst({
      where: { runId: run.id, kind: 'question', seq, step: 'intake' },
    });
    if (!q) return { status: 404, body: { error: `question ${seq} not found` } };
    if (q.answer != null) return { status: 409, body: { error: `question ${seq} already answered` } };
    rows.push({ seq, answer: item?.answer ?? {}, q });
  }

  const thinkings = await Promise.all(rows.map(async ({ seq, answer, q }) => {
    const t = await thinkOne(run.id, seq, q.question, answer);
    return { seq, thinking: t.thinkingText, source: t.thinkingSource };
  }));
  // Brief patches chain sequentially (each builds on the last brief) with a
  // single write at the end — parallel updates would lose answers to races.
  let cur = { brief: run.brief, metadata: run.metadata, title: run.title, description: run.description };
  for (const { seq, answer, q } of rows) {
    await db.researchDecision.update({ where: { id: q.id }, data: { answer: answer ?? {}, answeredAt: new Date() } });
    cur = applyAnswer({
      run: { ...run, brief: cur.brief, metadata: cur.metadata, title: cur.title, description: cur.description },
      question: q.question, answer,
    });
  }
  const updated = await db.researchRun.update({
    where: { id: run.id },
    data: { brief: cur.brief, metadata: cur.metadata, title: cur.title, description: cur.description },
  });

  const keys = await answeredKeys(run.id);
  let nextBatch = nextQuestions(keys, 5);
  try {
    const prior = await db.researchDecision.findMany({
      where: { runId: run.id, kind: 'question', answer: { not: null } },
      orderBy: { seq: 'asc' },
      select: { question: true, answer: true },
    });
    const live = await generateIntakeBatch({
      topic: updated.brief?.topic,
      answered: prior.map((r) => ({ prompt: r.question?.prompt || r.question?.key, answer: describeAnswer(r.question, r.answer) })),
    });
    if (live.questions.length) {
      nextBatch = live.questions.filter((q) => !keys.includes(q.key)).map((q) => ({ ...q, source: 'llm' }));
      if (!nextBatch.length) nextBatch = nextQuestions(keys, 5);
    }
  } catch {}

  const lastAnswerDesc = `${rows.length} answer${rows.length === 1 ? '' : 's'} this batch`;
  const stop = await decideIntakeStop({
    topic: updated.brief?.topic,
    answeredKeys: keys,
    remainingKeys: remainingKeys(keys),
    lastAnswer: lastAnswerDesc,
  });
  const reframed = stop.source === 'jev' && stop.reframe === true;
  if (reframed) {
    try {
      const rejected = (await db.researchDecision.findMany({
        where: { runId: run.id, kind: 'question' },
        orderBy: { seq: 'asc' },
        select: { question: true },
      })).map((r) => r.question?.prompt || r.question?.key).filter(Boolean).slice(-6);
      const retry = await generateIntakeBatch({
        topic: updated.brief?.topic,
        answered: [],
        count: 3,
        reframe: { rejected, reason: 'answers do not converge on anything plannable' },
      });
      if (retry.questions.length) nextBatch = retry.questions.map((q) => ({ ...q, source: 'llm' }));
    } catch {}
  }
  let done = reframed ? false : stop.done;
  if (done == null) done = !nextBatch.length;
  if (!done && !nextBatch.length) done = true;
  // Same hard bound as the single-answer path (see above): never loop intake.
  let capped = false;
  if (!done) {
    const asked = await db.researchDecision.count({ where: { runId: run.id, kind: 'question' } });
    if (asked >= MAX_INTAKE_QUESTIONS) { done = true; capped = true; }
  }
  if (!done) {
    const top = await db.researchDecision.findFirst({ where: { runId: run.id, kind: 'question' }, orderBy: { seq: 'desc' }, select: { seq: true } });
    let seq = Number(top?.seq ?? -1);
    const created = [];
    for (const q of nextBatch) {
      seq += 1;
      await createQuestion(run.id, seq, q);
      created.push({ ...q, seq });
    }
    nextBatch = created;
  } else {
    await db.researchRun.update({ where: { id: run.id }, data: { status: 'intake-done' } });
  }

  await db.researchDecision.create({
    data: {
      runId: run.id,
      seq: rows[rows.length - 1].seq,
      kind: 'decision',
      type: stop.source === 'jev' ? 'choice' : 'noul',
      step: 'intake-stop',
      prompt: 'Leave intake?',
      question: { options: { proceed: 'plan now', ask_more: 'ask another batch', reframe: 'drop this angle, open another' } },
      answer: { picked: done ? 'proceed' : reframed ? 'reframe' : 'ask_more' },
      output: {
        decision: done ? 'proceed' : reframed ? 'reframe' : 'ask_more',
        source: stop.source,
        batchSize: rows.length,
        ...(capped ? { capped: true, cap: MAX_INTAKE_QUESTIONS } : {}),
        ...(stop.source === 'jev'
          ? { probabilities: stop.probabilities, model: stop.model, usage: stop.usage }
          : { confidence: done ? 0.9 : 0.8 }),
      },
      confidence: stop.source === 'jev' ? stop.confidence : done ? 0.9 : 0.8,
    },
  });

  return {
    status: 200,
    body: {
      thinkings,
      done,
      next: nextBatch,
      project: { id: updated.id, title: updated.title, description: updated.description, status: updated.status, metadata: updated.metadata },
    },
  };
}
