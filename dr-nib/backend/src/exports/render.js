// Export renderers — deliverables generated from finished work, never by
// re-running the research.
//
// Text formats are dependency-light: md (the raw report), json (the evidence
// packet: report + sources + claims + ledger state), bibtex (the cited
// sources as @misc entries). Rich formats are built with real document
// libraries, not string-concatenated XML:
//   - pdf    pdfkit: headings, wrapped body text with bold/italic runs,
//            bulleted lists, tables, page numbers (WinAnsi-safe text)
//   - word   docx: real Heading styles, bold/italic/code runs, hyperlinks,
//            bullet + numbered lists, header-shaded tables
//   - excel  SheetJS: Report/Claims/Sources/Ledger/Figures sheets with the
//            report laid out as sections and tables as real grids
//   - powerpoint  pptxgenjs: title slide, one slide per section (bullets,
//            tables), receipt + key-sources closing slides
// One shared markdown→blocks parser feeds every rich renderer so Word,
// slides, and PDF agree on structure. Binary results are returned
// base64-encoded (`encoding: 'base64'`) so the JSON route can carry them
// without object storage; R2 streaming is a later optimization, not a
// correctness requirement.
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell, WidthType, AlignmentType, Numbering, LevelFormat } from 'docx';
import pptxgen from 'pptxgenjs';
import PDFDocument from 'pdfkit';

export const TEXT_FORMATS = new Set(['md', 'json', 'bibtex']);
export const BINARY_FORMATS = new Set(['pdf', 'word', 'excel', 'powerpoint']);
export const RENDERABLE = new Set([...TEXT_FORMATS, ...BINARY_FORMATS]);
// Kept for compatibility with callers that special-cased not-yet-built
// formats. Empty now that every advertised format has a renderer.
export const PLANNED = new Set();

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

function packet({ report, sources, claims, ledger, escrow, figures, expenseReceipt }) {
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
    ...(expenseReceipt?{expenseReceipt}:{}),
    figures: figures || [],
    // Settlement receipt: what was deposited, what came back, and the
    // onchain proof. A money-moving run must export its receipt, not just
    // its prose.
    escrow: escrow ? {
      jobId: escrow.jobId || null,
      status: escrow.status || null,
      completeTx: escrow.completeTx || null,
      splitTx: escrow.splitTx || null,
      splitConfirmed: Boolean(escrow.splitTx || escrow.splitConfirmed),
      targetCap: escrow.targetCap ?? null,
    } : null,
    exportedAt: new Date().toISOString(),
  };
}

/** Official settlement receipt block, appended to document exports (md, pdf,
 * word): the money truth after the fact — deposit, spend, operator-side fee,
 * refund, and every onchain hash. A run that took money must export its
 * receipt, not just its prose. */
export function receiptLines({ ledger, escrow } = {}) {
  const fmt = (n, d = 6) => Number(n ?? 0).toFixed(d);
  const out = ['', '---', '', '## Settlement receipt', ''];
  out.push(`- Deposited: $${fmt(ledger?.deposited)}`);
  out.push(`- Spent: $${fmt(ledger?.spend)}${Number(ledger?.fee) > 0 ? ` (+$${fmt(ledger?.fee)} protocol fee, taken from the operator share)` : ''}`);
  out.push(`- ${escrow?.jobId && !escrow.splitTx && !escrow.splitConfirmed ? "Refund pending confirmation" : "Refunded"}: $${fmt(ledger?.refunded)}`);
  if (escrow?.jobId) {
    out.push(`- Escrow job ${escrow.jobId} · ${escrow.status || 'settled'}`);
    if (escrow.completeTx) out.push(`- Settle tx: ${escrow.completeTx}`);
    if (escrow.splitTx) out.push(`- Funds tx: ${escrow.splitTx}`);
    else out.push(escrow.splitConfirmed ? '- Funds: split confirmed onchain.' : '- Funds tx: pending (split not yet executed onchain)');
  } else {
    out.push('- Ledger run — no onchain escrow.');
  }
  return out;
}

