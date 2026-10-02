// Depth is research intensity, not model selection.
//
// quick / standard / deep sizes the work: how wide each round fans out, how
// much is read and scored, how many claims get verified, and — the pacing the
// run actually feels — how many retrieval rounds it may take before it must
// write. Round 0 always runs (the plan's questions, asked once); maxRounds
// bounds the follow-up rounds after it. It is metered in the budget (more
// work costs more) and it never selects a model — that is the router's job,
// steered only by effort.
const LIMITS = {
  quick: { queries: 2, fetchDocs: 6, scoreTop: 4, claims: 6, rounds: 1 },
  standard: { queries: 4, fetchDocs: 12, scoreTop: 8, claims: 12, rounds: 2 },
  deep: { queries: 6, fetchDocs: 20, scoreTop: 12, claims: 20, rounds: 4 },
};

export const DEPTHS = Object.keys(LIMITS);

export function depthLimits(depth) {
  return LIMITS[DEPTHS.includes(depth) ? depth : 'standard'];
}
