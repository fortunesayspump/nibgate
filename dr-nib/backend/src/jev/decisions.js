// JEV-backed decisions, logged and streamed.
//
// Every judgement a run makes goes through here. Three things happen together,
// and they are the reason the run is auditable:
//   1. JEV is asked with a real set of options and the state it reasons over.
//   2. The full decision — question, options, probabilities, pick, model, cost
//      — is written to ResearchDecision (the run audit trail).
//   3. The same record is published to the feed, so the reasoning is visible
//      where it happened, not just in a log.
//
// If JEV is unreachable the run PARKS (pauseReason 'jev'); it never falls back
// to letting the model decide. A parked-at-JEV run is resumable once the
// decision seat is back.
import { db } from '../db.js';
import { recordEvent } from '../eventlog.js';
import { JevUnavailable, decide, classify, grade } from './client.js';

async function nextSeq(runId) {
  const last = await db.researchDecision.findFirst({ where: { runId }, orderBy: { seq: 'desc' } });
  return (last?.seq ?? -1) + 1;
}

async function persist(runId, record) {
  const row = await db.researchDecision.create({
    data: {
      runId,
      seq: await nextSeq(runId),
      kind: 'decision',
      type: record.type || 'choice',
      step: record.step,
      prompt: record.prompt || null,
      question: record.question || {},
      criteria: record.criteria || null,
      output: record.output || {},
      confidence: Number.isFinite(record.confidence) ? record.confidence : null,
    },
  });
  await recordEvent(runId, {
    type: 'decision',
    id: row.id,
    step: record.step,
    prompt: record.prompt || null,
    question: record.question || {},
    probabilities: record.output?.probabilities || null,
    pick: record.output?.choice ?? null,
    confidence: row.confidence,
    model: record.output?.model || null,
  });
  return row;
}

// Park the run because the decision seat is down. The balance is untouched;
// this is a "cannot think" pause, not a budget pause.
async function parkForJev(runId, step, error) {
  await db.researchRun.update({
    where: { id: runId },
    data: { status: 'paused', pauseReason: 'jev' },
  });
  await recordEvent(runId, { type: 'status', status: 'paused', pauseReason: 'jev', step, error: error?.message || null });
}

/**
 * Ask JEV to choose one option. Returns the decision, or null when JEV is
 * unavailable (having parked the run). JEV is not optional — a null return
 * means "stop and wait", never "guess".
 */
export async function runChoice(runId, { step, state, instructions, options, questionId = 'choice', prompt }, opts) {
  try {
    const out = await decide({ state, instructions, candidates: options, questionId }, opts);
    const row = await persist(runId, {
      type: 'choice',
      step,
      prompt: prompt || instructions,
      question: { instructions, options },
      output: { choice: out.pick, probabilities: out.probabilities, model: out.model, usage: out.usage },
      confidence: out.confidence,
    });
    // `seq` lets a caller derive a stable, resume-safe step attempt from a
    // decision it just recorded (see the worker's expansion round).
    return { ...out, seq: row.seq };
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    await parkForJev(runId, step, err);
    return null;
  }
}

/** Ask JEV for one calibrated probability. Same parking contract as runChoice. */
export async function runNoul(runId, { step, state, instructions, questionId = 'noul', prompt }, opts) {  try {
    const out = await classify({ state, instructions }, opts);
    await persist(runId, {
      type: 'noul',
      step,
      prompt: prompt || instructions,
      question: { instructions },
      output: { probability: out.probability, model: out.model, usage: out.usage },
      confidence: out.probability,
    });
    return out;
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    await parkForJev(runId, step, err);
    return null;
  }
}

/**
 * Ask JEV to grade input on an ordered scale. Unlike runChoice/runNoul, a
 * grade NEVER parks: grades rank, they don't gate. JEV down means ungraded
 * (grade null), and the caller proceeds on trust alone.
 */
export async function runGrade(runId, { step, state, instructions, levels, questionId = 'grade', prompt }, opts) {
  try {
    const out = await grade({ state, instructions, levels }, opts);
    await persist(runId, {
      type: 'grade',
      step,
      prompt: prompt || instructions,
      question: { instructions, levels },
      output: { score: out.score, probabilities: out.probabilities, model: out.model, usage: out.usage },
      confidence: out.confidence,
    });
    return out;
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    return null;
  }
}