const xmlEscape = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const mdLines = (md) => String(md || '').replace(/\r\n?/g, '\n').split('\n');

/** Extract ```chart figure blocks from report markdown. Accepts the JSON on
 * the fence line or on following lines (models emit both); malformed blocks
 * are skipped here (the UI keeps them as text — exports never lose data, see
 * flattenFigures). Numbering follows document order: Figure 1, 2, … */
export function extractFigures(markdown) {
  const src = String(markdown || '');
  const out = [];
  const re = /```chart\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(src)) && out.length < 12) {
    try {
      const o = JSON.parse((m[1] || '').trim());
      if (!o || typeof o !== 'object' || !Array.isArray(o.data)) continue;
      const data = o.data.slice(0, 8)
        .map((d) => ({ label: String(d?.label ?? '').slice(0, 48), value: Number(d?.value) }))
        .filter((d) => d.label && Number.isFinite(d.value));
      if (!data.length) continue;
      out.push({
        n: out.length + 1,
        title: String(o.title || '').slice(0, 120),
        unit: String(o.unit || '').slice(0, 24),
        data,
      });
    } catch {
      /* malformed block: skipped as a figure, kept as text below */
    }
  }
  return out;
}

/** Replace chart fences with plain caption + data rows so text renderers
 * (PDF/Word/slides) carry the figures without JSON noise. The .md export
 * keeps raw fences; the .json/.xlsx paths carry structured figures. */
export function flattenFigures(markdown) {
  const figs = extractFigures(markdown);
  if (!figs.length) return String(markdown || '');
  let i = 0;
  return String(markdown || '').replace(/```chart\s*([\s\S]*?)```/g, () => {
    const f = figs[i++];
    if (!f) return '';
    const head = `Figure ${f.n}${f.title ? `: ${f.title}` : ''}${f.unit ? ` (${f.unit})` : ''}`;
    const rows = f.data.map((d) => `- ${d.label}: ${d.value}`).join('\n');
    return `${head}\n${rows}`;
  });
}

// ── Shared markdown → blocks ─────────────────────────────────────────────
// Headings, paragraphs with inline runs, bullet/numbered lists, tables,
// quotes, and code — parsed once so every rich renderer (Word, slides, PDF,
// Excel) works from structure instead of dumping raw markdown lines.
export function parseInline(text) {
  const segs = [];
  const re = /(\*\*.+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`|\[[^\]\n]+\]\([^)\n]+\))/g;
  let last = 0;
  let m;
  const push = (t, extra = {}) => { if (t) segs.push({ t, ...extra }); };
  while ((m = re.exec(String(text || '')))) {
    push(String(text).slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) push(tok.slice(2, -2), { b: true });
    else if (tok.startsWith('*')) push(tok.slice(1, -1), { i: true });
    else if (tok.startsWith('`')) push(tok.slice(1, -1), { code: true });
    else {
      const link = /^\[([^\]\n]+)\]\(([^)\n]+)\)$/.exec(tok);
      if (link) push(link[1], { link: link[2] });
      else push(tok);
    }
    last = m.index + tok.length;
  }
  push(String(text || '').slice(last));
  return segs.length ? segs : [{ t: String(text || '') }];
}

const inlineText = (segs) => (segs || []).map((s) => s.t).join('');

function splitTableRow(line) {
  return String(line).trim().replace(/^\||\|$/g, '').split('|').map((c) => inlineText(parseInline(c.trim())));
}

