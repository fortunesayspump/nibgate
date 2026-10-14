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
import { chatJson, isLlmConfigured } from './llm/provider.js';
import { claimOverlap, COPY_THRESHOLD } from './originality.js';
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
  // Claims always describe the latest report: a reprompted v2 replaces v1's
  // verdicts rather than appending to them, or the coverage badge would mix
  // two reports' claims.
  await db.researchClaim.deleteMany({ where: { runId } });

  // 1. Extract claims. Without a model there is nothing honest to extract from
  // — heuristic sentence-splitting would fabricate "claims", so offline means
  // unverified, labelled as such.
  let claims = [];
  let claimCitations = [];
  let llmCost = 0;
  if (isLlmConfigured()) {
    try {
      const { data, usage } = await chatJson({
        effort: 'low',
        messages: [
          { role: 'system', content: 'Extract verifiable factual claims. Return JSON only.' },
          {
            role: 'user',
            content: `List the distinct factual claims made in this report that could be checked against sources. One atomic factual statement each; split compound claims rather than bundling several facts. Skip opinions, transitions, and methodology statements.\n\nKeep the report citation numbers for each claim. Return JSON: {"claims": [{"text":"...", "citations":[1,2]}]}\n\nReport:\n${report.markdown.slice(0, 12000)}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 1500,
      });
      llmCost = Number(usage?.costUsd) || 0;
      const extracted = (Array.isArray(data?.claims) ? data.claims : []).map(c => ({
        text: String(typeof c === 'string' ? c : c?.text || '').trim(),
        citations: Array.isArray(c?.citations) ? c.citations.filter(Number.isInteger) : [],
      })).filter(c => c.text).slice(0, maxClaims);
      claims = extracted.map(c => c.text);
      claimCitations = extracted.map(c => c.citations);
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
  const state = `Report version: ${report.version}`;
  const questions = [];
  const claimPassages = [];
  for (const [i, text] of claims.entries()) {
    const found = await searchEvidence(runId, { query: text, limit: 20 });
    const citedUrls = claimCitations[i].map(n => report.citations?.[n - 1]?.url).filter(Boolean);
    const cited = found.matches.filter(m => citedUrls.includes(m.url));
    const best = (cited.length ? cited : found.matches)[0] || null;
    claimPassages.push(best);
    questions.push({
      id: `c${i}`,
      type: 'noul',
      instructions: best
        ? `Probability (0..1) that passage c${i} in the state supports this claim: ${text.slice(0, 380)}`
        : `No passage was collected for this claim, so it cannot be supported. Claim: ${text.slice(0, 300)}`,
    });
  }

  // 3. One JEV batch scores every claim. JEV down means unverified, never guessed.
  let answers = {};
  let jevCost = 0;
  let jevModel = null;
  try {
    // Each claim gets the cited passage without competing for the state limit.
    for (let start = 0; start < questions.length; start += 1) {
      const group = questions.slice(start, start + 1);
      const passages = group.map((q, n) => `Passage ${q.id}: ${claimPassages[start + n]?.excerpt?.slice(0, 3000) || '(none)'}`).join('\n\n');
      const out = await batch({ state: `${state}\n${passages}`, questions: group });
      Object.assign(answers, out.answers || {});
      jevCost += Number(out.usage?.cost) || 0;
      jevModel = out.model;
    }
  } catch (err) {
    if (!(err instanceof JevUnavailable)) throw err;
    await recordEvent(runId, { type: 'verify.failed', reason: 'jev-unavailable' });
    return { claims: claims.length, supported: 0, unknown: claims.length, costUsd: llmCost, verified: false, reason: 'jev-unavailable' };
  }

  // 4. Persist. The caller owns the threshold; it lives in one env var.
  // Overlap rides on the passage row (deterministic shingling, zero model
  // cost): support says the passage backs the claim, overlap says whether
  // the claim restates it nearly word-for-word.
  const threshold = supportThreshold();
  let supported = 0;
  let copied = 0;
  for (const [i, text] of claims.entries()) {
    const p = Number(answers[`c${i}`]?.probability);
    const probability = Number.isFinite(p) ? p : 0;
    const status = probability >= threshold ? 'supported' : 'unknown';
    if (status === 'supported') supported += 1;
    const best = claimPassages[i];
    const overlap = best ? claimOverlap(text, best.excerpt) : 0;
    if (overlap >= COPY_THRESHOLD) copied += 1;
    await db.researchClaim.create({
      data: {
        runId,
        text,
        status,
        passages: best ? [{ url: best.url, title: best.title, excerpt: best.excerpt, support: probability, overlap: Math.round(overlap * 100) / 100 }] : [],
      },
    });
  }
  const costUsd = llmCost + jevCost;
  await recordEvent(runId, {
    type: 'verify.finished',
    claims: claims.length, supported, unknown: claims.length - supported, copied,
    threshold, model: jevModel, costUsd,
  });
  return { claims: claims.length, supported, unknown: claims.length - supported, copied, costUsd, verified: true };
}
