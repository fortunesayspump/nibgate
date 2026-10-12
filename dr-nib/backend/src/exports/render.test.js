import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { BINARY_FORMATS, RENDERABLE, parseBlocks, parseInline, renderExport } from './render.js';

const ctx = {
  report: { version: 3, markdown: '# Findings\n\nArc **settles** in under a *second* [1]. See [docs](https://a.example/x).\n\n## Fees\n\n| Net | Fee |\n| --- | --- |\n| Arc | 0.001 |\n\n- fast finality\n- cheap fees\n\n1. first\n2. second\n\n> A quoted takeaway.\n' },
  sources: [{ title: 'Arc docs', url: 'https://a.example/x', domain: 'a.example', relevance: 0.9, trust: 0.8, createdAt: '2026-01-02' }],
  claims: [{ text: 'Arc finality is sub-second', status: 'supported' }],
  ledger: { deposited: 2, spend: 0.4, fee: 0.004, balance: 1.596 },
  escrow: { jobId: '9', status: 'Completed', completeTx: '0xabc', targetCap: 2 },
  slug: 'demo-v3',
};

const decode = (r) => Buffer.from(r.content, 'base64');

describe('export renderers', () => {
  it('advertises every format as renderable', () => {
    expect([...RENDERABLE].sort()).toEqual(['bibtex', 'excel', 'json', 'md', 'pdf', 'powerpoint', 'word']);
    expect([...BINARY_FORMATS].sort()).toEqual(['excel', 'pdf', 'powerpoint', 'word']);
  });

  it('renders text formats as strings', async () => {
    const md = await renderExport('md', ctx);
    expect(md.content).toContain('# Findings');
    expect(md.encoding).toBeUndefined();
    const json = await renderExport('json', ctx);
    expect(JSON.parse(json.content).claims[0].status).toBe('supported');
    expect(JSON.parse(json.content).escrow).toMatchObject({ jobId: '9', status: 'Completed', completeTx: '0xabc' });
    const bib = await renderExport('bibtex', ctx);
    expect(bib.content).toContain('@misc{');
    expect(bib.content).toContain('https://a.example/x');
  });

  it('parses markdown into shared blocks once for every rich renderer', () => {
    const blocks = parseBlocks(['# T', '', 'Para **b** and *i* and [l](https://x.example).', '', '| A | B |', '|---|---|', '| 1 | 2 |', '', '- u1', '', '1. o1', '', '> q']);
    expect(blocks.map((b) => b.t)).toEqual(['h', 'p', 'table', 'ul', 'ol', 'quote']);
    expect(blocks[0]).toMatchObject({ t: 'h', level: 1, text: 'T' });
    expect(blocks[1].segs).toMatchObject([{ t: 'Para ' }, { t: 'b', b: true }, { t: ' and ' }, { t: 'i', i: true }, { t: ' and ' }, { t: 'l', link: 'https://x.example' }, { t: '.' }]);
    expect(blocks[2]).toMatchObject({ t: 'table', head: ['A', 'B'], rows: [['1', '2']] });
    expect(parseInline('plain').map((s) => s.t).join('')).toBe('plain');
  });

  it('renders a structurally valid PDF with real text', async () => {
    const pdf = await renderExport('pdf', ctx);
    expect(pdf.contentType).toBe('application/pdf');
    const buf = decode(pdf);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(buf.length).toBe(pdf.bytes);
    // Readable text, not raw markdown: extract and check like a reader would.
    const { extractText } = await import('unpdf');
    const { text } = await extractText(new Uint8Array(buf));
    const body = text.join('\n');
    expect(body).toContain('Findings');
    expect(body).toContain('settles');
    expect(body).toContain('Settlement receipt');
    expect(body).not.toContain('# Findings');
    expect(body).not.toContain('**settles**');
    expect(body).not.toContain('| Net |');
  });

  it('renders a valid xlsx (zip) with the expected sheets', async () => {
    const xl = await renderExport('excel', ctx);
    const buf = decode(xl);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('xl/workbook.xml')).toBeTruthy();
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toContain('Report');
    expect(wb).toContain('Claims');
    expect(wb).toContain('Sources');
  });

  it('renders a docx with real Word structure, never markdown residue', async () => {
    const doc = await renderExport('word', ctx);
    const zip = await JSZip.loadAsync(decode(doc));
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    const body = await zip.file('word/document.xml').async('string');
    expect(body).toContain('Findings');
    expect(body).toContain('w:val="Heading1"');
    expect(body).toContain('w:val="Heading2"');
    expect(body).toContain('w:tbl');
    expect(body).toContain('w:hyperlink');
    expect(body).not.toContain('# Findings');
    expect(body).not.toContain('**settles**');
    expect(body).not.toContain('| Net |');
    expect(body).toContain('Settlement receipt');
    // The hyperlink target lives in the rels, not the body.
    const rels = await zip.file('word/_rels/document.xml.rels').async('string');
    expect(rels).toContain('https://a.example/x');
  });

  it('renders a real pptx deck: cover, sections, receipt, sources', async () => {
    const ppt = await renderExport('powerpoint', ctx);
    const zip = await JSZip.loadAsync(decode(ppt));
    expect(zip.file('ppt/presentation.xml')).toBeTruthy();
    const pres = await zip.file('ppt/presentation.xml').async('string');
    const ids = [...pres.matchAll(/p:sldId [^>]*r:id="(rId\d+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    for (const id of ids) expect(rels).toContain(id);
    const slides = [];
    for (const f of Object.keys(zip.files)) {
      if (/^ppt\/slides\/slide\d+\.xml$/.test(f)) slides.push(await zip.file(f).async('string'));
    }
    expect(slides.length).toBe(ids.length);
    const all = slides.join('\n');
    expect(all).toContain('Findings');
    expect(all).toContain('Fees');
    expect(all).toContain('Settlement receipt');
    expect(all).toContain('Key sources');
    expect(all).not.toContain('# Findings');
    expect(all).not.toContain('| Net |');
  });

  it('rejects an unknown format', async () => {
    await expect(renderExport('wav', ctx)).rejects.toThrow(/no renderer/);
  });

  it('carries chart figures as data, never raw JSON', async () => {
    const withChart = {
      ...ctx,
      report: {
        ...ctx.report,
        markdown: '# T\n\n```chart {"type":"bar","title":"Fees","unit":"USDC","data":[{"label":"Arc","value":0.001},{"label":"Base","value":0.02}]}\n```\n',
      },
    };
    const json = await renderExport('json', withChart);
    const packet = JSON.parse(json.content);
    expect(packet.figures).toHaveLength(1);
    expect(packet.figures[0]).toMatchObject({ n: 1, title: 'Fees' });
    const xl = await renderExport('excel', withChart);
    const zip = await JSZip.loadAsync(decode(xl));
    const wb = await zip.file('xl/workbook.xml').async('string');
    expect(wb).toContain('Figures');
    const pdf = await renderExport('pdf', withChart);
    const { extractText } = await import('unpdf');
    const { text } = await extractText(new Uint8Array(decode(pdf)));
    const pdfBody = text.join('\n');
    expect(pdfBody).toContain('Figure 1');
    expect(pdfBody).not.toContain('```chart');
    const doc = await renderExport('word', withChart);
    const dzip = await JSZip.loadAsync(decode(doc));
    const body = await dzip.file('word/document.xml').async('string');
    expect(body).toContain('Figure 1');
    expect(body).not.toContain('```chart');
  });
});