export function parseBlocks(lines) {
  const blocks = [];
  const src = Array.isArray(lines) ? lines : mdLines(lines);
  let i = 0;
  while (i < src.length) {
    const line = src[i];
    const t = line.trim();
    if (!t) { i += 1; continue; }
    const fence = /^```/.exec(t);
    if (fence) {
      const code = [];
      i += 1;
      while (i < src.length && !/^```/.test(src[i].trim())) { code.push(src[i]); i += 1; }
      i += 1;
      if (code.length) blocks.push({ t: 'code', text: code.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { blocks.push({ t: 'h', level: Math.min(3, h[1].length), text: h[2].trim() }); i += 1; continue; }
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(t)) { blocks.push({ t: 'hr' }); i += 1; continue; }
    if (/^\|.*\|\s*$/.test(t)) {
      const rows = [];
      while (i < src.length && /^\|.*\|\s*$/.test(src[i].trim())) { rows.push(src[i]); i += 1; }
      const isSep = (r) => /^\|?[\s:|-]+\|?[\s:|.-]*$/.test(r.trim()) && /-{2,}/.test(r);
      let head = [];
      let body = rows;
      if (rows.length > 1 && isSep(rows[1])) { head = splitTableRow(rows[0]); body = rows.slice(2); }
      blocks.push({ t: 'table', head, rows: body.map(splitTableRow).filter((r) => r.some((c) => c)) });
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(t);
    if (ul) {
      const items = [];
      while (i < src.length) {
        const m2 = /^[-*]\s+(.*)$/.exec(src[i].trim());
        if (!m2) break;
        items.push(parseInline(m2[1]));
        i += 1;
      }
      blocks.push({ t: 'ul', items });
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ol) {
      const items = [];
      while (i < src.length) {
        const m3 = /^\d+[.)]\s+(.*)$/.exec(src[i].trim());
        if (!m3) break;
        items.push(parseInline(m3[1]));
        i += 1;
      }
      blocks.push({ t: 'ol', items });
      continue;
    }
    if (/^>\s?/.test(t)) {
      const qs = [];
      while (i < src.length && /^>\s?/.test(src[i].trim())) { qs.push(src[i].trim().replace(/^>\s?/, '')); i += 1; }
      blocks.push({ t: 'quote', segs: parseInline(qs.join(' ')) });
      continue;
    }
    blocks.push({ t: 'p', segs: parseInline(t) });
    i += 1;
  }
  return blocks;
}

/** The settlement receipt as blocks (not raw lines) so rich renderers lay it
 * out as a real section. receiptLines() stays for the .md export. */
export function receiptBlocks({ ledger, escrow } = {}) {
  const fmt = (n, d = 6) => Number(n ?? 0).toFixed(d);
  const items = [
    `Deposited: $${fmt(ledger?.deposited)}`,
    `Spent: $${fmt(ledger?.spend)}${Number(ledger?.fee) > 0 ? ` (+$${fmt(ledger?.fee)} protocol fee, taken from the operator share)` : ''}`,
    `${escrow?.jobId && !escrow.splitTx && !escrow.splitConfirmed ? "Refund pending confirmation" : "Refunded"}: $${fmt(ledger?.refunded)}`,
  ];
  if (escrow?.jobId) {
    items.push(`Escrow job ${escrow.jobId} · ${escrow.status || 'settled'}`);
    if (escrow.completeTx) items.push(`Settle tx: ${escrow.completeTx}`);
    if (escrow.splitTx) items.push(`Funds tx: ${escrow.splitTx}`);
    else if(!escrow.splitConfirmed) items.push('Funds tx: pending (split not yet executed onchain)');
  } else {
    items.push('Ledger run — no onchain escrow.');
  }
  return [{ t: 'h', level: 2, text: 'Settlement receipt' }, { t: 'ul', items: items.map(parseInline) }];
}

