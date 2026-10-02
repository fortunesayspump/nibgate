// Verify pass — the trust backstop.
//
// The report prompt binds the model to cited evidence, but a promise is not an
// enforcement. Verify closes the loop after writing: it extracts the report's
// factual claims, checks each one against the run's own collected passages via
// JEV, and records supported / unknown on every claim. A claim the evidence
// does not support is marked unknown in the store — visible to follow-ups and
// to the audit — rather than quietly standing.
//
// Cost discipline: one LLM call extracts all claims; ONE JEV batch call scores
// every claim against its best passage. Per-claim round trips would cost more
// than the evidence is worth.
import { db } from './db.js';
import { recordEvent } from './eventlog.js';
import { chatJson, isLlmConfigured } from './llm/generate.js';
import { batch, JevUnavailable } from './jev/client.js';
import { searchEvidence } from './tools/evidence.js';
import { depthLimits } from './depth.js';

export function supportThreshold() {
  const n = Number(process.env.VERIFY_SUPPORT_THRESHOLD);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.6;
}

/**
 * Run verification for a finished report.
 * @returns {Promise<{claims:number, supported:number, unknown:number, costUsd:number, verified:boolean, reason?:string}>}
 */
export async function verifyReport(runId, { brief } = {}) {
  const maxClaims = depthLimits(brief?.depth).claims;
  const report = await db.researchReport.findFirst({ where: { runId }, orderBy: { version: 'desc' } });
  if (!report) return { claims: 0, supported: 0, unknown: 0, costUsd: 0, verified: false, reason: 'no-report' };

  // 1. Extract claims. Without a model there is nothing honest to extract from
  // — heuristic sentence-splitting would fabricate "claims", so offline means
  // unverified, labelled as such.
  let claims = [];
  let llmCost = 0;
  if (isLlmConfigured()) {
    try {
      const { data, usage } = await chatJson({
        effort: 'low',
        messages: [
          { role: 'system', content: 'Extract verifiable factual claims. Return JSON only.' },
          {
            role: 'user',
            content: `List the distinct factual claims made in this report that could be checked against sources. One short sentence each. Skip opinions, transitions, and methodology statements.\n\nReturn JSON: {"claims": ["...", "..."]}\n\nReport:\n${report.markdown.slice(0, 12000)}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 1500,
      });
      llmCost = Number(usage?.costUsd) || 0;
      claims = (Array.isArray(data?.claims) ? data.claims : []).map((c) => String(c || '').trim()).filter(Boolean).slice(0, maxClaims);
    } catch (err) {
      await recordEvent(runId, { type: 'verify.failed', reason: 'claim-extraction-failed', error: String(err?.message || err).slice(0, 200) });
      return { claims: 0, supported: 0, unknown: 0, costUsd: llmCost, verified: false, reason: 'claim-extraction-failed' };
    }
  } else {
    await recordEvent(runId, { type: 'verify.skipped', reason: 'llm-unconfigured' });
    return { claims: 0, supported: 0, unknown: 0, costUsd: 0, verified: false, reason: 'llm-unconfigured' };
  }

  if (!claims.length) {
    return { claims: 0, supported: 0, unknown: 0, costUsd: llmCost, verified: true, reason: 'no-claims' };
  }

  // 2. Best passage per claim, from the run's own evidence.
  const state = [`Topic: ${brief?.topic || ''}`, `Report version: ${report.version}`].join('\n');
  const questions = [];
  const claimPassages = [];
  for (const [i, text] of claims.entries()) {
    const found = await searchEvidence(runId, { query: text, limit: 3 });
    const best = found.matches[0] || null;
    claimPassages.push(best);
    questions.push({
      id: `c${i}`,
      type: 'noul',
      instructions: best
        ? `Probability (0..1) that this passage supports the claim. Claim: ${text.slice(0, 300)} Passage: ${best.excerpt.slice(0, 600)}`
        : `No passage was collected for this claim, so it cannot be supported. Claim: ${text.slice(0, 300)}`,
    });
  }

  // 3. One JEV batch scores every claim. JEV down means unverified, never guessed.
  let answers = {};
  let jevCost = 0;
  let jevModel = null;
  try {
    const out = await batch({ state, questions });
    answers = out.answers || {};
    jevCost = Number(out.usage?.cost) || 0;
    jevModel = out.model;
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    await recordEvent(runId, { type: 'verify.failed', reason: 'jev-unavailable' });
    return { claims: claims.length, supported: 0, unknown: claims.length, costUsd: llmCost, verified: false, reason: 'jev-unavailable' };
  }

  // 4. Persist. The caller owns the threshold; it lives in one env var.
  const threshold = supportThreshold();
  let supported = 0;
  for (const [i, text] of claims.entries()) {
    const p = Number(answers[`c${i}`]?.probability);
    const probability = Number.isFinite(p) ? p : 0;
    const status = probability >= threshold ? 'supported' : 'unknown';
    if (status === 'supported') supported += 1;
    const best = claimPassages[i];
    await db.researchClaim.create({
      data: {
        runId,
        text,
        status,
        passages: best ? [{ url: best.url, title: best.title, excerpt: best.excerpt, support: probability }] : [],
      },
    });
  }
  const costUsd = llmCost + jevCost;
  await recordEvent(runId, {
    type: 'verify.finished',
    claims: claims.length, supported, unknown: claims.length - supported,
    threshold, model: jevModel, costUsd,
  });
  return { claims: claims.length, supported, unknown: claims.length - supported, costUsd, verified: true };
}
