// Intake answers, shared by the HTTP route and the MCP server.
//
// One implementation, two surfaces: answering a question advances the same
// transcript, sharpens the same brief, and records the same stop decision no
// matter which door the answer came through. Forking this logic per surface is
// how two clients learn to disagree about what was asked.
import { db } from './db.js';
import {
  applyAnswer, describeAnswer, nextQuestion,
  remainingKeys, think,
} from './intake.js';
import { generateThinking, generateIntakeQuestion } from './llm/generate.js';
import { decideIntakeStop } from './jev/intake.js';

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
 * Record one intake answer and advance the transcript.
 * @param {object} run  an already-authorized run row
 * @returns {Promise<{status:number, body:object}>}
 */
export async function answerIntakeQuestion(run, seq, answer) {
  const question = await db.researchDecision.findFirst({
    where: { runId: run.id, kind: 'question', seq: Number(seq), step: 'intake' },
  });
  if (!question) return { status: 404, body: { error: 'question not found' } };

  await db.researchDecision.deleteMany({ where: { runId: run.id, kind: 'question', step: 'intake', seq: { gt: Number(seq) } } });
  await db.researchDecision.update({ where: { id: question.id }, data: { answer: answer ?? {}, answeredAt: new Date() } });

  // The visible reasoning is the model's own words when one is configured;
  // the deterministic line is the fallback, and the response says which.
  let thinkingText = think({ question: question.question, answer });
  let thinkingSource = 'fallback';
  try {
    const live = await generateThinking({ question: question.question, answer: describeAnswer(question.question, answer) });
    if (live.text) {
      thinkingText = live.text;
      thinkingSource = 'llm';
      await db.researchDecision.create({
        data: {
          runId: run.id, seq: Number(seq), kind: 'thinking', step: 'intake',
          prompt: question.question?.prompt || null, question: question.question || {},
          output: { text: live.text, model: live.model }, confidence: null,
        },
      });
    }
  } catch {}
  const patch = applyAnswer({ run, question: question.question, answer });
  const updated = await db.researchRun.update({
    where: { id: run.id },
    data: { brief: patch.brief, metadata: patch.metadata, title: patch.title, description: patch.description },
  });

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
      next: next || null,
      project: { id: updated.id, title: updated.title, description: updated.description, status: updated.status, metadata: updated.metadata },
    },
  };
}
