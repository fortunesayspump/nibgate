import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { BINARY_FORMATS, RENDERABLE, renderExport } from './render.js';

const ctx = {
  report: { version: 3, markdown: '# Findings\n\nArc settles in under a second.\nSee sources.', citations: [{ url: 'https://a.example' }] },
  sources: [{ title: 'Arc docs', url: 'https://a.example/x', domain: 'a.example', relevance: 0.9, trust: 0.8, createdAt: '2026-01-02' }],
  claims: [{ text: 'Arc finality is sub-second', status: 'supported' }],
  ledger: { deposited: 2, spend: 0.4, fee: 0.004, balance: 1.596 },
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
    const bib = await renderExport('bibtex', ctx);
    expect(bib.content).toContain('@misc{');
    expect(bib.content).toContain('https://a.example/x');
  });

  it('renders a structurally valid PDF', async () => {
    const pdf = await renderExport('pdf', ctx);
    expect(pdf.contentType).toBe('application/pdf');
    const buf = decode(pdf);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(buf.length).toBe(pdf.bytes);
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

  it('renders a docx containing the report text', async () => {
    const doc = await renderExport('word', ctx);
    const zip = await JSZip.loadAsync(decode(doc));
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    const body = await zip.file('word/document.xml').async('string');
    expect(body).toContain('Findings');
  });

  it('renders a pptx with presentation, master, layout, theme and slides', async () => {
    const ppt = await renderExport('powerpoint', ctx);
    const zip = await JSZip.loadAsync(decode(ppt));
    for (const part of ['ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/slides/slide1.xml']) {
      expect(zip.file(part), part).toBeTruthy();
    }
  });

  it('rejects an unknown format', async () => {
    await expect(renderExport('wav', ctx)).rejects.toThrow(/no renderer/);
  });
});