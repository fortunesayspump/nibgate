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
import { JevUnavailable, decide, classify, grade, batch } from './client.js';

const SOURCE_GRADES = [
  'Passing mention, directory listing, or SEO filler — no substantive content',
  'Topical article with real content but secondary reporting',
  'Substantive primary reporting, data, or analysis',
  'Primary source: paper, filing, official docs, or direct measurement',
];

/** Keep independent source judgments together so a normal research round does not exhaust the hub's request limit. */
export function sourceBatchInput(docs, { topic, criteria, priors = {} }) {
  const state = [
    `Research question: ${topic || ''}`,
    ...docs.map((doc, i) => `Source ${i}: ${doc.url}\nTitle: ${doc.title || ''}\nExcerpt: ${String(doc.text || '').slice(0, 650)}`),
  ].join('\n').slice(0, 4000);
  const questions = docs.flatMap((doc, i) => {
    let host = '';
    try { host = new URL(doc.url).hostname.replace(/^www\./, ''); } catch { /* uploaded source */ }
    const prior = priors[host];
    const history = prior ? ` User history: cited in ${prior.cites} of ${prior.reads} past runs.` : '';
    return [
      { id: `trust-${i}`, type: 'noul', instructions: `Probability (0..1) that source ${i} is credible evidence for the question. Criteria: ${criteria}${history}`.slice(0, 500) },
      { id: `grade-${i}`, type: 'choice', instructions: `Grade the evidence quality of source ${i} for the question.`, options: SOURCE_GRADES.map((description, level) => ({ id: String(level), description })) },
    ];
  });
  return { state, questions };
}

export function sourceBatchJudgments(docs, answers) {
  return docs.map((doc, i) => {
    const trustAnswer = answers[`trust-${i}`];
    const trust = Number(trustAnswer?.probability);
    if (trustAnswer?.type !== 'noul' || !Number.isFinite(trust) || trust < 0 || trust > 1) {
      throw new JevUnavailable(`JEV returned no valid trust judgment for source ${i}`);
    }
    const gradeAnswer = answers[`grade-${i}`];
    const probabilities = gradeAnswer?.type === 'choice' ? gradeAnswer.probabilities : null;
    const weights = SOURCE_GRADES.map((_, level) => Number(probabilities?.[level]));
    const total = weights.every((p) => Number.isFinite(p) && p >= 0) ? weights.reduce((sum, p) => sum + p, 0) : 0;
    const grade = total > 0 ? weights.reduce((sum, p, level) => sum + p * level, 0) / total : null;
    return { doc, trust, grade, gradeAnswer: grade == null ? null : gradeAnswer };
  });
}

export async function runSourceBatch(runId, docs, context, opts) {
  const input = sourceBatchInput(docs, context);
  try {
    const out = await batch(input, opts);
    const judged = sourceBatchJudgments(docs, out.answers);
    for (const [i, item] of judged.entries()) {
      await persist(runId, {
        type: 'noul', step: 'source-trust',
        prompt: `Is this source trustworthy for the question? ${item.doc.url}`,
        question: { state: input.state, instructions: input.questions[i * 2].instructions },
        output: { probability: item.trust, model: out.model, usage: out.usage },
        confidence: item.trust,
      });
      if (item.gradeAnswer) await persist(runId, {
        type: 'grade', step: 'source-grade',
        prompt: `Grade this source's evidence quality for the question. ${item.doc.url}`,
        question: { state: input.state, instructions: input.questions[i * 2 + 1].instructions, levels: SOURCE_GRADES },
        output: { score: item.grade, probabilities: item.gradeAnswer.probabilities, model: out.model, usage: out.usage },
        confidence: Number(item.gradeAnswer.confidence) || 0,
      });
    }
    return { judged, costUsd: Number(out.usage?.costUsd ?? out.usage?.cost) || 0 };
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    await parkForJev(runId, 'source-trust', err);
    return null;
  }
}

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
  const updated=await db.researchRun.updateMany({
    where: { id: runId,status:{notIn:['ended','complete','failed']} },
    data: { status: 'paused', pauseReason: 'jev' },
  });
  if(!updated.count)return;
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