// ── PDF (pdfkit) ─────────────────────────────────────────────────────────
// Real typesetting: sized headings, wrapped body text with bold/italic/code
// runs, indented bullets, simple ruled tables, page numbers. Standard
// Helvetica covers WinAnsi only, so non-WinAnsi glyphs (arrows, stars,
// checks, emoji) are mapped to ASCII equivalents rather than silently
// dropping to .notdef boxes.
const PDF_SAFE = new Map(Object.entries({
  '→': '->', '←': '<-', '↑': '^', '↓': 'v', '↔': '<->',
  '✓': '[ok]', '✗': '[x]', '✘': '[x]', '★': '*', '☆': '*', '●': '-', '○': '-',
  '“': '"', '”': '"', '‘': "'", '’': "'", '«': '"', '»': '"',
  '—': '--', '–': '-', '…': '...', '•': '-', '·': '-', '×': 'x', '÷': '/',
  '€': 'EUR', '£': 'GBP', '¥': 'JPY',
}));
const pdfSafe = (s) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, (c) => PDF_SAFE.get(c) ?? '?');

function pdfSegs(doc, segs, { size = 11, gap = 6 } = {}) {
  const list = segs && segs.length ? segs : [{ t: '' }];
  list.forEach((s, idx) => {
    const last = idx === list.length - 1;
    doc.font(s.code ? 'Courier' : s.b ? 'Helvetica-Bold' : s.i ? 'Helvetica-Oblique' : 'Helvetica')
      .fontSize(size);
    const opts = last ? {} : { continued: true };
    if (s.link) opts.link = s.link;
    if (s.code) opts.backgroundColor = undefined;
    doc.text(pdfSafe(s.t), opts);
  });
  doc.moveDown(gap / 12);
}

function buildPdf(blocks, { title = 'Dr. Nib report' } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, compress: false, margin: 54, info: { Title: pdfSafe(title), Author: 'Dr. Nib' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const footnote = () => {
      const n = doc.bufferedPageRange().count;
      for (let p = 0; p < n; p += 1) {
        doc.switchToPage(p);
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(8).fillColor('#888888')
          .text(`p. ${p + 1} / ${n}`, 54, doc.page.height - 40, { lineBreak: false, align: 'center', width: doc.page.width - 108 });
        doc.page.margins.bottom = bottom;
        doc.fillColor('#000000');
      }
    };
    let firstH1 = true;
    for (const b of blocks) {
      if (b.t === 'h') {
        if (b.level === 1 && !firstH1) doc.addPage();
        firstH1 = false;
        const size = b.level === 1 ? 20 : b.level === 2 ? 15 : 12.5;
        doc.font('Helvetica-Bold').fontSize(size);
        doc.text(pdfSafe(b.text), { paragraphGap: 4 });
        doc.moveDown(0.35);
      } else if (b.t === 'p' || b.t === 'quote') {
        if (b.t === 'quote') doc.fillColor('#444444');
        pdfSegs(doc, b.segs);
        doc.fillColor('#000000');
      } else if (b.t === 'ul' || b.t === 'ol') {
        b.items.forEach((segs, idx) => {
          const marker = b.t === 'ul' ? '•  ' : `${idx + 1}.  `;
          doc.font('Helvetica').fontSize(11).text(marker, { indent: 18, continued: true, paragraphGap: 2 });
          doc.x += 0;
          pdfSegs(doc, segs, { size: 11, gap: 3 });
        });
        doc.moveDown(0.25);
      } else if (b.t === 'table') {
        const cols = Math.max(b.head.length, ...b.rows.map((r) => r.length), 1);
        const w = (doc.page.width - 108) / cols;
        const y0 = doc.y;
        if (doc.y > doc.page.height - 120) doc.addPage();
        const row = (cells, bold) => {
          let x = 54;
          const y = doc.y;
          let h = 14;
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
          const heights = cells.map((c, ci) => doc.heightOfString(pdfSafe(c), { width: w - 8 }));
          h = Math.max(14, ...heights) + 6;
          if (y + h > doc.page.height - 60) { doc.addPage(); return row(cells, bold); }
          cells.forEach((c, ci) => {
            doc.rect(x + ci * w, y, w, h).stroke('#999999');
            if (bold) doc.rect(x + ci * w, y, w, h).fillOpacity(0.08).fill('#000000').fillOpacity(1);
            doc.text(pdfSafe(c), x + ci * w + 4, y + 3, { width: w - 8 });
          });
          doc.y = y + h;
          doc.x = 54;
        };
        if (b.head.length) row(b.head, true);
        for (const r of b.rows) row(Array.from({ length: cols }, (_, ci) => r[ci] ?? ''), false);
        doc.moveDown(0.5);
        void y0;
      } else if (b.t === 'code') {
        doc.font('Courier').fontSize(9).fillColor('#222222');
        for (const l of String(b.text).split('\n')) doc.text(pdfSafe(l), { paragraphGap: 1 });
        doc.fillColor('#000000');
        doc.moveDown(0.4);
      } else if (b.t === 'hr') {
        doc.moveDown(0.3);
        doc.moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).stroke('#999999');
        doc.moveDown(0.3);
      }
    }
    footnote();
    doc.end();
  });
}

