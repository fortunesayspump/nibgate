// Export renderers — deliverables generated from finished work, never by
// re-running the research.
//
// Supported today, dependency-free: md (the raw report), json (the evidence
// packet: report + sources + claims + ledger state), bibtex (the cited
// sources as @misc entries). The binary formats (pdf, word, excel,
// powerpoint) need renderer libraries and R2 object storage; until those
// land the route answers 501 naming exactly what is missing, rather than
// queuing work nothing will ever pick up.

export const RENDERABLE = new Set(['md', 'json', 'bibtex']);
export const PLANNED = new Set(['pdf', 'word', 'excel', 'powerpoint']);

function bibKey(source, i) {
  const domain = String(source.domain || source.url || 'source').replace(/^https?:\/\//, '').split('/')[0].replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'source';
  const year = source.createdAt ? new Date(source.createdAt).getFullYear() : new Date().getFullYear();
  return `${domain}${year}_${i + 1}`;
}

function bibtex(sources) {
  const entries = (sources || []).map((s, i) => {
    const lines = [
      `@misc{${bibKey(s, i)},`,
      `  title = {${String(s.title || s.url || 'untitled').replace(/[{}]/g, '')}},`,
    ];
    if (s.url) lines.push(`  howpublished = {\\url{${s.url}}},`);
    lines.push(`  year = {${s.createdAt ? new Date(s.createdAt).getFullYear() : new Date().getFullYear()}},`);
    lines.push(`  note = {collected by Dr. Nib${s.trust != null ? `, trust ${s.trust}` : ''}}`);
    lines.push('}');
    return lines.join('\n');
  });
  return entries.join('\n\n') + (entries.length ? '\n' : '');
}

function packet({ report, sources, claims, ledger }) {
  return {
    version: report?.version ?? null,
    markdown: report?.markdown ?? null,
    citations: report?.citations ?? [],
    sources: (sources || []).map((s) => ({
      url: s.url, title: s.title, domain: s.domain,
      relevance: s.relevance ?? null, trust: s.trust ?? null,
    })),
    claims: (claims || []).map((c) => ({ text: c.text, status: c.status })),
    ledger: ledger || null,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Render a finished report. Throws for formats without a renderer.
 * @returns {{contentType:string, filename:string, content:string}}
 */
export function renderExport(format, { report, sources, claims, ledger, slug = 'report' }) {
  if (format === 'md') {
    return { contentType: 'text/markdown', filename: `${slug}.md`, content: report?.markdown || '' };
  }
  if (format === 'json') {
    return { contentType: 'application/json', filename: `${slug}.json`, content: JSON.stringify(packet({ report, sources, claims, ledger }), null, 2) };
  }
  if (format === 'bibtex') {
    return { contentType: 'application/x-bibtex', filename: `${slug}.bib`, content: bibtex(sources) };
  }
  throw new Error(`no renderer for format: ${format}`);
}
