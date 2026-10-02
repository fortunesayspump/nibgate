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
          'Decide whether the brief is whole enough to leave intake and plan the research, or whether another question is still worth asking. Leaving early with a thin brief wastes the run; asking on when nothing is missing wastes the user.',
        candidates: [
          { id: 'proceed', context: 'The brief is whole: the topic, intent, scope, and constraints needed to plan are all present. Plan now.' },
          { id: 'ask_more', context: 'Something material is still missing — an answer that would change the plan, the sources, or the report shape. Ask the next most valuable question.' },
        ],
        questionId: 'intake-stop',
      },
    );
    return { done: out.pick === 'proceed', source: 'jev', ...out };
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    return { done: null, source: 'fallback' };
  }
}
