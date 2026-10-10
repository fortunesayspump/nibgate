// The intake stop decision, through JEV when it can be reached.
//
// "Should I stop asking?" is a judgement, so it belongs to the decision seat —
// but intake holds no money and must stay usable when the hub is unreachable.
// The rule: JEV decides when it answers; the deterministic bank decides when
// it does not, and the decision row says which one decided. A fallback here is
// a labelled degradation, not a silent substitution — the run's money
// decisions never get this treatment.
import { JevUnavailable, decide } from './client.js';

export async function decideIntakeStop({ topic, answeredKeys = [], remainingKeys = [], lastAnswer = '' } = {}) {
  const state = [
    `Topic: ${topic || '(unspecified)'}`,
    `Answered: ${answeredKeys.length ? answeredKeys.join(', ') : 'nothing yet'}`,
    `Still open: ${remainingKeys.length ? remainingKeys.join(', ') : 'nothing'}`,
    `Latest answer: ${String(lastAnswer || '').slice(0, 300) || '(none)'}`,
  ].join('\n');
  try {
    const out = await decide(
      {
        state,
        instructions:
          'Decide whether the brief is whole enough to leave intake and plan the research, or whether another question is still worth asking. Leaving early with a thin brief wastes the run; asking on when nothing is missing wastes the user. '
          + 'Diminishing returns are real: bank items left open do NOT by themselves justify another round — if 5+ questions are already answered and topic, intent, and scope are covered, proceed. '
          + 'Methodology detail (sample sizes, timestamps, sources, metrics) is never a reason to keep asking; that is the researcher\u2019s job.',
        candidates: [
          { id: 'proceed', context: 'The brief is whole: the topic, intent, scope, and constraints needed to plan are all present. Plan now.' },
          { id: 'ask_more', context: 'Something material is still missing — an answer that would change the plan, the sources, or the report shape. Ask the next most valuable question.' },
          { id: 'reframe', context: 'The questions so far chase the wrong angle: the answers do not converge on anything plannable. Drop this line entirely and open a different angle — continuing it wastes the user.' },
        ],
        questionId: 'intake-stop',
      },
    );
    // A reframe is not a stop: the transcript continues, but the next
    // question must come from a different angle (the generator enforces
    // that). The rejected direction stays in the decision row so the frame
    // that failed is auditable, not just the winner.
    return { done: out.pick === 'proceed', reframe: out.pick === 'reframe', source: 'jev', ...out };
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    return { done: null, source: 'fallback' };
  }
}
