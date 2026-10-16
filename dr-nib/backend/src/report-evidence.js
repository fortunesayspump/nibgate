// One citation order across writer prompts, reports, exports and API clients.
export const SOURCE_ORDER = [{ trust: 'desc' }, { relevance: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }];

// A later price check must never replace content already bought for the same
// URL. Keep the first document at equal quality (callers choose their order).
export function evidenceQuality(doc) {
  if (doc?.acquisition === 'paid' || String(doc?.title || '').startsWith('Paid:')) return 4;
  if (doc?.acquisition === 'quote' || String(doc?.text || '').startsWith('HTTP 402 payment challenge.')) {
    return /Quoted price: \d/.test(String(doc?.text || '')) ? 2 : 1;
  }
  return 3;
}

export function bestDocumentsByUrl(candidates) {
  const best = new Map();
  for (const doc of candidates) {
    if (!doc?.url || !doc.text) continue;
    if (!best.has(doc.url) || evidenceQuality(doc) > evidenceQuality(best.get(doc.url))) best.set(doc.url, doc);
  }
  return [...best.values()];
}

export function reportEvidence(sources, fetchSteps) {
  // Steps arrive newest first. Prefer substantive paid content over later 402
  // previews; within one quality level the newest passage wins.
  const documents = new Map(bestDocumentsByUrl(fetchSteps.flatMap((step) => step.output?.documents || []))
    .map((doc) => [doc.url, doc]));
  const purchases = new Map();
  for (const step of fetchSteps) for (const call of step.output?.calls || []) {
    if (call?.ok && ['unlock_content', 'pay_x402'].includes(call.tool) && call.url && !purchases.has(call.url)) purchases.set(call.url, call);
  }
  return sources.map((source, i) => ({
    id: source.id, url: source.url, title: source.title, domain: source.domain,
    relevance: source.relevance, trust: source.trust, citationIndex: i + 1,
    excerpt: `${purchases.has(source.url)
      ? `Run acquisition record: ${purchases.get(source.url).amount ?? 'unknown amount'} USDC paid to unlock this source; ${purchases.get(source.url).txHash ? `transaction ${purchases.get(source.url).txHash}` : 'Circle Gateway did not provide an immediate transaction hash'}. This purchase record is separate from the article's claims.\n`
      : ''}${documents.get(source.url)?.text || ''}`,
  }));
}

export function sectionEvidence(matches, evidence) {
  const byUrl = new Map(evidence.map(source => [source.url, source]));
  return matches.flatMap(match => {
    const source = byUrl.get(match.url);
    return source ? [{ ...source, excerpt: match.excerpt || source.excerpt }] : [];
  });
}

export function reportSources(report, sources) {
  return Array.isArray(report?.citations) && report.citations.length ? report.citations : sources;
}
