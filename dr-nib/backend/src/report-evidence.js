// One citation order across writer prompts, reports, exports and API clients.
export const SOURCE_ORDER = [{ trust: 'desc' }, { relevance: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }];

export function reportEvidence(sources, fetchSteps) {
  const documents = new Map();
  // Steps arrive newest first. Keep the most recent successful passage per URL.
  for (const step of fetchSteps) for (const doc of step.output?.documents || []) {
    if (doc?.url && doc.text && !documents.has(doc.url)) documents.set(doc.url, doc);
  }
  return sources.map((source, i) => ({
    id: source.id, url: source.url, title: source.title, domain: source.domain,
    relevance: source.relevance, trust: source.trust, citationIndex: i + 1,
    excerpt: documents.get(source.url)?.text || '',
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
