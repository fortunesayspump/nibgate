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
import { generateThinking } from './llm/generate.js';
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
  const next = nextQuestion(keys);
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
  let done = stop.done;
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
      question: { options: { proceed: 'plan now', ask_more: 'ask another question' } },
      answer: { picked: done ? 'proceed' : 'ask_more' },
      output: {
        decision: done ? 'proceed' : 'ask_more',
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
