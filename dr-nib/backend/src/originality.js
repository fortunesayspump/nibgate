// Verbatim-overlap (originality) measurement — deterministic, zero model
// cost, following the literature standard (Broder-style word shingling with
// a containment ratio: how much of the claim's phrasing appears in the
// passage). Only verbatim copying is measured here, never paraphrase quality
// — that judgement belongs to JEV. A copied claim keeps whatever support
// status JEV gave it; the overlap rides alongside as its own signal so the
// matrix can flag it and the eval gate can fail the build on it.
export const SHINGLE_N = 6;
// Containment at or above this means the claim restates the passage nearly
// word-for-word rather than paraphrasing it.
export const COPY_THRESHOLD = 0.8;
// Claims shorter than this carry too few shingles to judge — a 5-word claim
// matching 5 words is agreement, not copying.
export const MIN_CLAIM_WORDS = 8;

function words(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function shingles(text, n = SHINGLE_N) {
  const w = words(text);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i += 1) {
    out.add(w.slice(i, i + n).join(' '));
  }
  return out;
}

/**
 * Containment of the claim's phrasing inside the passage: 0 (original) to 1
 * (verbatim). Short claims and empty passages score 0 — unmeasurable, never
 * guilty.
 */
export function claimOverlap(claimText, passageText) {
  const claimWords = words(claimText);
  if (claimWords.length < MIN_CLAIM_WORDS) return 0;
  const claim = shingles(claimText);
  if (!claim.size) return 0;
  const passage = shingles(passageText);
  if (!passage.size) return 0;
  let hit = 0;
  for (const s of claim) if (passage.has(s)) hit += 1;
  return hit / claim.size;
}

export function isCopied(claimText, passageText, threshold = COPY_THRESHOLD) {
  return claimOverlap(claimText, passageText) >= threshold;
}
