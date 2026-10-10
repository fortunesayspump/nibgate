// Report length — how long the deliverable should be.
//
// Chosen at configure: three presets for the common cases, plus an exact word
// count for anyone who knows what they want. Presets set a sensible default;
// the custom number overrides. Length drives generation (words per section,
// section count) and the plan estimate (longer costs more), so what the user
// picks here is what the run prices and writes — never a silent default.
//
// Words are targets, not guarantees: each section is budgeted targetWords /
// sections words, sized to ~1.35 tokens per word with headroom.
const LENGTHS = {
  brief: { words: 1200, sections: 3 },
  standard: { words: 4000, sections: 6 },
  comprehensive: { words: 12000, sections: 12 },
};

export const LENGTH_PRESETS = Object.keys(LENGTHS);

const MIN_WORDS = 300;
const MAX_WORDS = 50000;

/**
 * Resolve a configure-time length choice to a concrete plan.
 * An explicit word count always wins over the preset; out-of-range counts
 * clamp rather than fail, and the response says what was applied.
 */
export function resolveLength({ length, lengthWords } = {}) {
  const words = Number(lengthWords);
  if (Number.isFinite(words) && words > 0) {
    const clamped = Math.min(MAX_WORDS, Math.max(MIN_WORDS, Math.round(words)));
    return {
      preset: 'custom',
      words: clamped,
      sections: Math.min(12, Math.max(2, Math.round(clamped / 1000))),
      clamped: clamped !== Math.round(words),
    };
  }
  const preset = LENGTH_PRESETS.includes(length) ? length : 'standard';
  return { preset, words: LENGTHS[preset].words, sections: LENGTHS[preset].sections, clamped: false };
}

export function lengthPlan(length) {
  return LENGTHS[LENGTH_PRESETS.includes(length) ? length : 'standard'];
}

export function wordsPerSection(length) {
  const plan = lengthPlan(length);
  return Math.round(plan.words / plan.sections);
}

export function maxTokensForWords(words) {
  // 2 tokens/word: markdown, citations, and list markup ride on top of
  // prose, and a tight budget clips the final sentence mid-clause (seen
  // live: "...the trailing clause \"that hard pay\"," — end of section).
  // max_tokens is a ceiling, not spend: unneeded headroom costs nothing.
  return Math.ceil(words * 2);
}