// ── Word (.docx, via the `docx` library) ──────────────────────────────────
// Real Word structure: Heading 1-3 styles, bold/italic/code runs, external
// hyperlinks, bulleted + numbered lists, header-shaded tables. Nothing
// markdown-shaped survives into the document.
function docxRuns(segs) {
  const out = [];
  for (const s of segs || []) {
    if (!s.t) continue;
    if (s.link) {
      out.push(new ExternalHyperlink({
        link: s.link,
        children: [new TextRun({ text: s.t, style: 'Hyperlink', bold: !!s.b, italics: !!s.i })],
      }));
    } else {
      out.push(new TextRun({
        text: s.t, bold: !!s.b, italics: !!s.i,
        font: s.code ? 'Consolas' : undefined,
        shading: s.code ? { fill: 'F2F2F2' } : undefined,
      }));
    }
  }
  return out.length ? out : [new TextRun('')];
}

const docxNumberingConfig = {
  config: [{
    reference: 'drnib-decimal',
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
  }],
};

function docxTable(head, rows) {
  const cell = (text, header) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold: header })] })],
    shading: header ? { fill: 'D9E2F3' } : undefined,
    width: { size: 100 / Math.max(1, Math.max(head.length, ...rows.map((r) => r.length))), type: WidthType.PERCENTAGE },
  });
  const trs = [];
  if (head.length) trs.push(new TableRow({ children: head.map((c) => cell(c, true)), tableHeader: true }));
  for (const r of rows) {
    const width = Math.max(head.length, r.length);
    trs.push(new TableRow({ children: Array.from({ length: width }, (_, i) => cell(r[i] ?? '', false)) }));
  }
  return new Table({ rows: trs, width: { size: 100, type: WidthType.PERCENTAGE } });
}

async function buildDocx(blocks, { title = 'Dr. Nib report' } = {}) {
  const children = [];
  for (const b of blocks) {
    if (b.t === 'h') {
      children.push(new Paragraph({
        heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        children: [new TextRun(b.text)],
      }));
    } else if (b.t === 'p') {
      children.push(new Paragraph({ children: docxRuns(b.segs), spacing: { after: 160 } }));
    } else if (b.t === 'quote') {
      children.push(new Paragraph({
        children: docxRuns(b.segs),
        indent: { left: 720 },
        shading: { fill: 'F2F2F2' },
        spacing: { after: 160 },
      }));
    } else if (b.t === 'ul') {
      for (const item of b.items) children.push(new Paragraph({ bullet: { level: 0 }, children: docxRuns(item) }));
    } else if (b.t === 'ol') {
      for (const item of b.items) children.push(new Paragraph({ numbering: { reference: 'drnib-decimal', level: 0 }, children: docxRuns(item) }));
    } else if (b.t === 'table') {
      if (b.head.length || b.rows.length) children.push(docxTable(b.head, b.rows));
    } else if (b.t === 'code') {
      for (const l of String(b.text).split('\n')) {
        children.push(new Paragraph({ children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 18 })], shading: { fill: 'F2F2F2' } }));
      }
    }
  }
  if (!children.length) children.push(new Paragraph({ children: [new TextRun('')] }));
  const doc = new Document({
    numbering: docxNumberingConfig,
    sections: [{ children }],
    title,
    creator: 'Dr. Nib',
  });
  return Packer.toBuffer(doc);
}

