// Verify pass — the trust backstop.
//
// The report prompt binds the model to cited evidence, but a promise is not an
// enforcement. Verify closes the loop after writing: it extracts the report's
// factual claims, checks each one against the run's own collected passages via
// JEV, and records supported / unknown on every claim. A claim the evidence
// does not support is marked unknown in the store — visible to follow-ups and
// to the audit — rather than quietly standing.
//
// Cost discipline: bounded report chunks supply candidates across the whole
// report. At most the depth-specific sample is then scored by JEV against its
// best collected passage. The event records sample size and input coverage.
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

const VERIFY_CHUNK_CHARS = 10000;
const MAX_VERIFY_CHUNKS = 24;

// Keep section/paragraph boundaries where possible. Long reports are checked
// from beginning to end; a bounded call count prevents verification alone
// from exhausting a small research budget.
export function reportVerificationChunks(markdown, maxChars = VERIFY_CHUNK_CHARS) {
  const text = String(markdown || '');
  const chunks = [];
  let offset = 0;
  while (offset < text.length && chunks.length < MAX_VERIFY_CHUNKS) {
    let end = Math.min(offset + maxChars, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n\n', end);
      if (boundary > offset + maxChars / 2) end = boundary + 2;
    }
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return { chunks, coveredChars: offset, complete: offset === text.length };
}

// Sample across all sections instead of taking only the first N claims from
// the introduction. Verification is explicitly a sample, never a whole-report
// certification.
export function sampleClaimsAcrossChunks(groups, limit) {
  const selected = [];
  const seen = new Set();
  const spread = Math.min(groups.length, Math.max(0, limit));
  const preferred = spread === 1 ? [0] : Array.from({ length: spread }, (_, i) => Math.round(i * (groups.length - 1) / (spread - 1)));
  const order = [...preferred, ...groups.map((_, i) => i).filter(i => !preferred.includes(i))];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let row = 0; row < longest && selected.length < limit; row += 1) {
    for (const index of order) {
      const claim = groups[index][row];
      if (!claim) continue;
      const key = claim.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(claim);
      if (selected.length >= limit) break;
    }
  }
  return selected;
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
  const coverage = reportVerificationChunks(report.markdown);
  let extractedCount = 0;
  if (isLlmConfigured()) {
    try {
      const groups = [];
      for (const chunk of coverage.chunks) {
        const { data, usage } = await chatJson({
          effort: 'low',
          messages: [
            { role: 'system', content: 'Extract verifiable factual claims. Return JSON only.' },
            {
              role: 'user',
              content: `List the distinct factual claims made in this part of a longer report that could be checked against sources. One atomic factual statement each; split compound claims rather than bundling several facts. Skip opinions, transitions, and methodology statements. Keep the report citation numbers for each claim. Return JSON: {"claims": [{"text":"...", "citations":[1,2]}]}\n\nReport part:\n${chunk}`,
            },
          ],
          temperature: 0.1,
          maxTokens: 1500,
        });
        llmCost += Number(usage?.costUsd) || 0;
        groups.push((Array.isArray(data?.claims) ? data.claims : []).map(c => ({
          text: String(typeof c === 'string' ? c : c?.text || '').trim(),
          citations: Array.isArray(c?.citations) ? c.citations.filter(Number.isInteger) : [],
        })).filter(c => c.text));
      }
      extractedCount = groups.reduce((total, group) => total + group.length, 0);
      const sampled = sampleClaimsAcrossChunks(groups, maxClaims);
      claims = sampled.map(c => c.text);
      claimCitations = sampled.map(c => c.citations);
    } catch (err) {
      await recordEvent(runId, { type: 'verify.failed', reason: 'claim-extraction-failed', error: String(err?.message || err).slice(0, 200) });
      return { claims: 0, supported: 0, unknown: 0, costUsd: llmCost, verified: false, reason: 'claim-extraction-failed' };
    }
  } else {
    await recordEvent(runId, { type: 'verify.skipped', reason: 'llm-unconfigured' });
    return { claims: 0, supported: 0, unknown: 0, costUsd: 0, verified: false, reason: 'llm-unconfigured' };
  }

  if (!claims.length) {
    return { claims: 0, supported: 0, unknown: 0, costUsd: llmCost, verified: false, reason: 'no-claims' };
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

  // 3. JEV scores each sampled claim against its own passage. JEV down means
  // unverified, never guessed.
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
    threshold, model: jevModel, costUsd, scope: 'sampled',
    extractedClaims: extractedCount, reportChunks: coverage.chunks.length,
    reportCoverageComplete: coverage.complete,
    ...(coverage.complete ? {} : { reason: 'report-too-long-for-verification' }),
  });
  return { claims: claims.length, supported, unknown: claims.length - supported, copied, costUsd, verified: coverage.complete, scope: 'sampled', reportCoverageComplete: coverage.complete };
}