// ── Excel (.xlsx, SheetJS) ───────────────────────────────────────────────
// The report as sections: headings as labeled rows, paragraphs one row
// each, markdown tables as real grids, lists as bulleted rows — plus the
// Claims/Sources/Ledger/Figures evidence sheets.
function buildXlsx({ report, sources, claims, ledger, escrow, figures, blocks = [] }) {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Dr. Nib report', `v${report?.version ?? ''}`],
    ['Exported', new Date().toISOString()],
    [],
  ];
  for (const b of blocks) {
    if (b.t === 'h') rows.push([b.text]);
    else if (b.t === 'p' || b.t === 'quote') rows.push([inlineText(b.segs)]);
    else if (b.t === 'ul') for (const item of b.items) rows.push([`• ${inlineText(item)}`]);
    else if (b.t === 'ol') b.items.forEach((item, i) => rows.push([`${i + 1}. ${inlineText(item)}`]));
    else if (b.t === 'table') {
      if (b.head.length) rows.push(b.head);
      for (const r of b.rows) rows.push(r);
    } else if (b.t === 'code') for (const l of String(b.text).split('\n')) rows.push([l]);
    rows.push([]);
  }
  const reportSheet = XLSX.utils.aoa_to_sheet(rows.length > 3 ? rows : [
    ['Dr. Nib report', `v${report?.version ?? ''}`],
    ['Exported', new Date().toISOString()],
  ]);
  reportSheet['!cols'] = [{ wch: 130 }];
  XLSX.utils.book_append_sheet(wb, reportSheet, 'Report');
  const claimSheet = XLSX.utils.json_to_sheet(
    (claims || []).map((c) => ({ claim: c.text, status: c.status })),
  );
  XLSX.utils.book_append_sheet(wb, claimSheet, 'Claims');
  const sourceSheet = XLSX.utils.json_to_sheet(
    (sources || []).map((s) => ({ title: s.title, url: s.url, domain: s.domain, relevance: s.relevance ?? '', trust: s.trust ?? '' })),
  );
  XLSX.utils.book_append_sheet(wb, sourceSheet, 'Sources');
  const ledgerSheet = XLSX.utils.json_to_sheet([{
    ...(ledger || {}),
    escrowJob: escrow?.jobId || '',
    escrowStatus: escrow?.status || '',
    settleTx: escrow?.completeTx || '',
    fundsTx: escrow?.splitTx || '',
  }]);
  XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Ledger');
  // Figures as data tables: the chart's own numbers, one block per figure —
  // the evidence a reader needs without the picture.
  if ((figures || []).length) {
    const rows = [];
    for (const f of figures) {
      rows.push({ figure: `Figure ${f.n}${f.title ? `: ${f.title}` : ''}${f.unit ? ` (${f.unit})` : ''}`, label: '', value: '' });
      for (const d of f.data || []) rows.push({ figure: '', label: d.label, value: d.value });
      rows.push({ figure: '', label: '', value: '' });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Figures');
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── PowerPoint (.pptx, via pptxgenjs) ─────────────────────────────────────
// A real deck: title slide, one slide per section (headings become slide
// titles, lists become bullets, tables become tables), receipt + key-sources
// closing slides. Long sections paginate into (cont.) slides.
const PPTX_MAX_BODY = 7;

function pptxSegs(segs) {
  return (segs || []).map((s) => ({
    text: s.t,
    options: {
      ...(s.b ? { bold: true } : {}),
      ...(s.i ? { italic: true } : {}),
      ...(s.code ? { fontFace: 'Consolas' } : {}),
      ...(s.link ? { hyperlink: { url: s.link } } : {}),
    },
  }));
}

async function buildPptx({ title, blocks, sources = [], receipt = [], subtitle = '' }) {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'Dr. Nib';

  const cover = pptx.addSlide();
  cover.background = { color: '10110D' };
  cover.addText(title, { x: 0.7, y: 2.2, w: 11.9, h: 1.4, fontSize: 40, bold: true, color: 'F4F4F0', align: 'left' });
  if (subtitle) cover.addText(subtitle, { x: 0.7, y: 3.8, w: 11.9, h: 0.8, fontSize: 18, color: 'B9B2A6' });

  const bodySlide = (slideTitle, items, continued) => {
    const s = pptx.addSlide();
    s.addText(slideTitle + (continued ? ' (cont.)' : ''), { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: '10110D' });
    let y = 1.15;
    for (const item of items) {
      if (item.table) {
        const rows = [
          ...(item.table.head.length ? [[...item.table.head.map((c) => ({ text: String(c), options: { bold: true, fill: { color: 'D9E2F3' } } }))]] : []),
          ...item.table.rows.map((r) => r.map((c) => ({ text: String(c ?? '') }))),
        ];
        const ncols = Math.max(...rows.map((r) => r.length), 1);
        s.addTable(rows, {
          x: 0.5, y, w: 12.3,
          colW: Array.from({ length: ncols }, () => 12.3 / ncols),
          fontSize: 11, border: { type: 'solid', color: '999999', pt: 0.75 },
          margin: 0.05,
        });
        y += 0.45 + rows.length * 0.38;
      } else {
        s.addText(item.text, { x: 0.5, y, w: 12.3, h: 5.5, fontSize: item.code ? 12 : 15, fontFace: item.code ? 'Consolas' : 'Calibri', color: item.muted ? '555555' : '10110D', bullet: item.bullet || undefined, breakLine: true, paragraphSpacing: 6 });
        y += 0.3 + (Array.isArray(item.text) ? item.text.length : 1) * 0.32;
      }
    }
  };

  // Group blocks into sections split on h2 (h1/h3 ride as titled text).
  const sections = [];
  let cur = { title, items: [] };
  const pushText = (text, extra = {}) => {
    const last = cur.items[cur.items.length - 1];
    if (last && last.merge && !last.table && !extra.table) last.text = last.text.concat(text);
    else cur.items.push({ text, merge: true, ...extra });
  };
  for (const b of blocks) {
    if (b.t === 'h' && b.level === 2) {
      if (cur.items.length) sections.push(cur);
      cur = { title: b.text, items: [] };
    } else if (b.t === 'h') {
      pushText([{ text: b.text, options: { bold: true } }]);
    } else if (b.t === 'p' || b.t === 'quote') {
      pushText(pptxSegs(b.segs), b.t === 'quote' ? { muted: true } : {});
    } else if (b.t === 'ul') {
      for (const item of b.items) cur.items.push({ text: pptxSegs(item), bullet: { indent: 18 }, merge: false });
    } else if (b.t === 'ol') {
      b.items.forEach((item, i) => cur.items.push({ text: [{ text: `${i + 1}.  `, options: { bold: true } }, ...pptxSegs(item)], merge: false }));
    } else if (b.t === 'table') {
      if (b.head.length || b.rows.length) cur.items.push({ table: { head: b.head, rows: b.rows }, merge: false });
    } else if (b.t === 'code') {
      pushText([{ text: b.text, options: { fontFace: 'Consolas' } }], { code: true });
    }
  }
  if (cur.items.length) sections.push(cur);
  if (!sections.length) sections.push({ title, items: [{ text: [{ text: '' }], merge: false }] });

  for (const sec of sections) {
    const items = sec.items.length ? sec.items : [{ text: [{ text: '' }], merge: false }];
    for (let k = 0; k < items.length; k += PPTX_MAX_BODY) {
      bodySlide(sec.title, items.slice(k, k + PPTX_MAX_BODY), k > 0);
    }
  }

  if (receipt.length) {
    const s = pptx.addSlide();
    s.addText('Settlement receipt', { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: '10110D' });
    s.addText(receipt.map((r) => ({ text: r, options: {} })), { x: 0.5, y: 1.15, w: 12.3, h: 5.5, fontSize: 15, color: '10110D', bullet: { indent: 18 }, breakLine: true });
  }
  const top = (sources || []).filter((s) => s.url).slice(0, 8);
  if (top.length) {
    const s = pptx.addSlide();
    s.addText('Key sources', { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: '10110D' });
    s.addText(top.map((src) => ({ text: `${src.title || src.url}`, options: { hyperlink: { url: src.url } } })), { x: 0.5, y: 1.15, w: 12.3, h: 5.5, fontSize: 13, color: '0563C1', breakLine: true });
  }
  return pptx.write({ outputType: 'nodebuffer' });
}

/**
 * Render a finished report. Async because the OOXML packages are zipped.
 * Text formats return a string; binary formats return a base64 string with
 * `encoding: 'base64'` and a `bytes` size.
 * @returns {{contentType:string, filename:string, content:string, encoding?:string, bytes:number}}
 */
export async function renderExport(format, ctx) {
  const { report, sources, claims, ledger, escrow, slug = 'report' } = ctx;
  const figures = extractFigures(report?.markdown);
  if (format === 'md') {
    const content = [report?.markdown || '', ...receiptLines({ ledger, escrow })].join('\n');
    return { contentType: 'text/markdown', filename: `${slug}.md`, content, bytes: Buffer.byteLength(content) };
  }
  if (format === 'json') {
    const content = JSON.stringify(packet({ ...ctx, figures }), null, 2);
    return { contentType: 'application/json', filename: `${slug}.json`, content, bytes: Buffer.byteLength(content) };
  }
  if (format === 'bibtex') {
    const content = bibtex(sources);
    return { contentType: 'application/x-bibtex', filename: `${slug}.bib`, content, bytes: Buffer.byteLength(content) };
  }
  // Rich renderers share one parsed structure (flattened chart fences +
  // receipt section) so Word, slides, PDF, and Excel agree with each other.
  // Slides carry the receipt as their own closing slide instead, so the
  // receipt section stays out of the slide body flow.
  const title = ((mdLines(report?.markdown).find((l) => l.trim()) || 'Dr. Nib report').replace(/^#+\s*/, '').slice(0, 120)) || 'Dr. Nib report';
  const bodyBlocks = parseBlocks(mdLines(flattenFigures(report?.markdown)));
  const blocks = [...bodyBlocks, ...receiptBlocks({ ledger, escrow })];
  const receiptText = receiptBlocks({ ledger, escrow }).flatMap((b) => (b.t === 'ul' ? b.items.map(inlineText) : []));
  if (format === 'pdf') {
    const buf = await buildPdf(blocks, { title });
    return { contentType: 'application/pdf', filename: `${slug}.pdf`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  if (format === 'excel') {
    const buf = buildXlsx({ report, sources, claims, ledger, escrow, figures, blocks });
    return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${slug}.xlsx`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  if (format === 'word') {
    const buf = await buildDocx(blocks, { title });
    return { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: `${slug}.docx`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  if (format === 'powerpoint') {
    const buf = await buildPptx({
      title,
      blocks: bodyBlocks,
      sources,
      receipt: receiptText,
      subtitle: `Dr. Nib research report · v${report?.version ?? ''} · exported ${new Date().toISOString().slice(0, 10)}`,
    });
    return { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', filename: `${slug}.pptx`, content: buf.toString('base64'), encoding: 'base64', bytes: buf.length };
  }
  throw new Error(`no renderer for format: ${format}`);
}
